# Julius Family Money & GTD Console — Project Handbook

**Purpose:** the single orientation document for any new Claude conversation (or
human developer) continuing work on Rodney Julius's systems. Read this first.
This file lives in the `family-money` repo AND in the Claude Project's
knowledge files — when you materially change the system, update both.
Credentials live in a separate `CREDENTIALS.md` in the Project knowledge only —
**never in any repo** (GitHub auto-revokes access tokens it finds in pushes).

---

## 1. What the system is

| App | Repo (github.com/SalgadosQuinta) | Live | Current SW / build |
|---|---|---|---|
| Julius Family Money | `family-money` | https://money.forgiatus.com | family-money-v62 / APP_BUILD v62 |
| GTD console | `command-centre` | GitHub Pages | gtdcc-v46 |
| Tasks app | `command-centre` `/tasks/` | GitHub Pages `/tasks/` | tasksapp-v18 |

Backend: one Supabase project, ref **`ejlsbydsqjbxfwmvlapm`** (eu-central-1,
PG17). Auth, Postgres with RLS, Storage (`receipts`, `backups`), Edge Functions:
`notify`, `smart-capture` (v9: task + finance modes, images + PDFs),
`admin-users`, `fam-reminders`, `notify-whatsapp`, `fam-backup`,
`fx-recalibrate` (nightly Remitly-margin/mid refresh).

Scheduled jobs (pg_cron, all Vault-authenticated, no secrets in job commands):
fam-reminders-daily 08:00 · fam-backup-nightly 02:00 · fx-recalibrate-daily 03:00 UTC.

## 2. Where the detailed knowledge lives

| Question | Read |
|---|---|
| Architecture, data model, spaces/RLS, client code map | `family-money/DOCUMENTATION.md` + `ARCHITECTURE-DETAILED.md` (Project knowledge) |
| GTD console + tasks app, WhatsApp | `command-centre/DOCS.md` |
| Backups, restore, SharePoint mirror (still unconfigured) | `family-money/BACKUP-AND-RESILIENCE.md` |
| Database schema, in order | `family-money/supabase/migration-001…020` (ALL RUN as of 26 Jul 2026) |
| Any past decision | **Search this Project's past conversations** — the full build history is there |
| Bootstrapping a brand-new Project | `AUTONOMOUS-BUILD-SETUP.md` (Project knowledge) |

## 3. Operating procedure (non-negotiable)

Work autonomously end-to-end: clone fresh → patch → `node --check` every script
block → jsdom suite green (**read the tally to the END — this rule has been
violated twice and both times shipped a break**) → bump SW cache **and**
APP_BUILD in lockstep → commit → `git pull --rebase` → push `main` → verify the
Pages build via api.github.com; if it shows `errored` or lags, `POST
/repos/<o>/<r>/pages/builds` and re-check (transient errors are common; one
retry fixes them).

Database changes: full JSON backup via Management API first → numbered
idempotent migration file → **Rodney authorises before running** →
`NOTIFY pgrst, 'reload schema';` as a separate call → verification query.

Conventions: single self-contained `index.html` per app, no frameworks/CDNs;
RLS is the boundary; `esc()` on all interpolated HTML; GB English; dark
ink/brass theme (purple=private, green=business/incoming, orange=farm,
red=out/overdue); modals close only via buttons/Escape; updates reach users on
the second reload — say so; every new interactive control gets a **full-app
jsdom click-through test** (twice controls shipped "rendered but dead" because
the handler sat in the wrong bind block).

Working with Rodney: voice dictation — read charitably, read back big ambiguous
asks. Replies decision-led and concise, ending with a numbered task list of
anything he must do. Flag security items plainly.

## 4. Current state (26 Jul 2026)

**Live and green (438 fm / 207 cc tests):** four spaces + PIN; Income tab with
received-tracking; Budgets tab (category bars + standalone GBP "Nationwide
Buffer" pot, add/take with movement log, figure on dashboard); planner —
rolling 4-week board (current week first, ◀▶, label-reset), Day/Week/Calendar,
rollover of unpaid items with red OVERDUE treatment, "+ debt payment"
(record/plan/tick/undo), **single-GBP Remaining** (USD converted at the
Remitly-calibrated rate) with week-to-week carry-over chain; debts — statement
modal (opening, payments, borrowings kind='borrow', running balances,
month/week bands, per-row Undo, record from statement, retroactive dating);
AI capture: photos + PDFs → smart-capture finance mode → review; dashboard top
stats (net worth + total debt single USD, buffer native GBP), Committed-30d
next, debt-payback chart last; currency model USD+GBP only, ZWG removed;
remit margin stored in fam_settings 'remit_rate' (client card on Budgets tab
recalibrates from the everyday rate; nightly job refreshes the mid; margin
3.2% calibrated 26 Jul); two-tier admin (admin/manager/member, migration 020);
GTD console: scheduled time + Outlook deep-link, mobile photo capture with
downscaling, All-outstanding view with groupings, overdue prominence
everywhere. Session refresh is single-flight; storage self-heals; boot
watchdog + blank-screen phase-two + render fault isolation + build-stamped
caches ended the blank-screen saga (root cause: fm_plmode='cal' + unguarded
plMonth).

**Open items:**
1. Rodney: revoke + reissue tokens when the build month ends (see CREDENTIALS.md).
2. SharePoint backup mirror unconfigured (BACKUP-AND-RESILIENCE.md §2a).
3. Deferred pending clarification: "delete recently-added bills" tool + import
   rule skipping bills last-paid >1 month ago — DB showed no duplicates;
   confirm where he saw them before building anything destructive.
4. Ideas floated, not commissioned: farm-staff mini app, savings goals,
   monthly-close push, PIN re-ask timeout, Meta WhatsApp switch, Graph
   auto-sync for Outlook.

## 5. Hard-won lessons (do not relearn)

1. `NOTIFY pgrst, 'reload schema'` after every DDL via the Management API.
2. Read the test tally to the end before pushing.
3. Any replay/refresh path needs a mutex/single-flight (offline outbox AND
   token refresh both duplicated/raced without one).
4. Key caches per user AND per build; cap payload size; evict oldest on quota.
5. Deadlines at every network layer; stale cache beats absent data,
   except cross-build where absent beats wrong-shape.
6. Make failure visible and self-describing (watchdog, probes, red banners,
   Copy diagnostics) — it turned days of guessing into one screenshot.
7. Instrument before speculating; replay real production data in jsdom.
8. localStorage-persisted UI modes are boot inputs — guard them.
9. Wire new controls in the correct bind block and prove it with a
   click-through test.
10. Pages builds: webhook lags and transient failures are normal — request
    builds explicitly and retry once.
