-- ============================================================
-- MIGRACIÓN SEGURA PARA kitteo_location_items EXISTENTE
-- ============================================================
-- Tu tabla ya existe y tiene una estructura correcta.
-- Este script NO la elimina ni la recrea y NO modifica tu trigger.
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- ============================================================

-- 1) Columna que necesita la versión nueva de la aplicación para
-- relacionar cada artículo con la transferencia que lo originó.
ALTER TABLE public.kitteo_location_items
  ADD COLUMN IF NOT EXISTS source_transfer_id integer NULL;

CREATE INDEX IF NOT EXISTS idx_kitteo_location_items_source_transfer_id
  ON public.kitteo_location_items USING btree (source_transfer_id);

-- 2) Seguridad para que la aplicación autenticada pueda consultar,
-- insertar, actualizar y eliminar los artículos KITTEO.
ALTER TABLE public.kitteo_location_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kitteo_location_items'
      AND policyname = 'kitteo_location_items_select_authenticated'
  ) THEN
    CREATE POLICY kitteo_location_items_select_authenticated
      ON public.kitteo_location_items FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kitteo_location_items'
      AND policyname = 'kitteo_location_items_insert_authenticated'
  ) THEN
    CREATE POLICY kitteo_location_items_insert_authenticated
      ON public.kitteo_location_items FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kitteo_location_items'
      AND policyname = 'kitteo_location_items_update_authenticated'
  ) THEN
    CREATE POLICY kitteo_location_items_update_authenticated
      ON public.kitteo_location_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kitteo_location_items'
      AND policyname = 'kitteo_location_items_delete_authenticated'
  ) THEN
    CREATE POLICY kitteo_location_items_delete_authenticated
      ON public.kitteo_location_items FOR DELETE TO authenticated USING (true);
  END IF;
END
$$;

-- 3) Recuperar locaciones ocupadas que tienen información en la tabla
-- principal, pero todavía no tienen un artículo en la tabla hija.
-- No duplica filas que ya existen en kitteo_location_items.
-- Tu trigger trg_sync_kitteo_location_status se ejecutará normalmente.
INSERT INTO public.kitteo_location_items (
  location_id,
  source_transfer_id,
  location_code,
  part_number,
  qty,
  boxes,
  po,
  entry_id,
  description,
  registered_by,
  assigned_at
)
SELECT
  l.id,
  NULL,
  l.location_code,
  l.part_number,
  COALESCE(l.qty, 0),
  l.boxes,
  l.po,
  l.entry_id,
  l.description,
  l.registered_by,
  COALESCE(l.assigned_at, CURRENT_TIMESTAMP)
FROM public.kitteo_locations AS l
WHERE l.status = 'ocupado'
  AND NULLIF(BTRIM(l.part_number), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.kitteo_location_items AS i
    WHERE i.location_id = l.id
  );

-- 4) Verificación.
SELECT
  'Migración completada' AS resultado,
  COUNT(*) AS total_articulos_kitteo
FROM public.kitteo_location_items;

SELECT
  COUNT(*) AS locaciones_ocupadas_sin_articulo_hijo
FROM public.kitteo_locations AS l
WHERE l.status = 'ocupado'
  AND NULLIF(BTRIM(l.part_number), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.kitteo_location_items AS i
    WHERE i.location_id = l.id
  );
