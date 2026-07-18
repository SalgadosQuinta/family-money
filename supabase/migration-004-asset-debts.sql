-- Family Money — migration 004
-- Asset-aligned debts: mortgages, vehicle finance, farm/equipment loans.
-- Safe to re-run.

alter table public.fam_debts add column if not exists asset_backed boolean not null default false;
alter table public.fam_debts add column if not exists asset_name  text;
alter table public.fam_debts add column if not exists asset_value numeric(14,2) check (asset_value is null or asset_value >= 0);
