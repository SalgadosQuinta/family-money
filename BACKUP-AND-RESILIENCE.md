# Julius Family Money — Backup & Resilience Policy

**Objective:** if anything is lost — a table, the database, an account, a laptop —
the family's financial records are recoverable to a point **no more than 24 hours
old**, and the system is usable again **within 2 hours**.

- **RPO (max acceptable data loss): 24 hours** (1 hour once Supabase PITR is enabled)
- **RTO (max acceptable downtime): 2 hours**

---

## 1. What exists, and where it is already safe

| Asset | Where it lives | Protection today |
|---|---|---|
| Application code (all 3 apps) | GitHub (`family-money`, `command-centre`) | Every deploy is a commit; full history. GitHub is the backup. |
| Database schema | `supabase/` migration files in git | Rebuildable from scratch by running 001→014 in order |
| Edge Function code | Both repos under `supabase/functions/` | In git |
| **The data** (all `fam_*`, `cloud_tasks`, `profiles`, `push_subscriptions`, GTD `user_state`) | Supabase Postgres | **Only as protected as this policy — act below** |
| Receipts / task images | Supabase Storage `receipts` bucket | Ditto |
| Auth users (logins) | Supabase Auth (in Postgres) | Included in Supabase backups |

The single point of failure is the Supabase project. Everything below is about that.

## 2. Backup layers (defence in depth)

**Layer 1 — Supabase automated backups (primary).**
Supabase Pro includes automated **daily backups (7-day retention)**; Point-in-Time
Recovery (WAL, restore to any minute) is available as an add-on.
**Policy: the project runs on Pro or above.** This is the backbone: zero effort,
covers Postgres including auth. Action once: dashboard → Settings → confirm plan,
and enable PITR if the budget allows (drops RPO to ~1 hour).

**Layer 2 — Automatic nightly full export (secondary, zero admin effort).**
The `fam-backup` Edge Function runs every night at **02:00 UTC** (pg_cron,
migration 015): a service-role export of **every table** (all spaces, all users,
including GTD `cloud_tasks`/`user_state`) written to the private `backups`
storage bucket as `backup-YYYY-MM-DD.json`, with **60-day retention**
self-pruned. Admins see and download these under **Admin → Backups**.
If configured (§2a), each night's file is also pushed **off-platform to
SharePoint** — that copy is what protects against loss of the Supabase project
itself. Manual export remains one click for the **before-any-migration** snapshot.

### 2a. SharePoint off-platform copy — one-off setup (~10 minutes)
The function POSTs the backup JSON to a URL you give it; a Power Automate flow
receives it and files it in SharePoint. No code, no Azure app registration:
1. Power Automate (make.powerautomate.com, business M365 account) → **Create →
   Instant cloud flow → skip → add trigger "When an HTTP request is received"**
   (method POST, who can trigger: Anyone with the URL — the URL itself contains
   an unguessable signature).
2. Add action **SharePoint → Create file**: pick the site, folder
   `Documents/julius-money-backups`, File Name expression:
   `triggerOutputs()?['queries']?['filename']`, File Content expression:
   `triggerBody()`.
3. Save; copy the generated **HTTP POST URL**.
4. Supabase dashboard → **Edge Functions → fam-backup → Secrets** → add
   `SHAREPOINT_WEBHOOK_URL` = that URL. Done — next night's run reports
   `"sharepoint": "sent"`.
Treat the flow URL as a secret (anyone holding it can write files to that
folder — nothing more). Alternative for the future: direct Microsoft Graph
upload from the function (needs an Azure AD app + client credentials); the
webhook route is deliberately chosen for simplicity.

**Layer 3 — Receipts archive (monthly).**
Storage bucket contents change slowly. Monthly, download the `receipts` bucket
(dashboard → Storage → select all → download) into the same cloud folder,
`receipts-YYYY-MM.zip`. Keep the latest 3.

**Layer 4 — GTD data.**
The GTD console's own data (projects, tasks, notes) lives in its local data file
*and* syncs to `user_state` in the same Postgres — so Layer 1 covers it. Its
Settings view also offers manual file backups; take one whenever Layer 2 runs.

## 3. Backup calendar (the whole policy on one line each)

| When | Action | Who |
|---|---|---|
| Continuous | Code committed to GitHub on every change | Claude/dev |
| Daily, automatic | Supabase Pro backup | Supabase |
| **Nightly 02:00 UTC, automatic** | fam-backup → `backups` bucket (+ SharePoint copy) | Nobody — it just runs |
| Before ANY migration | Admin → Backups → manual JSON export | Whoever migrates |
| Monthly (1st) | Receipts bucket zip → cloud folder | Rodney |
| Quarterly | **Restore drill** (see §5) | Rodney + Claude |

## 4. Restore procedures

### A. Something was deleted or corrupted just now (most common)
1. Do not keep working in the affected space — data written after the incident
   may be overwritten by a restore.
2. **If PITR is enabled:** dashboard → Database → Backups → Restore → pick the
   minute before the incident. Done (expect minutes of downtime). RPO ≈ 0.
3. **If daily backups only:** restore yesterday's backup the same way — accept
   up to 24h of re-entry — **or**, for a small blast radius (one table / a few
   rows), restore surgically from the latest JSON export instead: open the file,
   find the rows, re-insert via SQL Editor (`insert into fam_bills (…) values (…)`)
   or hand the JSON to Claude to script the re-insert. Surgical restore avoids
   rolling back unaffected tables.

### B. The whole Supabase project is lost
1. Create a new Supabase project. Note its URL + anon key.
2. Run migrations **001 → 014 in order** from `family-money/supabase/`
   (001 needs the admin email edited as documented in the file).
3. Redeploy the five Edge Functions from the repos; re-schedule the
   `fam-reminders` cron (pg_cron + pg_net, as per fam-reminders comments).
4. Re-create auth users (Admin → members re-invites; users set new passwords).
5. Import the latest JSON export: hand it to Claude (or any developer) to
   generate `insert` statements per table, in this order to satisfy references:
   accounts → assets → bills → payments → expenses → income → planner_items →
   debts → debt_payments → budgets → settings → grants → notify_prefs.
   (Snapshots may be skipped; history restarts.)
6. Point both apps at the new project: `SUPABASE_URL`/`ANON_KEY` at the top of
   each `index.html`, commit, deploy. DNS does not change.
7. Re-upload the latest receipts zip to a new `receipts` bucket (private).

### C. GitHub is lost (or the repo is damaged)
Any machine with a recent clone has full history (`git push` to a fresh repo).
The live site itself *is* a copy of the built app: view-source → save →
recommit. DNS: `money.forgiatus.com` CNAME → `salgadosquinta.github.io`.

## 5. Quarterly restore drill (this is what makes the policy real)

A backup that has never been restored is a hope, not a backup. Every quarter:
1. Take a fresh JSON export.
2. Pick three random rows (a bill, a debt, an asset); delete them in a test
   fashion (note their values first) — or simply verify them against the export
   without deleting if nerves demand.
3. Restore them from the export via SQL Editor.
4. Record in a note: date, time taken, anything that was unclear. Fix the
   unclear thing in this document.
Also confirm during the drill: last night's automatic file exists in Admin → Backups AND in SharePoint. Target: the drill takes under 30 minutes. If it takes longer, the procedure —
not the person — is at fault; improve it.

## 6. Resilience beyond backups

- **Two admins beats one.** A second family admin (trusted) means account
  recovery does not hinge on a single login. Weigh against business-space
  visibility (business is admin-only by design) — if appointed, ask Claude to
  split business access onto its own flag first.
- **Password manager + Supabase account 2FA** for the owner login: the most
  likely real-world failure is credential loss, not database loss.
- **Tokens are ephemeral:** GitHub / Supabase access tokens created for build
  work are revoked at the end of each build phase. Standing item.
- **The apps fail soft:** if Supabase is briefly down, the service worker still
  serves the shell; data returns when connectivity does. No action needed.
