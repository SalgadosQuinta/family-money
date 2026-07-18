-- Family Money — migration 005
-- Daily value snapshots for net worth and per-account / per-debt tracking graphs.
-- Written automatically by the app (first open of the day). Safe to re-run.

create table if not exists public.fam_snapshots (
  id        uuid primary key default gen_random_uuid(),
  snap_date date not null default current_date,
  kind      text not null check (kind in ('account','debt','networth')),
  ref_id    text not null,            -- account/debt uuid, or 'net'
  label     text,
  owner_name text,
  currency  text not null check (currency in ('USD','GBP','ZWG','EUR','ZAR')),
  value     numeric(16,2) not null,
  created_by uuid default auth.uid() references public.profiles (id),
  unique (snap_date, kind, ref_id, currency)
);

alter table public.fam_snapshots enable row level security;

drop policy if exists fam_snap_select on public.fam_snapshots;
create policy fam_snap_select on public.fam_snapshots for select using (public.fam_is_member());
drop policy if exists fam_snap_insert on public.fam_snapshots;
create policy fam_snap_insert on public.fam_snapshots for insert with check (public.fam_is_member());
drop policy if exists fam_snap_update on public.fam_snapshots;
create policy fam_snap_update on public.fam_snapshots for update using (public.fam_is_member());

create index if not exists fam_snap_series_idx on public.fam_snapshots (kind, ref_id, currency, snap_date);
