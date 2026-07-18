-- Family Money — migration 012
-- Standalone asset register per space: farm value, property, vehicles, equipment,
-- anything with an estimated worth — independent of any loan against it.
-- Safe to re-run.

create table if not exists public.fam_assets (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category     text not null default 'General',
  owner_member uuid references public.profiles (id),
  owner_name   text not null default 'Family',
  currency     text not null default 'USD' check (currency in ('USD','GBP','ZWG','EUR','ZAR')),
  value        numeric(16,2) not null default 0 check (value >= 0),
  valued_at    date not null default current_date,
  notes        text,
  space        text not null default 'family' check (space in ('family','private','business','farm')),
  space_owner  uuid references public.profiles (id),
  archived     boolean not null default false,
  created_by   uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.fam_assets enable row level security;

drop policy if exists fam_assets_select on public.fam_assets;
create policy fam_assets_select on public.fam_assets for select
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_assets_insert on public.fam_assets;
create policy fam_assets_insert on public.fam_assets for insert
  with check (public.fam_can_see(space, space_owner));
drop policy if exists fam_assets_update on public.fam_assets;
create policy fam_assets_update on public.fam_assets for update
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_assets_delete on public.fam_assets;
create policy fam_assets_delete on public.fam_assets for delete
  using (public.fam_can_manage(space, space_owner));

create index if not exists fam_assets_active_idx on public.fam_assets (archived, space, name);
