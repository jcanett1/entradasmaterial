-- ============================================================================
-- AUDITORÍA FÍSICA: SOLICITAR RECUENTO DE UNA LOCACIÓN
-- ============================================================================
-- Ejecutar en Supabase > SQL Editor después de las migraciones base de
-- auditoría física y de sql_physical_audit_split_assignments.sql.
--
-- La solicitud conserva quién hizo el conteo anterior, reinicia la captura
-- de todos los artículos de la locación y la deja disponible para el contador.
-- El estado visible "Recontar" se controla con recount_requested para no
-- modificar el catálogo de estados existente de physical_audit_locations.
-- ============================================================================

BEGIN;

ALTER TABLE public.physical_audit_locations
  ADD COLUMN IF NOT EXISTS recount_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recount_requested_by text NULL,
  ADD COLUMN IF NOT EXISTS recount_requested_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_counted_by text NULL,
  ADD COLUMN IF NOT EXISTS last_counted_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_physical_audit_locations_recount_requested
  ON public.physical_audit_locations(audit_id, recount_requested)
  WHERE recount_requested = true;

-- Al cerrar una locación que estaba en recuento, el estado visible vuelve a
-- ser Completada. El contador mantiene el flujo normal de "Terminar locación".
CREATE OR REPLACE FUNCTION public.physical_audit_finish_recount_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completada' AND NEW.recount_requested THEN
    NEW.recount_requested := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_physical_audit_finish_recount_status
  ON public.physical_audit_locations;

CREATE TRIGGER trg_physical_audit_finish_recount_status
BEFORE UPDATE OF status ON public.physical_audit_locations
FOR EACH ROW
EXECUTE FUNCTION public.physical_audit_finish_recount_status();

CREATE OR REPLACE FUNCTION public.physical_audit_request_recount(
  p_audit_location_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_location public.physical_audit_locations%ROWTYPE;
  v_last_counted_by text;
  v_last_counted_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para solicitar un recuento.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.usuarioalmacen
    WHERE user_id::text = v_user_id::text
      AND activo = true
      AND rol IN ('admin', 'supervisor')
  ) THEN
    RAISE EXCEPTION 'Solo un administrador o supervisor puede solicitar un recuento.';
  END IF;

  SELECT *
  INTO v_location
  FROM public.physical_audit_locations
  WHERE id = p_audit_location_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La locación de auditoría no existe.';
  END IF;

  IF v_location.recount_requested THEN
    RETURN;
  END IF;

  SELECT counted_by::text, counted_at
  INTO v_last_counted_by, v_last_counted_at
  FROM public.physical_audit_items
  WHERE audit_location_id = p_audit_location_id
    AND counted_by IS NOT NULL
  ORDER BY counted_at DESC NULLS LAST
  LIMIT 1;

  UPDATE public.physical_audit_locations
  SET recount_requested = true,
      recount_requested_by = v_user_id::text,
      recount_requested_at = now(),
      last_counted_by = v_last_counted_by,
      last_counted_at = v_last_counted_at,
      status = 'pendiente',
      updated_at = now()
  WHERE id = p_audit_location_id;

  -- Reiniciar todos los artículos de la locación. El RPC existente de
  -- registro de conteos podrá capturarlos nuevamente porque found_qty queda
  -- NULL y la locación vuelve a estar pendiente.
  UPDATE public.physical_audit_items
  SET found_qty = NULL,
      counted_by = NULL,
      counted_at = NULL
  WHERE audit_location_id = p_audit_location_id;

  IF v_location.assignment_id IS NOT NULL THEN
    UPDATE public.physical_audit_rack_assignments
    SET status = 'en_progreso',
        updated_at = now()
    WHERE id = v_location.assignment_id;
  END IF;

  UPDATE public.physical_audits
  SET status = 'en_progreso',
      completed_at = NULL,
      updated_at = now()
  WHERE id = v_location.audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.physical_audit_request_recount(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.physical_audit_request_recount(bigint) TO authenticated;

COMMIT;

-- Verificación opcional:
-- SELECT id, location_code, status, recount_requested,
--        last_counted_by, last_counted_at
-- FROM public.physical_audit_locations
-- WHERE recount_requested = true;
