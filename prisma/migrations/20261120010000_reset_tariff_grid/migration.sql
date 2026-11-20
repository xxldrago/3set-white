-- The retail pricing model is now a per-device markup over the live ARTEMIDA
-- quote (see MARKUP_PER_DEVICE in lib/tariff-grid.ts). The old fixed grid rows
-- encode the previous, cheaper prices and would win over the new formula as
-- exact cells, so drop them. Admins can still add explicit overrides later.
DELETE FROM tariff_prices;
