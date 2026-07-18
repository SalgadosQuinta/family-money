-- Family Money — migration 007
-- Private per-user spaces. Every data table gains:
--   space       'family' (shared, as before) | 'private'
--   space_owner the user a private row belongs to
-- RLS: family rows behave exactly as before; private rows are visible and
-- editable ONLY by their owner — including against admin accounts.
-- Safe to re-run.

-- ============================================================
-- 1. Columns
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['fam_bills','fam_bill_payments','fam_expenses','fam_income',
                           'fam_planner_items','fam_accounts','fam_debts','fam_debt_payments',
                           'fam_budgets','fam_snapshots'] loop
    execute format('alter table public.%I add column if not exists space text not null default ''family'' check (space in (''family'',''private''))', t);
    execute format('alter table public.%I add column if not exists space_owner uuid references public.profiles (id)', t);
  end loop;
end $$;

-- Budgets: uniqueness must now be per space/owner
alter table public.fam_budgets drop constraint if exists fam_budgets_category_currency_key;
drop index if exists fam_budgets_scope_uniq;
create unique index fam_budgets_scope_uniq on public.fam_budgets (category, currency, space, coalesce(space_owner, '00000000-0000-0000-0000-000000000000'::uuid));

-- Snapshots: uniqueness per space/owner too
alter table public.fam_snapshots drop constraint if exists fam_snapshots_snap_date_kind_ref_id_currency_key;
drop index if exists fam_snap_scope_uniq;
create unique index fam_snap_scope_uniq on public.fam_snapshots (snap_date, kind, ref_id, currency, space, coalesce(space_owner, '00000000-0000-0000-0000-000000000000'::uuid));

-- ============================================================
-- 2. Visibility helper
-- ============================================================
create or replace function public.fam_can_see(p_space text, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select public.fam_is_member()
       and (p_space = 'family' or p_owner = auth.uid()); $$;

-- ============================================================
-- 3. Policies (drop + recreate with space awareness)
-- ============================================================

-- fam_bills
drop policy if exists fam_bills_select on public.fam_bills;
create policy fam_bills_select on public.fam_bills for select
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_bills_insert on public.fam_bills;
create policy fam_bills_insert on public.fam_bills for insert
  with check (public.fam_can_see(space, space_owner));
drop policy if exists fam_bills_update on public.fam_bills;
create policy fam_bills_update on public.fam_bills for update
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_bills_delete on public.fam_bills;
create policy fam_bills_delete on public.fam_bills for delete
  using ((space = 'family' and public.fam_is_admin()) or (space = 'private' and space_owner = auth.uid()));

-- fam_bill_payments
drop policy if exists fam_payments_select on public.fam_bill_payments;
create policy fam_payments_select on public.fam_bill_payments for select
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_payments_insert on public.fam_bill_payments;
create policy fam_payments_insert on public.fam_bill_payments for insert
  with check (public.fam_can_see(space, space_owner) and paid_by = auth.uid());
drop policy if exists fam_payments_update on public.fam_bill_payments;
create policy fam_payments_update on public.fam_bill_payments for update
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_payments_delete on public.fam_bill_payments;
create policy fam_payments_delete on public.fam_bill_payments for delete
  using ((space = 'family' and public.fam_is_admin()) or (space = 'private' and space_owner = auth.uid()));

-- fam_expenses
drop policy if exists fam_expenses_select on public.fam_expenses;
create policy fam_expenses_select on public.fam_expenses for select
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_expenses_insert on public.fam_expenses;
create policy fam_expenses_insert on public.fam_expenses for insert
  with check (public.fam_can_see(space, space_owner) and spent_by = auth.uid());
drop policy if exists fam_expenses_update on public.fam_expenses;
create policy fam_expenses_update on public.fam_expenses for update
  using (public.fam_can_see(space, space_owner) and (space = 'private' or spent_by = auth.uid()));
drop policy if exists fam_expenses_delete on public.fam_expenses;
create policy fam_expenses_delete on public.fam_expenses for delete
  using (public.fam_can_see(space, space_owner) and (spent_by = auth.uid() or (space = 'family' and public.fam_is_admin())));

-- fam_income
drop policy if exists fam_income_select on public.fam_income;
create policy fam_income_select on public.fam_income for select
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_income_write on public.fam_income;
create policy fam_income_write on public.fam_income for insert
  with check (public.fam_can_see(space, space_owner));
drop policy if exists fam_income_update on public.fam_income;
create policy fam_income_update on public.fam_income for update
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_income_delete on public.fam_income;
create policy fam_income_delete on public.fam_income for delete
  using (public.fam_can_see(space, space_owner));

-- fam_planner_items
drop policy if exists fam_planner_select on public.fam_planner_items;
create policy fam_planner_select on public.fam_planner_items for select
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_planner_write on public.fam_planner_items;
create policy fam_planner_write on public.fam_planner_items for insert
  with check (public.fam_can_see(space, space_owner));
drop policy if exists fam_planner_update on public.fam_planner_items;
create policy fam_planner_update on public.fam_planner_items for update
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_planner_delete on public.fam_planner_items;
create policy fam_planner_delete on public.fam_planner_items for delete
  using (public.fam_can_see(space, space_owner));

-- fam_accounts (family accounts stay admin-managed; private accounts owner-managed)
drop policy if exists fam_accounts_select on public.fam_accounts;
create policy fam_accounts_select on public.fam_accounts for select
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_accounts_insert on public.fam_accounts;
create policy fam_accounts_insert on public.fam_accounts for insert
  with check ((space = 'family' and public.fam_is_admin()) or (space = 'private' and space_owner = auth.uid()));
drop policy if exists fam_accounts_update on public.fam_accounts;
create policy fam_accounts_update on public.fam_accounts for update
  using ((space = 'family' and public.fam_is_admin()) or (space = 'private' and space_owner = auth.uid()));
drop policy if exists fam_accounts_delete on public.fam_accounts;
create policy fam_accounts_delete on public.fam_accounts for delete
  using ((space = 'family' and public.fam_is_admin()) or (space = 'private' and space_owner = auth.uid()));

-- fam_debts
drop policy if exists fam_debts_select on public.fam_debts;
create policy fam_debts_select on public.fam_debts for select
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_debts_insert on public.fam_debts;
create policy fam_debts_insert on public.fam_debts for insert
  with check (public.fam_can_see(space, space_owner));
drop policy if exists fam_debts_update on public.fam_debts;
create policy fam_debts_update on public.fam_debts for update
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_debts_delete on public.fam_debts;
create policy fam_debts_delete on public.fam_debts for delete
  using ((space = 'family' and public.fam_is_admin()) or (space = 'private' and space_owner = auth.uid()));

-- fam_debt_payments
drop policy if exists fam_debt_pay_select on public.fam_debt_payments;
create policy fam_debt_pay_select on public.fam_debt_payments for select
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_debt_pay_insert on public.fam_debt_payments;
create policy fam_debt_pay_insert on public.fam_debt_payments for insert
  with check (public.fam_can_see(space, space_owner) and paid_by = auth.uid());
drop policy if exists fam_debt_pay_update on public.fam_debt_payments;
create policy fam_debt_pay_update on public.fam_debt_payments for update
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_debt_pay_delete on public.fam_debt_payments;
create policy fam_debt_pay_delete on public.fam_debt_payments for delete
  using ((space = 'family' and public.fam_is_admin()) or (space = 'private' and space_owner = auth.uid()));

-- fam_budgets (family budgets admin-managed; private budgets owner-managed)
drop policy if exists fam_budgets_select on public.fam_budgets;
create policy fam_budgets_select on public.fam_budgets for select
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_budgets_write on public.fam_budgets;
create policy fam_budgets_write on public.fam_budgets for insert
  with check ((space = 'family' and public.fam_is_admin()) or (space = 'private' and space_owner = auth.uid()));
drop policy if exists fam_budgets_update on public.fam_budgets;
create policy fam_budgets_update on public.fam_budgets for update
  using ((space = 'family' and public.fam_is_admin()) or (space = 'private' and space_owner = auth.uid()));
drop policy if exists fam_budgets_delete on public.fam_budgets;
create policy fam_budgets_delete on public.fam_budgets for delete
  using ((space = 'family' and public.fam_is_admin()) or (space = 'private' and space_owner = auth.uid()));

-- fam_snapshots
drop policy if exists fam_snap_select on public.fam_snapshots;
create policy fam_snap_select on public.fam_snapshots for select
  using (public.fam_can_see(space, space_owner));
drop policy if exists fam_snap_insert on public.fam_snapshots;
create policy fam_snap_insert on public.fam_snapshots for insert
  with check (public.fam_can_see(space, space_owner));
drop policy if exists fam_snap_update on public.fam_snapshots;
create policy fam_snap_update on public.fam_snapshots for update
  using (public.fam_can_see(space, space_owner));
