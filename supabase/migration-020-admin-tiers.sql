-- Migration 020: two tiers of admin
-- Adds a 'manager' role between admin and member. Managers may maintain the
-- day-to-day money records (bills, income, expenses, payments) but not the
-- household itself: no member management, no space grants, no backup restore.
-- Idempotent and append-only.

alter table public.fam_members drop constraint if exists fam_members_role_check;
alter table public.fam_members add constraint fam_members_role_check
  check (role = any (array['admin'::text, 'manager'::text, 'member'::text]));

comment on column public.fam_members.role is 'admin = full control; manager = may edit money records but not members, grants or backups; member = normal access';

-- Server-side helper so policies can distinguish the tiers.
create or replace function public.fam_is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fam_members m
                 where m.user_id = auth.uid() and m.role in ('admin','manager'));
$$;
grant execute on function public.fam_is_manager() to authenticated;
