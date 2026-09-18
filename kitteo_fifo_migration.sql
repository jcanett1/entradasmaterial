-- ============================================================
-- MIGRACIÓN: conservar FIFO en Transferencias y KITTEO
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- ============================================================

-- El FIFO original vive en fifo_labels y se relaciona por entry_id.
-- Estas columnas conservan el FIFO exacto cuando la transferencia se
-- convierte en un artículo asignado a una locación KITTEO.
ALTER TABLE public.transferes
  ADD COLUMN IF NOT EXISTS fifo_number integer NULL;

ALTER TABLE public.kitteo_location_items
  ADD COLUMN IF NOT EXISTS fifo_number integer NULL;

CREATE INDEX IF NOT EXISTS idx_transferes_fifo_number
  ON public.transferes (fifo_number);

CREATE INDEX IF NOT EXISTS idx_kitteo_location_items_fifo_number
  ON public.kitteo_location_items (fifo_number);

-- Recuperar FIFO para registros existentes que todavía no lo tienen.
UPDATE public.transferes AS t
SET fifo_number = f.fifo_number
FROM public.fifo_labels AS f
WHERE t.fifo_number IS NULL
  AND t.entry_id IS NOT NULL
  AND f.entry_id = t.entry_id;

UPDATE public.kitteo_location_items AS i
SET fifo_number = f.fifo_number
FROM public.fifo_labels AS f
WHERE i.fifo_number IS NULL
  AND i.entry_id IS NOT NULL
  AND f.entry_id = i.entry_id;

-- Verificación rápida.
SELECT
  (SELECT COUNT(*) FROM public.transferes WHERE fifo_number IS NOT NULL) AS transferencias_con_fifo,
  (SELECT COUNT(*) FROM public.kitteo_location_items WHERE fifo_number IS NOT NULL) AS articulos_kitteo_con_fifo;
