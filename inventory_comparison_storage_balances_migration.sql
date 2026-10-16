-- Additive snapshot fields for location-assigned balances at comparison time.
-- Older comparison rows stay NULL because historical location quantities were not stored.
ALTER TABLE public.inventory_comparison_items
  ADD COLUMN IF NOT EXISTS warehouse_units numeric NULL,
  ADD COLUMN IF NOT EXISTS kitteo_units numeric NULL;

COMMENT ON COLUMN public.inventory_comparison_items.warehouse_units IS
  'Cantidad actualmente asignada a locaciones del almacén principal al momento de la comparación.';
COMMENT ON COLUMN public.inventory_comparison_items.kitteo_units IS
  'Cantidad actualmente asignada a locaciones KITTEO al momento de la comparación.';
