// Family Money — scheduled reminders (deploy: supabase functions deploy fam-reminders)
// Schedule daily at 08:00 via Supabase Dashboard -> Integrations -> Cron (or pg_cron),
// calling this function with the service role key.
// Sends: bills due within 2 days / overdue -> responsible member;
//        debt payments due within 2 days  -> owner member (or admins).
// Delivery reuses the existing `notify` edge function so push logic lives in one place.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function q(path: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!r.ok) throw new Error(`query failed: ${path} ${r.status}`);
  return r.json();
}

async function notify(user_id: string, title: string, body: string) {
  await fetch(`${SB_URL}/functions/v1/notify`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id, title, body, url: "https://money.forgiatus.com/" }),
  }).catch(() => {});
}

serve(async () => {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  let sent = 0;

  const bills = await q(
    `fam_bills?select=name,amount,currency,due_date,responsible&archived=eq.false&due_date=lte.${soon}&responsible=not.is.null`
  );
  for (const b of bills) {
    const overdue = b.due_date < today;
    await notify(
      b.responsible,
      overdue ? "Bill overdue" : "Bill due soon",
      `${b.name} (${b.currency} ${Number(b.amount).toFixed(2)}) ${overdue ? "was" : "is"} due ${b.due_date}.`
    );
    sent++;
  }

  const dom = new Date().getDate();
  const debts = await q(
    `fam_debts?select=name,min_payment,currency,due_day,owner_member,balance&archived=eq.false&balance=gt.0&due_day=not.is.null`
  );
  const admins = await q(`fam_members?select=user_id&role=eq.admin`);
  for (const d of debts) {
    const gap = d.due_day - dom;
    if (gap < 0 || gap > 2) continue;
    const targets = d.owner_member ? [d.owner_member] : admins.map((a: any) => a.user_id);
    for (const t of targets) {
      await notify(
        t,
        "Debt payment due",
        `${d.name} payment${Number(d.min_payment) ? ` of ${d.currency} ${Number(d.min_payment).toFixed(2)}` : ""} is due on day ${d.due_day}.`
      );
      sent++;
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { "Content-Type": "application/json" },
  });
});
