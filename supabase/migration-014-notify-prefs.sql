-- Family Money — migration 014
-- Per-user WhatsApp notification preferences, managed by admins from the
-- Admin tab. Users can read their own row; only admins can write.
-- events controls exactly what fires (granular): e.g. {"task_assigned": true, "task_updated": false}
-- Safe to re-run.

create table if not exists public.fam_notify_prefs (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  wa_enabled boolean not null default false,
  wa_phone   text,
  wa_key     text,
  events     jsonb not null default '{"task_assigned": true, "task_updated": false}'::jsonb,
  updated_by uuid default auth.uid() references public.profiles (id),
  updated_at timestamptz not null default now()
);

alter table public.fam_notify_prefs enable row level security;

drop policy if exists fam_nprefs_select on public.fam_notify_prefs;
create policy fam_nprefs_select on public.fam_notify_prefs for select
  using (public.fam_is_admin() or user_id = auth.uid());
drop policy if exists fam_nprefs_insert on public.fam_notify_prefs;
create policy fam_nprefs_insert on public.fam_notify_prefs for insert
  with check (public.fam_is_admin());
drop policy if exists fam_nprefs_update on public.fam_notify_prefs;
create policy fam_nprefs_update on public.fam_notify_prefs for update
  using (public.fam_is_admin());
drop policy if exists fam_nprefs_delete on public.fam_notify_prefs;
create policy fam_nprefs_delete on public.fam_notify_prefs for delete
  using (public.fam_is_admin());
