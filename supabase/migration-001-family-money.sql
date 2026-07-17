-- Family Money — migration 001
-- Creates fam_ tables with row-level security.
-- Safe to re-run.

-- ============================================================
-- 1. Membership
-- ============================================================
create table if not exists public.fam_members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('admin','member')),
  added_at   timestamptz not null default now()
);

alter table public.fam_members enable row level security;

-- Security-definer helpers avoid RLS recursion on fam_members itself.
create or replace function public.fam_is_member()
returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.fam_members where user_id = auth.uid()); $$;

create or replace function public.fam_is_admin()
returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.fam_members where user_id = auth.uid() and role = 'admin'); $$;

drop policy if exists fam_members_select on public.fam_members;
create policy fam_members_select on public.fam_members
  for select using (public.fam_is_member());

drop policy if exists fam_members_admin_insert on public.fam_members;
create policy fam_members_admin_insert on public.fam_members
  for insert with check (public.fam_is_admin());

drop policy if exists fam_members_admin_update on public.fam_members;
create policy fam_members_admin_update on public.fam_members
  for update using (public.fam_is_admin());

drop policy if exists fam_members_admin_delete on public.fam_members;
create policy fam_members_admin_delete on public.fam_members
  for delete using (public.fam_is_admin());

-- ============================================================
-- 2. Bills & commitments
-- ============================================================
create table if not exists public.fam_bills (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  amount       numeric(14,2) not null check (amount >= 0),
  currency     text not null default 'USD' check (currency in ('USD','GBP','ZWG','EUR','ZAR')),
  due_date     date not null,
  recurrence   text not null default 'none' check (recurrence in ('none','weekly','monthly','quarterly','annually')),
  category     text not null default 'General',
  responsible  uuid references public.profiles (id),
  notes        text,
  receipt_path text,
  archived     boolean not null default false,
  created_by   uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.fam_bills enable row level security;

drop policy if exists fam_bills_select on public.fam_bills;
create policy fam_bills_select on public.fam_bills
  for select using (public.fam_is_member());

drop policy if exists fam_bills_insert on public.fam_bills;
create policy fam_bills_insert on public.fam_bills
  for insert with check (public.fam_is_member());

drop policy if exists fam_bills_update on public.fam_bills;
create policy fam_bills_update on public.fam_bills
  for update using (public.fam_is_member());

drop policy if exists fam_bills_delete on public.fam_bills;
create policy fam_bills_delete on public.fam_bills
  for delete using (public.fam_is_admin());

-- ============================================================
-- 3. Paid history
-- ============================================================
create table if not exists public.fam_bill_payments (
  id         uuid primary key default gen_random_uuid(),
  bill_id    uuid not null references public.fam_bills (id) on delete cascade,
  bill_name  text not null,
  amount     numeric(14,2) not null check (amount >= 0),
  currency   text not null check (currency in ('USD','GBP','ZWG','EUR','ZAR')),
  paid_by    uuid not null default auth.uid() references public.profiles (id),
  paid_at    timestamptz not null default now(),
  due_date   date,
  note       text
);

alter table public.fam_bill_payments enable row level security;

drop policy if exists fam_payments_select on public.fam_bill_payments;
create policy fam_payments_select on public.fam_bill_payments
  for select using (public.fam_is_member());

drop policy if exists fam_payments_insert on public.fam_bill_payments;
create policy fam_payments_insert on public.fam_bill_payments
  for insert with check (public.fam_is_member() and paid_by = auth.uid());

drop policy if exists fam_payments_delete on public.fam_bill_payments;
create policy fam_payments_delete on public.fam_bill_payments
  for delete using (public.fam_is_admin());

-- ============================================================
-- 4. One-off expenses
-- ============================================================
create table if not exists public.fam_expenses (
  id           uuid primary key default gen_random_uuid(),
  amount       numeric(14,2) not null check (amount >= 0),
  currency     text not null default 'USD' check (currency in ('USD','GBP','ZWG','EUR','ZAR')),
  category     text not null default 'General',
  spent_by     uuid not null default auth.uid() references public.profiles (id),
  spent_at     date not null default current_date,
  note         text,
  receipt_path text,
  created_at   timestamptz not null default now()
);

alter table public.fam_expenses enable row level security;

drop policy if exists fam_expenses_select on public.fam_expenses;
create policy fam_expenses_select on public.fam_expenses
  for select using (public.fam_is_member());

drop policy if exists fam_expenses_insert on public.fam_expenses;
create policy fam_expenses_insert on public.fam_expenses
  for insert with check (public.fam_is_member() and spent_by = auth.uid());

drop policy if exists fam_expenses_update on public.fam_expenses;
create policy fam_expenses_update on public.fam_expenses
  for update using (public.fam_is_member() and spent_by = auth.uid());

drop policy if exists fam_expenses_delete on public.fam_expenses;
create policy fam_expenses_delete on public.fam_expenses
  for delete using (public.fam_is_member() and (spent_by = auth.uid() or public.fam_is_admin()));

-- ============================================================
-- 5. Indexes
-- ============================================================
create index if not exists fam_bills_due_idx      on public.fam_bills (archived, due_date);
create index if not exists fam_payments_paid_idx  on public.fam_bill_payments (paid_at desc);
create index if not exists fam_expenses_spent_idx on public.fam_expenses (spent_at desc);

-- ============================================================
-- 6. Bootstrap the admin (EDIT THE EMAIL BEFORE RUNNING)
-- ============================================================
insert into public.fam_members (user_id, role)
select id, 'admin' from public.profiles
where lower(email) = lower('rodney@mullway.com')
on conflict (user_id) do update set role = 'admin';
