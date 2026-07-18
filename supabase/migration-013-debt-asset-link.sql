-- Family Money — migration 013
-- Asset-aligned debts link to an asset in the register (fam_assets) instead of
-- carrying their own duplicate name/value. Manual fields remain as a fallback
-- for debts whose asset is not in the register.
-- Safe to re-run.

alter table public.fam_debts add column if not exists asset_id uuid references public.fam_assets (id) on delete set null;
create index if not exists fam_debts_asset_idx on public.fam_debts (asset_id);
