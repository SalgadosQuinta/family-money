-- Family Money — migration 010
-- Recurring income in the planner. Instances auto-populate week by week and
-- individual weeks can be deleted (e.g. a week off) without breaking the series.
-- Safe to re-run.

alter table public.fam_income add column if not exists recurrence text not null default 'none'
  check (recurrence in ('none','weekly','monthly'));
alter table public.fam_income add column if not exists series_id uuid;

create index if not exists fam_income_series_idx on public.fam_income (series_id);
