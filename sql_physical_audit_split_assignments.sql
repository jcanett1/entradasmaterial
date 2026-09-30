-- ============================================================================
-- AUDITORÍA FÍSICA: KITTO Y DIVISIÓN DE RACKS POR LOCACIONES
-- ============================================================================
-- Ejecutar en Supabase > SQL Editor DESPUÉS de:
--   1) physical_audit_migration.sql
--   2) physical_audit_security_fix.sql
--
-- Esta migración no modifica entries, locations, location_items,
-- kitteo_locations ni kitteo_location_items.
-- ============================================================================

BEGIN;

-- 1) Identificar el origen de cada rack y permitir varios bloques del mismo rack.
ALTER TABLE public.physical_audit_rack_assignments
  ADD COLUMN IF NOT EXISTS source varchar(20) NOT NULL DEFAULT 'normal';

ALTER TABLE public.physical_audit_locations
  ADD COLUMN IF NOT EXISTS source varchar(20) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS assignment_id bigint NULL
    REFERENCES public.physical_audit_rack_assignments(id) ON DELETE CASCADE;

-- location_id antes apuntaba obligatoriamente a locations. Como ahora también
-- guarda IDs de kitteo_locations, la integridad se controla con source + id.
ALTER TABLE public.physical_audit_locations
  DROP CONSTRAINT IF EXISTS physical_audit_locations_location_id_fkey;

-- 2) Validar únicamente los dos orígenes soportados.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.physical_audit_rack_assignments'::regclass
      AND conname = 'physical_audit_rack_assignments_source_check'
  ) THEN
    ALTER TABLE public.physical_audit_rack_assignments
      ADD CONSTRAINT physical_audit_rack_assignments_source_check
      CHECK (source IN ('normal', 'kitto'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.physical_audit_locations'::regclass
      AND conname = 'physical_audit_locations_source_check'
  ) THEN
    ALTER TABLE public.physical_audit_locations
      ADD CONSTRAINT physical_audit_locations_source_check
      CHECK (source IN ('normal', 'kitto'));
  END IF;
END
$$;

-- 3) Reemplazar las restricciones que impedían dividir un rack o repetir el
-- mismo código de locación entre el almacén normal y Kitto.
ALTER TABLE public.physical_audit_rack_assignments
  DROP CONSTRAINT IF EXISTS physical_audit_rack_assignments_unique_rack;

CREATE UNIQUE INDEX IF NOT EXISTS idx_physical_audit_assignments_block_unique
  ON public.physical_audit_rack_assignments(audit_id, source, rack, contador_user_id);

ALTER TABLE public.physical_audit_locations
  DROP CONSTRAINT IF EXISTS physical_audit_locations_unique_location;

CREATE UNIQUE INDEX IF NOT EXISTS idx_physical_audit_locations_source_unique
  ON public.physical_audit_locations(audit_id, source, location_code);

-- 4) Relacionar las asignaciones y locaciones existentes creadas antes de
-- esta migración. Sus registros se consideran del almacén normal.
UPDATE public.physical_audit_rack_assignments
SET source = 'normal'
WHERE source IS NULL OR source = '';

UPDATE public.physical_audit_locations
SET source = 'normal'
WHERE source IS NULL OR source = '';

UPDATE public.physical_audit_locations AS al
SET assignment_id = ra.id
FROM public.physical_audit_rack_assignments AS ra
WHERE al.assignment_id IS NULL
  AND al.audit_id = ra.audit_id
  AND al.source = ra.source
  AND al.rack = ra.rack;

CREATE INDEX IF NOT EXISTS idx_physical_audit_assignments_source_rack
  ON public.physical_audit_rack_assignments(audit_id, source, rack);

CREATE INDEX IF NOT EXISTS idx_physical_audit_locations_assignment
  ON public.physical_audit_locations(assignment_id);

COMMIT;

-- Verificación opcional:
-- SELECT source, rack, contador_user_id, COUNT(*)
-- FROM public.physical_audit_rack_assignments
-- GROUP BY source, rack, contador_user_id;
--
-- SELECT source, rack, COUNT(*)
-- FROM public.physical_audit_locations
-- GROUP BY source, rack;
