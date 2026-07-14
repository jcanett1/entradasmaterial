-- ============================================================
--  TABLA: locations  (Racks / Locaciones)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.locations (
  id            serial        NOT NULL,
  rack          varchar(10)   NOT NULL,          -- Ej. 'A', 'B', 'F'
  location_code varchar(20)   NOT NULL UNIQUE,   -- Ej. 'A-01', 'F-21'
  description   text          NULL,              -- Descripción opcional
  status        varchar(20)   NOT NULL DEFAULT 'disponible',  -- disponible | ocupado
  entry_id      integer       NULL REFERENCES public.entries(id) ON DELETE SET NULL,
  part_number   varchar(100)  NULL,
  qty           integer       NULL,
  po            varchar(100)  NULL,
  assigned_at   timestamp     NULL,
  created_at    timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT locations_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_locations_rack   ON public.locations(rack);
CREATE INDEX IF NOT EXISTS idx_locations_status ON public.locations(status);

-- ============================================================
--  INSERTAR LOCACIONES
--  Racks A, B, C  → 48 locaciones cada uno
--  Racks D, E     → 42 locaciones cada uno
--  Rack  F        → 21 locaciones
--  Rack  G        → 32 locaciones
-- ============================================================

-- Rack A (48 locaciones)
INSERT INTO public.locations (rack, location_code) VALUES
('A','A-01'),('A','A-02'),('A','A-03'),('A','A-04'),('A','A-05'),('A','A-06'),
('A','A-07'),('A','A-08'),('A','A-09'),('A','A-10'),('A','A-11'),('A','A-12'),
('A','A-13'),('A','A-14'),('A','A-15'),('A','A-16'),('A','A-17'),('A','A-18'),
('A','A-19'),('A','A-20'),('A','A-21'),('A','A-22'),('A','A-23'),('A','A-24'),
('A','A-25'),('A','A-26'),('A','A-27'),('A','A-28'),('A','A-29'),('A','A-30'),
('A','A-31'),('A','A-32'),('A','A-33'),('A','A-34'),('A','A-35'),('A','A-36'),
('A','A-37'),('A','A-38'),('A','A-39'),('A','A-40'),('A','A-41'),('A','A-42'),
('A','A-43'),('A','A-44'),('A','A-45'),('A','A-46'),('A','A-47'),('A','A-48')
ON CONFLICT (location_code) DO NOTHING;

-- Rack B (48 locaciones)
INSERT INTO public.locations (rack, location_code) VALUES
('B','B-01'),('B','B-02'),('B','B-03'),('B','B-04'),('B','B-05'),('B','B-06'),
('B','B-07'),('B','B-08'),('B','B-09'),('B','B-10'),('B','B-11'),('B','B-12'),
('B','B-13'),('B','B-14'),('B','B-15'),('B','B-16'),('B','B-17'),('B','B-18'),
('B','B-19'),('B','B-20'),('B','B-21'),('B','B-22'),('B','B-23'),('B','B-24'),
('B','B-25'),('B','B-26'),('B','B-27'),('B','B-28'),('B','B-29'),('B','B-30'),
('B','B-31'),('B','B-32'),('B','B-33'),('B','B-34'),('B','B-35'),('B','B-36'),
('B','B-37'),('B','B-38'),('B','B-39'),('B','B-40'),('B','B-41'),('B','B-42'),
('B','B-43'),('B','B-44'),('B','B-45'),('B','B-46'),('B','B-47'),('B','B-48')
ON CONFLICT (location_code) DO NOTHING;

-- Rack C (48 locaciones)
INSERT INTO public.locations (rack, location_code) VALUES
('C','C-01'),('C','C-02'),('C','C-03'),('C','C-04'),('C','C-05'),('C','C-06'),
('C','C-07'),('C','C-08'),('C','C-09'),('C','C-10'),('C','C-11'),('C','C-12'),
('C','C-13'),('C','C-14'),('C','C-15'),('C','C-16'),('C','C-17'),('C','C-18'),
('C','C-19'),('C','C-20'),('C','C-21'),('C','C-22'),('C','C-23'),('C','C-24'),
('C','C-25'),('C','C-26'),('C','C-27'),('C','C-28'),('C','C-29'),('C','C-30'),
('C','C-31'),('C','C-32'),('C','C-33'),('C','C-34'),('C','C-35'),('C','C-36'),
('C','C-37'),('C','C-38'),('C','C-39'),('C','C-40'),('C','C-41'),('C','C-42'),
('C','C-43'),('C','C-44'),('C','C-45'),('C','C-46'),('C','C-47'),('C','C-48')
ON CONFLICT (location_code) DO NOTHING;

-- Rack D (42 locaciones)
INSERT INTO public.locations (rack, location_code) VALUES
('D','D-01'),('D','D-02'),('D','D-03'),('D','D-04'),('D','D-05'),('D','D-06'),
('D','D-07'),('D','D-08'),('D','D-09'),('D','D-10'),('D','D-11'),('D','D-12'),
('D','D-13'),('D','D-14'),('D','D-15'),('D','D-16'),('D','D-17'),('D','D-18'),
('D','D-19'),('D','D-20'),('D','D-21'),('D','D-22'),('D','D-23'),('D','D-24'),
('D','D-25'),('D','D-26'),('D','D-27'),('D','D-28'),('D','D-29'),('D','D-30'),
('D','D-31'),('D','D-32'),('D','D-33'),('D','D-34'),('D','D-35'),('D','D-36'),
('D','D-37'),('D','D-38'),('D','D-39'),('D','D-40'),('D','D-41'),('D','D-42')
ON CONFLICT (location_code) DO NOTHING;

-- Rack E (42 locaciones)
INSERT INTO public.locations (rack, location_code) VALUES
('E','E-01'),('E','E-02'),('E','E-03'),('E','E-04'),('E','E-05'),('E','E-06'),
('E','E-07'),('E','E-08'),('E','E-09'),('E','E-10'),('E','E-11'),('E','E-12'),
('E','E-13'),('E','E-14'),('E','E-15'),('E','E-16'),('E','E-17'),('E','E-18'),
('E','E-19'),('E','E-20'),('E','E-21'),('E','E-22'),('E','E-23'),('E','E-24'),
('E','E-25'),('E','E-26'),('E','E-27'),('E','E-28'),('E','E-29'),('E','E-30'),
('E','E-31'),('E','E-32'),('E','E-33'),('E','E-34'),('E','E-35'),('E','E-36'),
('E','E-37'),('E','E-38'),('E','E-39'),('E','E-40'),('E','E-41'),('E','E-42')
ON CONFLICT (location_code) DO NOTHING;

-- Rack F (21 locaciones)
INSERT INTO public.locations (rack, location_code) VALUES
('F','F-01'),('F','F-02'),('F','F-03'),('F','F-04'),('F','F-05'),('F','F-06'),
('F','F-07'),('F','F-08'),('F','F-09'),('F','F-10'),('F','F-11'),('F','F-12'),
('F','F-13'),('F','F-14'),('F','F-15'),('F','F-16'),('F','F-17'),('F','F-18'),
('F','F-19'),('F','F-20'),('F','F-21')
ON CONFLICT (location_code) DO NOTHING;

-- Rack G (32 locaciones)
INSERT INTO public.locations (rack, location_code) VALUES
('G','G-01'),('G','G-02'),('G','G-03'),('G','G-04'),('G','G-05'),('G','G-06'),
('G','G-07'),('G','G-08'),('G','G-09'),('G','G-10'),('G','G-11'),('G','G-12'),
('G','G-13'),('G','G-14'),('G','G-15'),('G','G-16'),('G','G-17'),('G','G-18'),
('G','G-19'),('G','G-20'),('G','G-21'),('G','G-22'),('G','G-23'),('G','G-24'),
('G','G-25'),('G','G-26'),('G','G-27'),('G','G-28'),('G','G-29'),('G','G-30'),
('G','G-31'),('G','G-32')
ON CONFLICT (location_code) DO NOTHING;

-- ============================================================
--  TABLA: exits  (Salidas → KITTEO)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.exits (
  id            serial        NOT NULL,
  part_number   varchar(100)  NOT NULL,
  description   text          NULL,
  qty           integer       NOT NULL,
  po            varchar(100)  NULL,
  location_code varchar(20)   NULL,
  destination   varchar(100)  NOT NULL DEFAULT 'KITTEO',
  entry_id      integer       NULL REFERENCES public.entries(id) ON DELETE SET NULL,
  location_id   integer       NULL REFERENCES public.locations(id) ON DELETE SET NULL,
  registered_by varchar(100)  NULL,
  exited_at     timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT exits_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_exits_part_number ON public.exits(part_number);
CREATE INDEX IF NOT EXISTS idx_exits_exited_at   ON public.exits(exited_at);
