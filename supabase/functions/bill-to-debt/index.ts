// bill-to-debt — reads a bill (name, amount, notes, category) and proposes the
// fields for a debt record. Some entries were captured as bills when they were
// really borrowings; the useful signal is usually sitting in the notes, in
// Rodney's own words ("owe Phil 8500, repay by end of Sept", "Barclaycard
// arrears, £96.45 a month on the 4th").
//
// The model proposes; the person confirms. Nothing is written here — the client
// shows a review form and does the writing under the caller's own RLS.
//
// Input : { bill: {name, amount, currency, due_date, recurrence, category, notes}, today }
// Output: { proposal: {...debt fields}, notes_used: boolean, reasoning: string }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SYSTEM = `You convert a household "bill" record into a "debt" record.

A bill is a recurring or one-off cost. A debt is money owed with an outstanding
balance that reduces as it is repaid — a loan from a person, a credit card
balance, arrears, a settlement agreement.

You are given the bill's fields. The notes field is the most important: it is
written informally by the account holder and usually states who is owed, how
much in total, what is repaid each month, and any agreed settlement date.

Return ONLY a JSON object. No prose, no markdown fences. Shape:

{
  "name": string,               // short name for the debt, e.g. "Phil" or "Barclaycard"
  "lender": string|null,        // who the money is owed to, if named
  "principal": number|null,     // original amount borrowed, if stated
  "balance": number,            // amount still owed. If the notes give a total owed, use it.
                                // Otherwise fall back to the bill amount.
  "currency": string,           // ISO code, GBP or USD. Use the bill's currency unless
                                // the notes clearly state another.
  "interest_rate": number|null, // annual percentage, if stated
  "min_payment": number|null,   // agreed repayment per month, if stated
  "due_day": number|null,       // day of the month repayments fall due, 1-31, if stated
  "payoff_date": string|null,   // "YYYY-MM-DD" if a single settlement date is agreed
  "payoff_amount": number|null, // amount due on that date if it differs from the balance
  "notes": string|null,         // carry across anything worth keeping, tidied
  "confidence": "high"|"medium"|"low",
  "reasoning": string           // one short sentence: what in the notes you relied on
}

Rules:
- Never invent figures. If the notes do not state something, use null.
- Distinguish the total owed from the monthly repayment. "£8,500 owed, £200 a
  month" means balance 8500 and min_payment 200, not balance 200.
- A month name without a year means the next occurrence from today's date.
- If the notes suggest this is genuinely a recurring cost and not money owed,
  still fill the fields as best you can but set confidence to "low" and say so
  in reasoning.
- Dates must be YYYY-MM-DD. Amounts must be plain numbers, no symbols or commas.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'ANTHROPIC_API_KEY is not configured' }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const bill = body?.bill || {};
  const today = body?.today || new Date().toISOString().slice(0, 10);
  if (!bill.name && !bill.notes) return json({ error: 'Nothing to analyse — the bill has no name or notes.' }, 400);

  const described = [
    'Today is ' + today + '.',
    'Bill name: ' + (bill.name || '(none)'),
    'Amount: ' + (bill.amount ?? '(none)') + ' ' + (bill.currency || ''),
    'Due date on the bill: ' + (bill.due_date || '(none)'),
    'Recurrence: ' + (bill.recurrence || 'none'),
    'Category: ' + (bill.category || '(none)'),
    'Notes: ' + (bill.notes ? String(bill.notes) : '(none)'),
  ].join('\n');

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: SYSTEM,
        messages: [{ role: 'user', content: described }],
      }),
    });
  } catch (e) {
    return json({ error: 'Could not reach the analysis service: ' + (e as Error).message }, 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return json({ error: 'Analysis service returned ' + res.status, detail: detail.slice(0, 400) }, 502);
  }

  const data = await res.json().catch(() => null);
  const text = (data?.content || [])
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim();

  let proposal: any = null;
  try {
    proposal = JSON.parse(text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim());
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { proposal = JSON.parse(m[0]); } catch { /* fall through */ } }
  }
  if (!proposal || typeof proposal !== 'object') {
    return json({ error: 'Could not read a usable proposal from the notes.' }, 502);
  }

  return json({
    proposal: proposal,
    notes_used: !!bill.notes,
    reasoning: typeof proposal.reasoning === 'string' ? proposal.reasoning : '',
  });
});
