# Family Money

Forgiatus family finance app — bills, expenses and commitments. Part of the Forgiatus platform (Supabase backend shared with Rodney GTD / Tasks).

- Single self-contained `index.html` — no frameworks, no build step, no CDNs.
- PWA: `manifest.webmanifest`, `sw.js` (versioned cache — bump `CACHE` on every deploy; updates land on the second reload).
- Backend: shared Supabase project; all tables prefixed `fam_`, RLS enforced via `fam_is_member()` / `fam_is_admin()`.
- Receipts stored in the existing private `receipts` bucket under `{user_id}/fam-...`, viewed via signed URLs.
- Domain: served at `salgadosquinta.github.io/family-money/` until the `CNAME` (money.forgiatus.com) is committed on request.

## Migrations
Run files in `supabase/` in order via the Supabase SQL Editor. They are safe to re-run.
**migration-001**: edit the email in section 6 before running (bootstraps the admin).

## Tests
```
npm install jsdom
node tests/run-tests.js
```
