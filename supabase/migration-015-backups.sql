-- Family Money — migration 015
-- Automatic backups: private storage bucket + admin download access + nightly cron.
-- Requires the fam-backup Edge Function to be deployed, and (as already enabled
-- for fam-reminders) the pg_cron and pg_net extensions.
-- Safe to re-run.

-- 1. Private bucket for backup files
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

-- 2. Admins can list and download backups from the app.
--    (The fam-backup function writes with the service role, which bypasses RLS,
--     so no insert policy is needed — nobody else can write.)
drop policy if exists fam_backups_admin_read on storage.objects;
create policy fam_backups_admin_read on storage.objects for select
  using (bucket_id = 'backups' and public.fam_is_admin());

-- 3. Nightly schedule at 02:00 UTC
select cron.unschedule('fam-backup-nightly')
where exists (select 1 from cron.job where jobname = 'fam-backup-nightly');

select cron.schedule(
  'fam-backup-nightly',
  '0 2 * * *',
  $$
  select net.http_post(
    url := 'https://ejlsbydsqjbxfwmvlapm.supabase.co/functions/v1/fam-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- NOTE: the schedule above reads the service role key from Supabase Vault.
-- One-off (if not already done for fam-reminders): store it with
--   select vault.create_secret('<service-role-key>', 'service_role_key');
-- If fam-reminders was scheduled a different way (e.g. Dashboard -> Integrations
-- -> Cron with the key inline), schedule fam-backup the same way instead and
-- skip section 3 — the function itself is identical either way.
