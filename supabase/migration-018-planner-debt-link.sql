-- Migration 018: planned debt payments
-- Links a planner item to a debt so a payment can be planned on the board
-- and recorded against the debt only when ticked as paid.
alter table public.fam_planner_items add column if not exists debt_id uuid references public.fam_debts(id);
comment on column public.fam_planner_items.debt_id is 'When set, ticking the item paid records a fam_debt_payments row and reduces the debt balance';
