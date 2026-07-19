# Julius Family Money & GTD Console — Project Handbook

**Purpose of this file:** the single orientation document for anyone — a new
Claude conversation or a human developer — continuing work on Rodney Julius's
systems. Read this first; it tells you what exists, how work is done here, and
where every other piece of information lives. This file lives in the
`family-money` repo AND in the Claude Project's knowledge files.

---

## 1. What the system is

| App | Repo (github.com/SalgadosQuinta) | Live | What it is |
|---|---|---|---|
| Julius Family Money | `family-money` | https://money.forgiatus.com | Family/business/farm finance PWA: bills, weekly/day/calendar planner, debts + payback planner, assets register, analysis, admin |
| GTD console | `command-centre` | GitHub Pages | Rodney's productivity console (projects, people, goals with live money metrics, Money summary, Pipeline CRM) |
| Tasks app | `command-centre` `/tasks/` | GitHub Pages | Lightweight task list for assignees (assistant etc.) |

Backend: one Supabase project, ref **`ejlsbydsqjbxfwmvlapm`**
(URL `https://ejlsbydsqjbxfwmvlapm.supabase.co`). Auth, Postgres with RLS,
Storage (`receipts`, `backups` buckets), Edge Functions
(`notify`, `smart-capture`, `admin-users`, `fam-reminders`, `notify-whatsapp`,
`fam-backup`).

## 2. Where the detailed knowledge lives

| Question | Read |
|---|---|
| Architecture, data model, spaces/RLS, client code map, behaviours | `family-money/DOCUMENTATION.md` |
| GTD console + tasks app specifics, WhatsApp notifications | `command-centre/DOCS.md` |
| Backups, restore procedures, SharePoint setup, drill | `family-money/BACKUP-AND-RESILIENCE.md` |
| Database schema, in order | `family-money/supabase/migration-001…015` |
| What was decided and why, in any past session | **Search past conversations in this Claude Project** (see §5) |

## 3. How work is done here (the operating procedure)

Claude works **autonomously end-to-end**: patch → syntax-check every script
block → run the jsdom test suite → bump the service-worker cache version →
commit → `git pull --rebase` → push to `main` → verify the GitHub Pages build
via api.github.com (the sandbox cannot fetch *.github.io directly). Never
deploy with failing tests. Test counts at last update: family-money 285,
command-centre 130.

Non-negotiable conventions (full list in DOCUMENTATION.md §2):
single self-contained `index.html` per app, no frameworks/CDNs; RLS is the
security boundary; migrations are numbered, idempotent, append-only, and
**Rodney runs them / authorises running them — never assume they have run**;
`esc()` on all interpolated HTML; GB English throughout; dark ink/brass theme
(purple=private, green=business, orange=farm); modals close only via
buttons/Escape; updates reach users on the **second reload** (say so).

Working with Rodney: he dictates by voice, so transcripts contain noise — read
charitably, and for large ambiguous requests read back the interpretation
before building. Reply in his style: decision-led, concise, honest about
trade-offs, ending with a numbered task list of anything he must do. Flag
security-relevant items plainly (e.g. tokens in chat history must be revoked
at phase end).

Service-worker versions at last update: family-money v22, gtdcc v25,
tasksapp v11 — grep `sw.js` for the current one and always bump on deploy.

## 4. Current state & outstanding items (as of 19 Jul 2026)

**Done and live:** everything described in the docs — four spaces with grants
and private-space PIN, planner (weeks/day/calendar, recurrence incl. daily,
statement import), debts with payback planner (amount mode + debt-free-by-date
mode), assets register linked to debts, net-worth tracking with snapshots,
admin (members, farm grants, WhatsApp notification prefs, manual/auto backups
UI), GTD Money view + Pipeline + goal metrics + WhatsApp on task events,
tasks-app assignee-only lists + reassignment.

**Outstanding (the current job):**
1. Run migrations **003 → 015** in order on the live database (001–002 done).
2. Deploy Edge Functions **notify-whatsapp** and **fam-backup**; schedule
   fam-backup nightly (02:00 UTC) mirroring how fam-reminders was scheduled;
   test-fire and verify a backup file appears.
3. Rodney: Power Automate flow for the SharePoint backup copy
   (BACKUP-AND-RESILIENCE.md §2a) — he will ask about this separately.
4. **Revoke tokens at phase end:** the GitHub personal access token and the
   Supabase access token both appear in project chat history. When the
   migration/deploy job is confirmed complete, remind Rodney to delete both
   (github.com/settings/tokens and supabase.com/dashboard/account/tokens).

**Supabase Management API access:** allowed domain `api.supabase.com` was
added to Claude's Capabilities settings; a token exists in chat history.
SQL runs via `POST https://api.supabase.com/v1/projects/ejlsbydsqjbxfwmvlapm/database/query`
with `{"query":"…"}`. Take a full data backup BEFORE migrating (our own policy).

**Ideas floated, not commissioned:** farm-staff mini app
(farm.forgiatus.com), savings goals, monthly close push notification,
PIN re-ask timeout option, second-admin split of business-space access.

## 5. For new Claude conversations in this Project

- **This Project's past chats are searchable.** Use the conversation-search
  tools before asking Rodney to repeat anything: search topic keywords
  (e.g. "payback planner", "farm space", "notify-whatsapp") or fetch recent
  chats. The full build history — every decision, migration, and deploy — is
  there.
- **Do not assume capability limits; test them.** Network access, tool
  availability and settings change between sessions. If a fetch fails, report
  the actual error rather than concluding the task is impossible.
- **Repos are the source of truth for code**; clone fresh
  (`git clone https://github.com/SalgadosQuinta/family-money` etc.) rather
  than trusting memory. Another chat may also be editing `command-centre` —
  always `git pull --rebase` before pushing.
- Follow §3's procedure for any change, and end responses with Rodney's
  numbered task list.
