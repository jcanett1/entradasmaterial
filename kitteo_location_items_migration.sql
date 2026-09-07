-- ============================================================
-- TABLA HIJA: kitteo_location_items
--
-- Ejecutar en Supabase > SQL Editor.
-- Esta migración:
--   1) crea la tabla si no existe;
--   2) agrega columnas faltantes de forma segura;
--   3) habilita RLS y políticas para usuarios autenticados;
--   4) recupera las locaciones KITTEO ocupadas que solo tienen
--      datos en kitteo_locations y todavía no tienen artículo hijo.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kitteo_location_items (
  id            serial        NOT NULL,
  source_transfer_id integer  NULL,
  location_id   integer       NOT NULL,
  location_code varchar(20)   NOT NULL,
  part_number   varchar(100)  NOT NULL,
  description   text          NULL,
  qty           integer       NOT NULL DEFAULT 0,
  boxes         integer       NULL,
  po            varchar(100)  NULL,
  entry_id      integer       NULL,
  registered_by varchar(100)  NULL,
  assigned_at   timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT kitteo_location_items_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

ALTER TABLE public.kitteo_location_items
  ADD COLUMN IF NOT EXISTS source_transfer_id integer,
  ADD COLUMN IF NOT EXISTS location_id integer,
  ADD COLUMN IF NOT EXISTS location_code varchar(20),
  ADD COLUMN IF NOT EXISTS part_number varchar(100),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS qty integer,
  ADD COLUMN IF NOT EXISTS boxes integer,
  ADD COLUMN IF NOT EXISTS po varchar(100),
  ADD COLUMN IF NOT EXISTS entry_id integer,
  ADD COLUMN IF NOT EXISTS registered_by varchar(100),
  ADD COLUMN IF NOT EXISTS assigned_at timestamp;

CREATE INDEX IF NOT EXISTS idx_kitteo_location_items_location_id
  ON public.kitteo_location_items (location_id);
CREATE INDEX IF NOT EXISTS idx_kitteo_location_items_source_transfer_id
  ON public.kitteo_location_items (source_transfer_id);
CREATE INDEX IF NOT EXISTS idx_kitteo_location_items_location_code
  ON public.kitteo_location_items (location_code);
CREATE INDEX IF NOT EXISTS idx_kitteo_location_items_part_number
  ON public.kitteo_location_items (part_number);
CREATE INDEX IF NOT EXISTS idx_kitteo_location_items_entry_id
  ON public.kitteo_location_items (entry_id);

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

-- Recuperar las locaciones ocupadas que fueron asignadas antes de usar
-- la tabla hija. No duplica los artículos que ya existen allí.
INSERT INTO public.kitteo_location_items (
  location_id,
  source_transfer_id,
  location_code,
  part_number,
  description,
  qty,
  boxes,
  po,
  entry_id,
  registered_by,
  assigned_at
)
SELECT
  l.id,
  NULL,
  l.location_code,
  l.part_number,
  l.description,
  COALESCE(l.qty, 0),
  l.boxes,
  l.po,
  l.entry_id,
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

SELECT
  'Migración de kitteo_location_items completada' AS resultado,
  COUNT(*) AS articulos_hijos
FROM public.kitteo_location_items;
