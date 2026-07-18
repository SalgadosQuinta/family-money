-- Family Money — migration 006
-- Recurring planner items + shared family settings (e.g. manual ZWG rate).
-- Safe to re-run.

alter table public.fam_planner_items add column if not exists recurrence text not null default 'none'
  check (recurrence in ('none','weekly','monthly'));

create table if not exists public.fam_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
alter table public.fam_settings enable row level security;

drop policy if exists fam_settings_select on public.fam_settings;
create policy fam_settings_select on public.fam_settings for select using (public.fam_is_member());
drop policy if exists fam_settings_insert on public.fam_settings;
create policy fam_settings_insert on public.fam_settings for insert with check (public.fam_is_admin());
drop policy if exists fam_settings_update on public.fam_settings;
create policy fam_settings_update on public.fam_settings for update using (public.fam_is_admin());
drop policy if exists fam_settings_delete on public.fam_settings;
create policy fam_settings_delete on public.fam_settings for delete using (public.fam_is_admin());
