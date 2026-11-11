-- ============================================================================
-- Salidas definitivas directas desde locación (racks de tiendas / TIENDAS)
--
-- Los racks de tienda no participan en transferencias ni en KITTEO: el material
-- se retira de la locación y se registra como salida definitiva en
-- shipping_direct sin pasar por la cola de transferes. Por eso
-- source_transfer_id deja de ser obligatorio; las salidas originadas por
-- transferencia siguen guardando su id y el UNIQUE existente admite varios NULL.
-- ============================================================================

ALTER TABLE public.shipping_direct
  ALTER COLUMN source_transfer_id DROP NOT NULL;

COMMENT ON COLUMN public.shipping_direct.source_transfer_id IS
  'transferes.id que originó la salida definitiva; NULL en salidas registradas directamente desde una locación.';
