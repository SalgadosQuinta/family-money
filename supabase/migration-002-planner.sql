-- Family Money — migration 002
-- Planner: week-based income and planned outgoings.
-- Weeks are anchored on a Friday date (week runs Saturday..Friday), matching the planning spreadsheet.
-- Safe to re-run.

create table if not exists public.fam_income (
  id         uuid primary key default gen_random_uuid(),
  person     text not null,                     -- free text (e.g. Rodney, Tapiwa)
  amount     numeric(14,2) not null check (amount >= 0),
  currency   text not null default 'GBP' check (currency in ('USD','GBP','ZWG','EUR','ZAR')),
  week_date  date not null,                     -- the Friday anchoring the week
  note       text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.fam_income enable row level security;

drop policy if exists fam_income_select on public.fam_income;
create policy fam_income_select on public.fam_income
  for select using (public.fam_is_member());
drop policy if exists fam_income_write on public.fam_income;
create policy fam_income_write on public.fam_income
  for insert with check (public.fam_is_member());
drop policy if exists fam_income_update on public.fam_income;
create policy fam_income_update on public.fam_income
  for update using (public.fam_is_member());
drop policy if exists fam_income_delete on public.fam_income;
create policy fam_income_delete on public.fam_income
  for delete using (public.fam_is_member());

create table if not exists public.fam_planner_items (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  amount     numeric(14,2) not null check (amount >= 0),
  currency   text not null default 'GBP' check (currency in ('USD','GBP','ZWG','EUR','ZAR')),
  week_date  date not null,                     -- the Friday anchoring the week
  paid       boolean not null default false,
  paid_by    uuid references public.profiles (id),
  paid_at    timestamptz,
  note       text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.fam_planner_items enable row level security;

drop policy if exists fam_planner_select on public.fam_planner_items;
create policy fam_planner_select on public.fam_planner_items
  for select using (public.fam_is_member());
drop policy if exists fam_planner_write on public.fam_planner_items;
create policy fam_planner_write on public.fam_planner_items
  for insert with check (public.fam_is_member());
drop policy if exists fam_planner_update on public.fam_planner_items;
create policy fam_planner_update on public.fam_planner_items
  for update using (public.fam_is_member());
drop policy if exists fam_planner_delete on public.fam_planner_items;
create policy fam_planner_delete on public.fam_planner_items
  for delete using (public.fam_is_member());

create index if not exists fam_income_week_idx  on public.fam_income (week_date);
create index if not exists fam_planner_week_idx on public.fam_planner_items (week_date);
