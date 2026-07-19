// Family Money — automatic nightly backup (deploy: supabase functions deploy fam-backup)
// Schedule daily at 02:00 UTC via pg_cron (see migration-015) or Dashboard -> Integrations -> Cron,
// calling this function with the service role key.
//
// What it does, in order:
//   1. Exports EVERY table (service role: all spaces, all users — a true full backup)
//   2. Writes backup-YYYY-MM-DD.json into the private `backups` storage bucket
//   3. Prunes bucket backups older than 60 days
//   4. If the SHAREPOINT_WEBHOOK_URL secret is set, POSTs the file to it
//      (a Power Automate flow that drops it into SharePoint — see BACKUP-AND-RESILIENCE.md)
//
// No admin action required once scheduled.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SP_WEBHOOK = Deno.env.get("SHAREPOINT_WEBHOOK_URL") || "";

const TABLES = [
  "fam_members","fam_accounts","fam_assets","fam_bills","fam_bill_payments",
  "fam_expenses","fam_income","fam_planner_items","fam_debts","fam_debt_payments",
  "fam_budgets","fam_settings","fam_space_grants","fam_notify_prefs","fam_snapshots",
  "profiles","cloud_tasks","user_state","push_subscriptions",
];

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function exportTable(t: string) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SB_URL}/rest/v1/${t}?select=*&limit=1000&offset=${from}`, { headers: H });
    if (!r.ok) return { error: `unreadable (${r.status}) — migration not run?` };
    const batch = await r.json();
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

serve(async () => {
  const started = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const name = `backup-${today}.json`;
  const out: Record<string, unknown> = {
    app: "julius-family-money", kind: "automatic-full-backup",
    exported_at: new Date().toISOString(), tables: {} as Record<string, unknown>,
  };
  for (const t of TABLES) (out.tables as Record<string, unknown>)[t] = await exportTable(t);
  const body = JSON.stringify(out);

  // 2. write to the backups bucket (upsert so a re-run the same day overwrites)
  const up = await fetch(`${SB_URL}/storage/v1/object/backups/${name}`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json", "x-upsert": "true" },
    body,
  });
  const uploaded = up.ok;

  // 3. prune older than 60 days
  let pruned = 0;
  try {
    const lr = await fetch(`${SB_URL}/storage/v1/object/list/backups`, {
      method: "POST", headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 1000 }),
    });
    if (lr.ok) {
      const cutoff = Date.now() - 60 * 86400000;
      const old = ((await lr.json()) as { name: string }[])
        .filter((f) => { const m = /^backup-(\d{4}-\d{2}-\d{2})\.json$/.exec(f.name);
          return m && new Date(m[1] + "T00:00:00Z").getTime() < cutoff; })
        .map((f) => f.name);
      if (old.length) {
        const dr = await fetch(`${SB_URL}/storage/v1/object/backups`, {
          method: "DELETE", headers: { ...H, "Content-Type": "application/json" },
          body: JSON.stringify({ prefixes: old }),
        });
        if (dr.ok) pruned = old.length;
      }
    }
  } catch (_e) { /* pruning is best-effort */ }

  // 4. off-platform copy to SharePoint via Power Automate (best-effort)
  let sharepoint = "not configured";
  if (SP_WEBHOOK) {
    try {
      const sp = await fetch(`${SP_WEBHOOK}${SP_WEBHOOK.includes("?") ? "&" : "?"}filename=${name}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
      });
      sharepoint = sp.ok ? "sent" : `failed (${sp.status})`;
    } catch (e) { sharepoint = `failed (${String(e).slice(0, 80)})`; }
  }

  const rowCount = Object.values(out.tables as Record<string, unknown>)
    .reduce((a: number, v) => a + (Array.isArray(v) ? v.length : 0), 0);
  return new Response(JSON.stringify({
    ok: uploaded, file: name, rows: rowCount, pruned, sharepoint,
    ms: Date.now() - started,
  }), { headers: { "Content-Type": "application/json" }, status: uploaded ? 200 : 500 });
});
