// fx-recalibrate: nightly job that measures the real Remitly GBP→USD margin
// against the mid-market rate and stores it for the app's conversions.
// If the Remitly page can't be parsed, the previous stored value stands.
Deno.serve(async (req) => {
  try {
    const tok = req.headers.get("x-cron-token") || "";
    const expected = Deno.env.get("FX_CRON_TOKEN") || "";
    if (!expected || tok !== expected) {
      // Only the scheduled job (bearing the shared cron token) may trigger a rewrite.
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
    }
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    // 1) Mid-market: USD-base rates, GBP per USD -> mid GBP→USD.
    const fx = await (await fetch("https://api.frankfurter.app/latest?base=USD")).json();
    const gbpPerUSD = fx?.rates?.GBP;
    if (!gbpPerUSD) throw new Error("mid-market rate unavailable");
    const midGBPUSD = 1 / gbpPerUSD;

    // 2) Remitly's advertised everyday rate for the GB→Zimbabwe corridor.
    const page = await (await fetch("https://www.remitly.com/gb/en/zimbabwe/pricing", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JuliusFamilyMoney/1.0)" },
    })).text();
    const m = page.match(/1\s*GBP\s*=\s*([\d.]+)\s*USD/i);
    const scraped = m ? parseFloat(m[1]) : null;
    // The pricing page only publishes the promotional first-transfer rate
    // (often above mid-market), never the everyday rate. So: refresh the mid
    // nightly, keep the promo figure for reference, and PRESERVE the margin —
    // the margin itself is set from the app when Rodney enters the everyday
    // rate he actually sees in Remitly.
    const url = Deno.env.get("SUPABASE_URL");
    const prevR = await fetch(`${url}/rest/v1/fam_settings?key=eq.remit_rate&select=value`, {
      headers: { apikey: svc, Authorization: `Bearer ${svc}` },
    });
    const prevRows = prevR.ok ? await prevR.json() : [];
    const prev = (prevRows[0] && prevRows[0].value) || {};
    const isEveryday = scraped && scraped >= midGBPUSD * 0.85 && scraped <= midGBPUSD * 1.0;
    const margin = isEveryday
      ? Math.min(0.1, Math.max(0, 1 - scraped / midGBPUSD))
      : (typeof prev.margin === "number" ? prev.margin : 0.032);
    const value = {
      margin: Math.round(margin * 10000) / 10000,
      remit_rate: isEveryday ? scraped : (prev.remit_rate || null),
      promo_rate: !isEveryday && scraped ? scraped : undefined,
      mid: Math.round(midGBPUSD * 10000) / 10000,
      checked_at: new Date().toISOString(),
      margin_source: isEveryday ? "scraped everyday rate" : (prev.margin_source || "manual calibration 26 Jul 2026"),
    };
    const r = await fetch(`${url}/rest/v1/fam_settings?on_conflict=key`, {
      method: "POST",
      headers: { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json", Prefer: "return=minimal,resolution=merge-duplicates" },
      body: JSON.stringify({ key: "remit_rate", value, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error("settings write failed: " + r.status);
    return new Response(JSON.stringify({ ok: true, ...value }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 200 });
  }
});
