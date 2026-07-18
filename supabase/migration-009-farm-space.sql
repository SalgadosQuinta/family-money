-- Family Money — migration 009
-- Fourth space: 'farm' (TRJ Farms). Visible to admins and to members explicitly
-- granted access, so farm finances can be worked on by more than one person
-- without exposing family/private/business data.
-- Safe to re-run.

-- ============================================================
-- 1. Allow 'farm' in the space check constraints
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['fam_bills','fam_bill_payments','fam_expenses','fam_income',
                           'fam_planner_items','fam_accounts','fam_debts','fam_debt_payments',
                           'fam_budgets','fam_snapshots'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_space_check');
    execute format('alter table public.%I add constraint %I check (space in (''family'',''private'',''business'',''farm''))', t, t || '_space_check');
  end loop;
end $$;

-- ============================================================
-- 2. Grants: who else can work in a space
-- ============================================================
create table if not exists public.fam_space_grants (
  space      text not null check (space in ('farm')),
  user_id    uuid not null references auth.users (id) on delete cascade,
  granted_by uuid default auth.uid() references public.profiles (id),
  granted_at timestamptz not null default now(),
  primary key (space, user_id)
);
alter table public.fam_space_grants enable row level security;

create or replace function public.fam_has_grant(p_space text)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.fam_space_grants
                  where space = p_space and user_id = auth.uid()); $$;

drop policy if exists fam_grants_select on public.fam_space_grants;
create policy fam_grants_select on public.fam_space_grants for select
  using (public.fam_is_admin() or user_id = auth.uid());
drop policy if exists fam_grants_insert on public.fam_space_grants;
create policy fam_grants_insert on public.fam_space_grants for insert
  with check (public.fam_is_admin());
drop policy if exists fam_grants_delete on public.fam_space_grants;
create policy fam_grants_delete on public.fam_space_grants for delete
  using (public.fam_is_admin());

-- ============================================================
-- 3. Visibility + management now include farm
-- ============================================================
create or replace function public.fam_can_see(p_space text, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select public.fam_is_member()
       and (p_space = 'family'
            or (p_space = 'private'  and p_owner = auth.uid())
            or (p_space = 'business' and public.fam_is_admin())
            or (p_space = 'farm'     and (public.fam_is_admin() or public.fam_has_grant('farm')))); $$;

create or replace function public.fam_can_manage(p_space text, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select (p_space = 'family'   and public.fam_is_admin())
        or (p_space = 'private'  and p_owner = auth.uid())
        or (p_space = 'business' and public.fam_is_admin())
        or (p_space = 'farm'     and (public.fam_is_admin() or public.fam_has_grant('farm'))); $$;
