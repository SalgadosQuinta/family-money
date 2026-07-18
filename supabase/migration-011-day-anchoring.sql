-- Family Money — migration 011
-- Day-level planning: planner items and income can sit on an exact date
-- (on_date) as well as a week, and daily recurrence is allowed.
-- Safe to re-run.

alter table public.fam_planner_items add column if not exists on_date date;
alter table public.fam_income        add column if not exists on_date date;

alter table public.fam_planner_items drop constraint if exists fam_planner_items_recurrence_check;
alter table public.fam_planner_items add constraint fam_planner_items_recurrence_check
  check (recurrence in ('none','daily','weekly','monthly'));

alter table public.fam_income drop constraint if exists fam_income_recurrence_check;
alter table public.fam_income add constraint fam_income_recurrence_check
  check (recurrence in ('none','daily','weekly','monthly'));
