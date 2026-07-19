# Julius Family Money — Developer Documentation

**Live app:** https://money.forgiatus.com · **Repo:** github.com/SalgadosQuinta/family-money
**Owner:** Rodney Julius. **Status:** production, actively used by the Julius family.

This document is written for a human developer who has never seen the system.
Read it top to bottom once; after that, the section headings serve as a reference.

---

## 1. The ecosystem

Three single-file web apps share one Supabase project (`ejlsbydsqjbxfwmvlapm`):

| App | Repo | URL | Purpose |
|---|---|---|---|
| **Julius Family Money** | family-money | money.forgiatus.com | Family/business/farm finances: bills, planner, debts, assets, analysis |
| **GTD console** | command-centre | (GitHub Pages) | Rodney's personal productivity console; includes a live Money summary and Pipeline (CRM) |
| **Tasks app** | command-centre `/tasks/` | (GitHub Pages) | Lightweight task list for assignees (e.g. the assistant) |

Shared infrastructure: Supabase **Auth** (email+password), **Postgres** with row-level
security, **Storage** (`receipts` bucket, private), **Edge Functions**
(`notify` push, `smart-capture` AI, `admin-users`, `fam-reminders` cron,
`notify-whatsapp` CallMeBot gateway).

Users are Supabase auth users with a row in `profiles`. Family membership is a
*separate* concept (`fam_members`); task-only people (e.g. Brandon) have profiles
but are not family members.

## 2. Architecture principles (do not break these)

1. **One self-contained `index.html` per app.** No frameworks, no build step, no
   CDNs. Vanilla JS (ES5-flavoured in family-money), inline CSS. This is a
   deliberate resilience choice: the app can be read, audited and fixed with a
   text editor forever.
2. **All state lives in Supabase; the client is disposable.** localStorage holds
   only session tokens and UI preferences (space, planner mode, PIN hash).
3. **Security is enforced in Postgres (RLS), never merely in the UI.** The
   client hides what you cannot use, but the database refuses what you may not do.
4. **Migrations are numbered, idempotent (`if not exists` / `drop policy if exists`),
   append-only** files in `supabase/`. Never edit an old migration; add a new one.
5. **Every deploy:** run tests (`node tests/run-tests.js`, must be green), bump the
   service-worker cache name (`family-money-vN` in `sw.js`), commit, push to `main`.
   GitHub Pages serves it. Clients pick up a new version on the **second** reload.

## 3. Data model (Postgres, all tables prefixed `fam_`)

Core (migration 001): `fam_members` (user_id, role admin|member),
`fam_bills` (name, amount, currency, due_date, recurrence none|weekly|monthly,
category, responsible, receipt_path…), `fam_bill_payments`, `fam_expenses`.

Planner (002, 010, 011): `fam_income` and `fam_planner_items` — anchored to a
week (`week_date`, always a **Friday**) and optionally an exact day (`on_date`).
`recurrence` none|daily|weekly|monthly; recurring income materialises forward
via `series_id` (see §5.4).

Money structure (003, 004, 012, 013): `fam_accounts` (money held by people /
in transit — **not** bank reconciliation), `fam_budgets`, `fam_debts`
(principal, balance, interest_rate APR %, min_payment, due_day, asset_backed,
`asset_id` → `fam_assets`, or manual asset_name/value fallback),
`fam_debt_payments`, `fam_assets` (the register: name, category/class,
owner, currency, value, valued_at).

Tracking (005): `fam_snapshots` — daily value snapshots per kind
(`networth`/`asset`/`debt`) per space, written on first open each day; feeds
the trend charts.

Settings & access (006–009, 014): `fam_settings` (key/value, e.g.
`manual_rates` for ZWG), `fam_space_grants` (farm access grants),
`fam_notify_prefs` (per-user WhatsApp config, admin-managed).

### Spaces
Every money table has `space` ∈ `family | private | business | farm` and
`space_owner` (used by `private`). Visibility (`fam_can_see`) and management
(`fam_can_manage`) are SQL functions used by all policies:

- **family** — every member sees; admins manage shared config.
- **private** — only the owning user. The UI additionally demands a PIN on
  every entry (client-side deterrent for shared devices; RLS is the real wall).
- **business** — admins only (currently Rodney).
- **farm** ("TRJ Farms") — admins plus users granted in `fam_space_grants`.

## 4. Client structure (`index.html`)

Single `<script>` (~large). Orientation map, in file order:

- **Config/helpers:** `SUPABASE_URL`, `ANON_KEY`, `$()`, `esc()` (ALWAYS used
  when interpolating data into HTML), date helpers (`todayISO`, `isoOf`,
  `fridayOf`, `shiftMonth`), `fmtMoney`.
- **API layer:** `apiJSON(path, opts)` — fetch wrapper adding auth headers,
  one automatic retry after a 401 via refresh-token.
- **State:** a single `state` object (session, isAdmin, space, all loaded rows,
  editing pointers, UI modes).
- **Spaces:** `currentSpace`, `spaceFilter` (adds `&space=eq.…` to reads),
  `spaceBody` (stamps writes), `setSpace`, `goToSpace` (dropdown), `switchSpace`
  (cycle), `requireSpacePin` (private gate), `moveSpace` (family↔private bridge).
- **Loaders:** `loadBills`, `loadPlanner` (also materialises recurring income),
  `loadDebts`, `loadAssets`, `loadSnapshots`, `loadNotifyPrefs`, etc.
- **Renderers:** one per view (`renderBills`, `renderPlanner`, `renderCalendar`,
  `renderDay`, `renderDebts`, `renderPayback`, `renderPaybackDate`,
  `renderAssets`, `renderNetWorth`, `renderAnalysis`, `renderAdmin`) +
  `renderAll`.
- **Maths:** `payoffPlan(balance, apr, payment, periodsPerYear)`,
  `requiredPayment(balance, apr, n, ppy)` (annuity), `periodsUntil`,
  `netWorth()` (register assets + *unlinked* manual debt-asset values − debt
  balances; accounts deliberately excluded), `calendarFlows`.
- **Features:** statement import (`parseCSV`, `detectRecurring` — monthly
  pattern heuristic), AI capture (smart-capture function + review modal),
  notifications (push subscribe + on-open due checks), snapshots.
- **Boot:** session restore → `loadAll` → membership check → `boot()` (PIN
  gates, space restore, render, snapshot).
- **Exports:** `window.App = {…}` exposes functions for the test harness.
  When adding a function a test needs, export it here.

Styling: CSS variables at the top (`--ink #0f1216`, `--panel`, `--brass #c9a227`,
`--purple` private, `--green` business, `--farm #d98a3d`). Space accent applied
via `data-space` attribute on `<html>`.

## 5. Behaviours worth knowing before touching code

1. **Weeks are Fridays.** `weeksOfMonth(ym)` returns the Fridays of a month;
   week-anchored entries surface on their Friday in Calendar/Day views.
2. **Recurring bills:** marking a bill paid with recurrence set rolls
   `due_date` forward. Recurring **planner items** spawn the next instance when
   ticked paid. Recurring **income** auto-materialises forward from the *latest*
   instance up to the end of next month (deleting a middle week therefore
   stays deleted — that is the skip-a-week feature). Daily series cap at 31
   instances per load.
3. **Statement import** proposes only outgoings seen in ≥2 months, ≤1.5×/month,
   amounts within a 35% band; skips names matching existing bills.
4. **Net worth never counts a linked asset twice:** if `debts.asset_id` is set,
   the value comes from the register only. Equity is only shown when debt and
   asset share a currency.
5. **PIN:** SHA-256 hash in localStorage (`fm_pin`), per-device, demanded on
   every entry to `private`. It is a deterrent, not encryption — say so honestly
   if asked.
6. **Service worker:** cache-first; bump `family-money-vN` every deploy or
   clients keep the old app. Updates land on the second reload.

## 6. GTD console & tasks app (command-centre repo)

See `command-centre/DOCS.md` for detail. Integration points with this app:
- **Money view** reads `fam_*` tables directly (same auth) for per-space
  summaries; **goal money metrics** read `fam_debts` and month flows.
- **WhatsApp notifications:** GTD reads `fam_notify_prefs` (admin-managed in
  either app) and calls the `notify-whatsapp` Edge Function on task events
  (`task_assigned` default-on, `task_updated` opt-in).

## 7. Edge Functions (deployed via Supabase dashboard)

| Function | Purpose | Source of truth |
|---|---|---|
| notify | Web-push to `push_subscriptions` | command-centre repo |
| smart-capture | AI text → structured bills/income proposals | command-centre repo |
| admin-users | Member management without SQL | command-centre repo |
| fam-reminders | Cron (pg_cron + pg_net): due-bill push reminders | family-money repo |
| notify-whatsapp | CallMeBot WhatsApp gateway | command-centre repo `supabase/functions/` |

## 8. Testing & deploying

```
cd family-money
node tests/run-tests.js     # jsdom + mocked fetch; must end "N passed, 0 failed"
# bump family-money-vN in sw.js
git add -A && git commit -m "…" && git pull --rebase origin main && git push
```
Tests live in `tests/run-tests.js`: a mocked Supabase (`mockFetch`/`DB`),
JSDOM boots the real `index.html`, suites assert on rendered DOM and captured
requests. Helper `cycleSpace(dom, A)` answers PIN prompts with `1234`.
**Never deploy red.** Add tests with every feature; they are the specification.

## 9. Operational notes

- **Migrations pending vs run:** the app fails soft (empty lists / "unavailable"
  messages) when a table is missing. If a feature will not save, check the
  migration list in `supabase/` against what has been run.
- **Secrets:** the anon key in the client is public by design (RLS protects
  data). Personal access tokens (GitHub, Supabase) must be revoked after use.
- **Backups & restore:** see `BACKUP-AND-RESILIENCE.md`.
