-- ============================================================
--  TABLA: location_items
--  Permite hasta 8 números de parte distintos por locación.
--  Cada fila = un grupo (part_number + PO) dentro de una
--  locación, con su propia qty, fifo y fecha de entrada.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.location_items (
  id            serial        NOT NULL,
  location_id   integer       NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  location_code varchar(20)   NOT NULL,
  entry_id      integer       NULL     REFERENCES public.entries(id) ON DELETE SET NULL,
  part_number   varchar(100)  NOT NULL,
  po            varchar(100)  NULL,
  qty           integer       NOT NULL DEFAULT 0,
  fifo_number   integer       NULL,
  assigned_at   timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT location_items_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_location_items_location_id ON public.location_items USING btree (location_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_location_items_part_number ON public.location_items USING btree (part_number) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_location_items_entry_id    ON public.location_items USING btree (entry_id)    TABLESPACE pg_default;

-- Row Level Security
ALTER TABLE public.location_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loc_items_select"
  ON public.location_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "loc_items_insert"
  ON public.location_items FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "loc_items_update"
  ON public.location_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "loc_items_delete"
  ON public.location_items FOR DELETE TO authenticated USING (true);
