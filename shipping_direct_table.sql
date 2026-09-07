-- ============================================================
-- TABLA: shipping_direct
-- Salidas definitivas enviadas directamente a Shipping Direct
-- Ejecutar en el SQL Editor de Supabase antes de usar el botón
-- "Salida definitiva (Shipping Direct)".
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shipping_direct (
  id                  serial        NOT NULL,
  -- Se conserva como referencia histórica aunque la fila de transferes se elimine.
  source_transfer_id  integer       NOT NULL,
  part_number         varchar(100)  NOT NULL,
  description         text          NULL,
  qty                 integer       NOT NULL DEFAULT 0,
  boxes               integer       NULL,
  po                  varchar(100)  NULL,
  location_code       varchar(20)   NULL,
  location_id         integer       NULL REFERENCES public.locations(id) ON DELETE SET NULL,
  entry_id            integer       NULL REFERENCES public.entries(id) ON DELETE SET NULL,
  destination         varchar(100)  NOT NULL DEFAULT 'SHIPPING DIRECT',
  registered_by       varchar(100)  NULL,
  exited_at           timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at         timestamp     NULL,
  reviewed_by         varchar(100)  NULL,
  CONSTRAINT shipping_direct_pkey PRIMARY KEY (id),
  CONSTRAINT shipping_direct_source_transfer_unique UNIQUE (source_transfer_id)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_shipping_direct_part_number
  ON public.shipping_direct (part_number);
CREATE INDEX IF NOT EXISTS idx_shipping_direct_exited_at
  ON public.shipping_direct (exited_at);
CREATE INDEX IF NOT EXISTS idx_shipping_direct_location_code
  ON public.shipping_direct (location_code);

ALTER TABLE public.shipping_direct ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipping_direct'
      AND policyname = 'shipping_direct_select_authenticated'
  ) THEN
    CREATE POLICY shipping_direct_select_authenticated
      ON public.shipping_direct FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipping_direct'
      AND policyname = 'shipping_direct_insert_authenticated'
  ) THEN
    CREATE POLICY shipping_direct_insert_authenticated
      ON public.shipping_direct FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipping_direct'
      AND policyname = 'shipping_direct_update_authenticated'
  ) THEN
    CREATE POLICY shipping_direct_update_authenticated
      ON public.shipping_direct FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipping_direct'
      AND policyname = 'shipping_direct_delete_authenticated'
  ) THEN
    CREATE POLICY shipping_direct_delete_authenticated
      ON public.shipping_direct FOR DELETE TO authenticated USING (true);
  END IF;
END
$$;

SELECT 'Tabla shipping_direct creada correctamente' AS resultado;
