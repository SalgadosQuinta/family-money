-- Migration 016: income receipt tracking
-- Adds received_at / received_by to fam_income so expected income can be
-- marked as received (with the actual date), remaining Outstanding until then.
-- Idempotent and append-only, like all migrations in this series.

alter table public.fam_income add column if not exists received_at date;
alter table public.fam_income add column if not exists received_by uuid references auth.users(id);

-- Existing RLS policies on fam_income already govern update access
-- (family members / space rules); no policy changes required.

comment on column public.fam_income.received_at is 'Date the income was actually received; null = outstanding';
