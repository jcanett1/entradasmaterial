-- ============================================================
-- TABLA: kitteo_exits
-- Historial de salidas definitivas de locaciones KITTEO
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kitteo_exits (
  id            serial        NOT NULL,
  rack          varchar(20)   NOT NULL,
  location_code varchar(20)   NOT NULL,
  part_number   varchar(100)  NOT NULL,
  description   text          NULL,
  qty           integer       NULL,
  boxes         integer       NULL,
  po            varchar(100)  NULL,
  registered_by varchar(100)  NULL,
  exited_at     timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT kitteo_exits_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_kitteo_exits_part_number  ON public.kitteo_exits (part_number);
CREATE INDEX IF NOT EXISTS idx_kitteo_exits_location_code ON public.kitteo_exits (location_code);
CREATE INDEX IF NOT EXISTS idx_kitteo_exits_exited_at    ON public.kitteo_exits (exited_at);

-- ── Políticas RLS (igual que las demás tablas del proyecto) ──
ALTER TABLE public.kitteo_exits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select for authenticated users"
ON public.kitteo_exits FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated users"
ON public.kitteo_exits FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update for authenticated users"
ON public.kitteo_exits FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete for authenticated users"
ON public.kitteo_exits FOR DELETE TO authenticated USING (true);

-- ── Verificar ──
SELECT 'Tabla kitteo_exits creada correctamente' AS resultado;
