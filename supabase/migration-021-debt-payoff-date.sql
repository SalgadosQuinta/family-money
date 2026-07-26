-- Migration 021: one-off repayment date on a debt
--
-- due_day drives a recurring monthly repayment. This adds the separate case of
-- a debt that is to be settled on a single agreed date — "Phil, repaid in full
-- by 30 September" — so the planner can put that money on the board on the day
-- it is actually owed.
--
-- payoff_amount is optional: null means the whole outstanding balance is due on
-- payoff_date. A figure means a single agreed instalment on that date instead.
-- Idempotent: safe to run more than once.

alter table public.fam_debts add column if not exists payoff_date date;
alter table public.fam_debts add column if not exists payoff_amount numeric;

comment on column public.fam_debts.payoff_date is
  'A single agreed settlement date. Projected onto the planner on that date; not stored as a payment until recorded.';
comment on column public.fam_debts.payoff_amount is
  'Amount due on payoff_date. Null means the full outstanding balance.';
