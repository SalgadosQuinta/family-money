-- Migration 019: borrowings on the debt ledger
-- fam_debt_payments gains a kind: 'payment' (default) reduces the balance,
-- 'borrow' records additional money borrowed (increases the balance) so the
-- statement can show "Borrowed more" entries with dates instead of anonymous
-- balance adjustments.
alter table public.fam_debt_payments add column if not exists kind text not null default 'payment';
comment on column public.fam_debt_payments.kind is 'payment reduces the debt balance; borrow increases it (additional borrowing)';
