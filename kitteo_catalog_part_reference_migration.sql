-- Identifica los artículos de KITTEO que se asignaron directamente desde parts_catalog.
-- Los registros existentes permanecen con catalog_part_id NULL.
ALTER TABLE public.kitteo_location_items
  ADD COLUMN IF NOT EXISTS catalog_part_id integer NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kitteo_location_items_catalog_part_id_fkey'
      AND conrelid = 'public.kitteo_location_items'::regclass
  ) THEN
    ALTER TABLE public.kitteo_location_items
      ADD CONSTRAINT kitteo_location_items_catalog_part_id_fkey
      FOREIGN KEY (catalog_part_id)
      REFERENCES public.parts_catalog (id)
      ON DELETE RESTRICT;
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS idx_kitteo_location_items_catalog_part_id
  ON public.kitteo_location_items USING btree (catalog_part_id)
  WHERE catalog_part_id IS NOT NULL;
