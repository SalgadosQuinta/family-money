-- Family Money — migration 008
-- Third space: 'business'. Visible and editable ONLY by admins (i.e. Rodney).
-- Other members continue to see the family space plus their own private space.
-- Safe to re-run.

-- ============================================================
-- 1. Allow 'business' in the space check constraints
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['fam_bills','fam_bill_payments','fam_expenses','fam_income',
                           'fam_planner_items','fam_accounts','fam_debts','fam_debt_payments',
                           'fam_budgets','fam_snapshots'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_space_check');
    execute format('alter table public.%I add constraint %I check (space in (''family'',''private'',''business''))', t, t || '_space_check');
  end loop;
end $$;

-- ============================================================
-- 2. Visibility: business rows admin-only
-- ============================================================
create or replace function public.fam_can_see(p_space text, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select public.fam_is_member()
       and (p_space = 'family'
            or (p_space = 'private'  and p_owner = auth.uid())
            or (p_space = 'business' and public.fam_is_admin())); $$;

-- ============================================================
-- 3. Owner-managed write policies gain the business/admin branch
--    (select/update policies already flow through fam_can_see)
-- ============================================================
create or replace function public.fam_can_manage(p_space text, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select (p_space = 'family'   and public.fam_is_admin())
        or (p_space = 'private'  and p_owner = auth.uid())
        or (p_space = 'business' and public.fam_is_admin()); $$;

-- fam_accounts
drop policy if exists fam_accounts_insert on public.fam_accounts;
create policy fam_accounts_insert on public.fam_accounts for insert
  with check (public.fam_can_manage(space, space_owner));
drop policy if exists fam_accounts_update on public.fam_accounts;
create policy fam_accounts_update on public.fam_accounts for update
  using (public.fam_can_manage(space, space_owner));
drop policy if exists fam_accounts_delete on public.fam_accounts;
create policy fam_accounts_delete on public.fam_accounts for delete
  using (public.fam_can_manage(space, space_owner));

-- fam_budgets
drop policy if exists fam_budgets_write on public.fam_budgets;
create policy fam_budgets_write on public.fam_budgets for insert
  with check (public.fam_can_manage(space, space_owner));
drop policy if exists fam_budgets_update on public.fam_budgets;
create policy fam_budgets_update on public.fam_budgets for update
  using (public.fam_can_manage(space, space_owner));
drop policy if exists fam_budgets_delete on public.fam_budgets;
create policy fam_budgets_delete on public.fam_budgets for delete
  using (public.fam_can_manage(space, space_owner));

-- deletes on the main tables gain the business branch
drop policy if exists fam_bills_delete on public.fam_bills;
create policy fam_bills_delete on public.fam_bills for delete
  using (public.fam_can_manage(space, space_owner));
drop policy if exists fam_payments_delete on public.fam_bill_payments;
create policy fam_payments_delete on public.fam_bill_payments for delete
  using (public.fam_can_manage(space, space_owner));
drop policy if exists fam_debts_delete on public.fam_debts;
create policy fam_debts_delete on public.fam_debts for delete
  using (public.fam_can_manage(space, space_owner));
drop policy if exists fam_debt_pay_delete on public.fam_debt_payments;
create policy fam_debt_pay_delete on public.fam_debt_payments for delete
  using (public.fam_can_manage(space, space_owner));
