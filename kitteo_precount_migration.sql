-- ============================================================
-- MIGRACIÓN: PRECONTEO KITTEO — ETAPA 1
-- ============================================================
-- Esta migración agrega el registro histórico de preconteos físicos.
-- No modifica automáticamente QTY, cajas, estados ni inventario.
-- Ejecutar una sola vez en Supabase > SQL Editor.
--
-- Las llaves foráneas usan INTEGER porque las claves existentes de
-- kitteo_locations, kitteo_location_items y estas tablas son INTEGER.
-- ============================================================

-- 1) Encabezado de cada preconteo por locación.
CREATE TABLE IF NOT EXISTS public.kitteo_precounts (
  id            serial       NOT NULL,
  location_id   integer      NOT NULL REFERENCES public.kitteo_locations(id) ON DELETE RESTRICT,
  location_code varchar(20)  NOT NULL,
  rack          varchar(20)  NOT NULL,
  status        varchar(20)  NOT NULL DEFAULT 'borrador',
  started_by    varchar(255) NULL,
  started_at    timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_by  varchar(255) NULL,
  completed_at  timestamptz  NULL,
  notes         text         NULL,
  created_at    timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT kitteo_precounts_pkey PRIMARY KEY (id),
  CONSTRAINT kitteo_precounts_status_check CHECK (status IN ('borrador', 'finalizado'))
) TABLESPACE pg_default;

-- 2) Detalle: una fila por artículo que existía en la locación al iniciar
-- el preconteo. location_item_id es NULL para artículos heredados/virtuales
-- que todavía no tienen fila física en kitteo_location_items.
CREATE TABLE IF NOT EXISTS public.kitteo_precount_items (
  id               serial       NOT NULL,
  precount_id      integer      NOT NULL REFERENCES public.kitteo_precounts(id) ON DELETE CASCADE,
  location_item_id integer      NULL REFERENCES public.kitteo_location_items(id) ON DELETE SET NULL,
  part_number      varchar(100) NOT NULL,
  description      text         NULL,
  po               varchar(100) NULL,
  fifo_number      integer      NULL,
  system_qty       integer      NOT NULL DEFAULT 0,
  system_boxes     integer      NULL,
  counted_qty      integer      NULL,
  counted_boxes    integer      NULL,
  notes            text         NULL,
  created_at       timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT kitteo_precount_items_pkey PRIMARY KEY (id),
  CONSTRAINT kitteo_precount_items_system_qty_check CHECK (system_qty >= 0),
  CONSTRAINT kitteo_precount_items_system_boxes_check CHECK (system_boxes IS NULL OR system_boxes >= 0),
  CONSTRAINT kitteo_precount_items_counted_qty_check CHECK (counted_qty IS NULL OR counted_qty >= 0),
  CONSTRAINT kitteo_precount_items_counted_boxes_check CHECK (counted_boxes IS NULL OR counted_boxes >= 0)
) TABLESPACE pg_default;

-- 3) Índices para cargar rápidamente el último borrador y el detalle.
CREATE INDEX IF NOT EXISTS idx_kitteo_precounts_location_id
  ON public.kitteo_precounts USING btree (location_id);

CREATE INDEX IF NOT EXISTS idx_kitteo_precounts_status
  ON public.kitteo_precounts USING btree (status);

CREATE INDEX IF NOT EXISTS idx_kitteo_precounts_started_at
  ON public.kitteo_precounts USING btree (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_kitteo_precount_items_precount_id
  ON public.kitteo_precount_items USING btree (precount_id);

CREATE INDEX IF NOT EXISTS idx_kitteo_precount_items_location_item_id
  ON public.kitteo_precount_items USING btree (location_item_id);

-- 4) Row Level Security para usuarios autenticados de la aplicación.
-- La Etapa 1 permite consultar, guardar borradores y finalizar conteos.
-- La aprobación/ajuste de inventario no forma parte de estas políticas.
ALTER TABLE public.kitteo_precounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitteo_precount_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kitteo_precounts'
      AND policyname = 'kitteo_precounts_select_authenticated'
  ) THEN
    CREATE POLICY kitteo_precounts_select_authenticated
      ON public.kitteo_precounts FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kitteo_precounts'
      AND policyname = 'kitteo_precounts_insert_authenticated'
  ) THEN
    CREATE POLICY kitteo_precounts_insert_authenticated
      ON public.kitteo_precounts FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kitteo_precounts'
      AND policyname = 'kitteo_precounts_update_authenticated'
  ) THEN
    CREATE POLICY kitteo_precounts_update_authenticated
      ON public.kitteo_precounts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kitteo_precounts'
      AND policyname = 'kitteo_precounts_delete_authenticated'
  ) THEN
    CREATE POLICY kitteo_precounts_delete_authenticated
      ON public.kitteo_precounts FOR DELETE TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kitteo_precount_items'
      AND policyname = 'kitteo_precount_items_select_authenticated'
  ) THEN
    CREATE POLICY kitteo_precount_items_select_authenticated
      ON public.kitteo_precount_items FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kitteo_precount_items'
      AND policyname = 'kitteo_precount_items_insert_authenticated'
  ) THEN
    CREATE POLICY kitteo_precount_items_insert_authenticated
      ON public.kitteo_precount_items FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kitteo_precount_items'
      AND policyname = 'kitteo_precount_items_update_authenticated'
  ) THEN
    CREATE POLICY kitteo_precount_items_update_authenticated
      ON public.kitteo_precount_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kitteo_precount_items'
      AND policyname = 'kitteo_precount_items_delete_authenticated'
  ) THEN
    CREATE POLICY kitteo_precount_items_delete_authenticated
      ON public.kitteo_precount_items FOR DELETE TO authenticated USING (true);
  END IF;
END
$$;

-- 5) Verificación opcional.
SELECT
  (SELECT COUNT(*) FROM public.kitteo_precounts) AS total_preconteos,
  (SELECT COUNT(*) FROM public.kitteo_precount_items) AS total_articulos_preconteo;
