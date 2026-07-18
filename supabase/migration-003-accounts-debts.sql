-- Family Money — migration 003
-- Accounts register, account tagging, debts & loans, budgets.
-- Safe to re-run.

-- ============================================================
-- 1. Accounts (bank, cash, mobile money, credit card, intermediary, personal)
-- ============================================================
create table if not exists public.fam_accounts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  acct_type       text not null default 'bank'
                  check (acct_type in ('bank','cash','mobile','credit_card','intermediary','personal')),
  owner_member    uuid references public.profiles (id),   -- set when owned by a family member
  owner_name      text not null default 'Family',         -- e.g. member name or business name
  currency        text not null default 'GBP' check (currency in ('USD','GBP','ZWG','EUR','ZAR')),
  opening_balance numeric(14,2) not null default 0,
  archived        boolean not null default false,
  created_by      uuid not null default auth.uid() references public.profiles (id),
  created_at      timestamptz not null default now()
);
alter table public.fam_accounts enable row level security;
drop policy if exists fam_accounts_select on public.fam_accounts;
create policy fam_accounts_select on public.fam_accounts for select using (public.fam_is_member());
drop policy if exists fam_accounts_insert on public.fam_accounts;
create policy fam_accounts_insert on public.fam_accounts for insert with check (public.fam_is_admin());
drop policy if exists fam_accounts_update on public.fam_accounts;
create policy fam_accounts_update on public.fam_accounts for update using (public.fam_is_admin());
drop policy if exists fam_accounts_delete on public.fam_accounts;
create policy fam_accounts_delete on public.fam_accounts for delete using (public.fam_is_admin());

-- ============================================================
-- 2. Account tagging on existing tables (from / to accounts)
-- ============================================================
alter table public.fam_bills          add column if not exists account_id uuid references public.fam_accounts (id);
alter table public.fam_bill_payments  add column if not exists account_id uuid references public.fam_accounts (id);
alter table public.fam_expenses       add column if not exists account_id uuid references public.fam_accounts (id);
alter table public.fam_income         add column if not exists account_id uuid references public.fam_accounts (id);
alter table public.fam_planner_items  add column if not exists account_id uuid references public.fam_accounts (id);

-- ============================================================
-- 3. Debts & loans (credit cards, bank loans, informal borrowings)
-- ============================================================
create table if not exists public.fam_debts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  debt_type     text not null default 'loan' check (debt_type in ('credit_card','loan','informal')),
  lender        text,
  owner_member  uuid references public.profiles (id),     -- whose name it is in (if a family member)
  owner_name    text not null default 'Family',           -- member name or business name
  principal     numeric(14,2) not null default 0 check (principal >= 0),
  balance       numeric(14,2) not null default 0 check (balance >= 0),
  currency      text not null default 'GBP' check (currency in ('USD','GBP','ZWG','EUR','ZAR')),
  interest_rate numeric(6,3) not null default 0,          -- annual %, e.g. 24.9
  min_payment   numeric(14,2) not null default 0,
  due_day       int check (due_day between 1 and 31),     -- day of month payment is due
  account_id    uuid references public.fam_accounts (id), -- linked account (e.g. the credit card account)
  notes         text,
  archived      boolean not null default false,
  created_by    uuid not null default auth.uid() references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.fam_debts enable row level security;
drop policy if exists fam_debts_select on public.fam_debts;
create policy fam_debts_select on public.fam_debts for select using (public.fam_is_member());
drop policy if exists fam_debts_insert on public.fam_debts;
create policy fam_debts_insert on public.fam_debts for insert with check (public.fam_is_member());
drop policy if exists fam_debts_update on public.fam_debts;
create policy fam_debts_update on public.fam_debts for update using (public.fam_is_member());
drop policy if exists fam_debts_delete on public.fam_debts;
create policy fam_debts_delete on public.fam_debts for delete using (public.fam_is_admin());

create table if not exists public.fam_debt_payments (
  id         uuid primary key default gen_random_uuid(),
  debt_id    uuid not null references public.fam_debts (id) on delete cascade,
  debt_name  text not null,
  amount     numeric(14,2) not null check (amount >= 0),
  currency   text not null check (currency in ('USD','GBP','ZWG','EUR','ZAR')),
  paid_by    uuid not null default auth.uid() references public.profiles (id),
  paid_at    timestamptz not null default now(),
  account_id uuid references public.fam_accounts (id),    -- account it was paid from
  note       text
);
alter table public.fam_debt_payments enable row level security;
drop policy if exists fam_debt_pay_select on public.fam_debt_payments;
create policy fam_debt_pay_select on public.fam_debt_payments for select using (public.fam_is_member());
drop policy if exists fam_debt_pay_insert on public.fam_debt_payments;
create policy fam_debt_pay_insert on public.fam_debt_payments
  for insert with check (public.fam_is_member() and paid_by = auth.uid());
drop policy if exists fam_debt_pay_delete on public.fam_debt_payments;
create policy fam_debt_pay_delete on public.fam_debt_payments for delete using (public.fam_is_admin());

-- ============================================================
-- 4. Category budgets (monthly limit per category + currency)
-- ============================================================
create table if not exists public.fam_budgets (
  id        uuid primary key default gen_random_uuid(),
  category  text not null,
  currency  text not null default 'GBP' check (currency in ('USD','GBP','ZWG','EUR','ZAR')),
  amount    numeric(14,2) not null check (amount >= 0),
  unique (category, currency)
);
alter table public.fam_budgets enable row level security;
drop policy if exists fam_budgets_select on public.fam_budgets;
create policy fam_budgets_select on public.fam_budgets for select using (public.fam_is_member());
drop policy if exists fam_budgets_write on public.fam_budgets;
create policy fam_budgets_write on public.fam_budgets for insert with check (public.fam_is_admin());
drop policy if exists fam_budgets_update on public.fam_budgets;
create policy fam_budgets_update on public.fam_budgets for update using (public.fam_is_admin());
drop policy if exists fam_budgets_delete on public.fam_budgets;
create policy fam_budgets_delete on public.fam_budgets for delete using (public.fam_is_admin());

-- ============================================================
-- 5. Indexes
-- ============================================================
create index if not exists fam_debts_owner_idx     on public.fam_debts (archived, owner_name);
create index if not exists fam_debt_pay_paid_idx   on public.fam_debt_payments (paid_at desc);
create index if not exists fam_accounts_active_idx on public.fam_accounts (archived, name);
