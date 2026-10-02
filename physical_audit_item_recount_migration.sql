-- ============================================================================
-- AUDITORÍA FÍSICA: RECUENTO INDIVIDUAL DE UN NÚMERO DE PARTE
-- ============================================================================
-- Ejecutar en Supabase > SQL Editor después de la migración base de auditoría
-- física. Si ya se ejecutó physical_audit_recount_migration.sql, esta migración
-- agrega el flujo correcto a nivel de artículo; la aplicación deja de usar la
-- RPC anterior que reiniciaba la locación completa.
--
-- Un recuento afecta únicamente a physical_audit_items.id. El artículo conserva
-- su PO, FIFO, descripción y relación con la misma locación. Los demás artículos
-- de la locación no se modifican.
-- ============================================================================

BEGIN;

ALTER TABLE public.physical_audit_items
  ADD COLUMN IF NOT EXISTS recount_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recount_requested_by text NULL,
  ADD COLUMN IF NOT EXISTS recount_requested_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_counted_by text NULL,
  ADD COLUMN IF NOT EXISTS last_counted_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_physical_audit_items_recount_requested
  ON public.physical_audit_items(recount_requested)
  WHERE recount_requested = true;

-- Cuando el RPC existente de captura registra el nuevo conteo, el artículo
-- deja automáticamente el estado visible "Recontar". No se toca la locación.
CREATE OR REPLACE FUNCTION public.physical_audit_finish_item_recount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.found_qty IS NOT NULL
     AND NEW.counted_by IS NOT NULL
     AND OLD.recount_requested THEN
    NEW.recount_requested := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_physical_audit_finish_item_recount
  ON public.physical_audit_items;

CREATE TRIGGER trg_physical_audit_finish_item_recount
BEFORE UPDATE OF found_qty, counted_by, counted_at ON public.physical_audit_items
FOR EACH ROW
EXECUTE FUNCTION public.physical_audit_finish_item_recount();

-- Estado adicional que la aplicación combina con las RPC existentes de
-- contador/supervisor. Esto mantiene compatibilidad aunque esas RPC antiguas
-- no incluyan todavía las columnas nuevas del artículo.
CREATE OR REPLACE FUNCTION public.physical_audit_get_item_recount_states(
  p_audit_id bigint
)
RETURNS TABLE (
  item_id bigint,
  recount_requested boolean,
  recount_requested_by text,
  recount_requested_at timestamptz,
  last_counted_by text,
  last_counted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para consultar el estado del recuento.';
  END IF;

  SELECT rol::text
  INTO v_role
  FROM public.usuarioalmacen
  WHERE user_id::text = v_user_id::text
    AND activo = true
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'supervisor', 'contador') THEN
    RAISE EXCEPTION 'No tienes permisos para consultar esta auditoría.';
  END IF;

  RETURN QUERY
  SELECT
    item.id::bigint,
    item.recount_requested,
    item.recount_requested_by,
    item.recount_requested_at,
    item.last_counted_by,
    item.last_counted_at
  FROM public.physical_audit_items AS item
  INNER JOIN public.physical_audit_locations AS location
    ON location.id = item.audit_location_id
  WHERE location.audit_id = p_audit_id
    AND (
      v_role IN ('admin', 'supervisor')
      OR location.contador_user_id::text = v_user_id::text
    );
END;
$$;

-- Solicita el recuento de un solo artículo. No cambia el estado de la
-- locación, la asignación, la auditoría ni ningún otro artículo.
CREATE OR REPLACE FUNCTION public.physical_audit_request_item_recount(
  p_item_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_item public.physical_audit_items%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para solicitar un recuento.';
  END IF;

  SELECT rol::text
  INTO v_role
  FROM public.usuarioalmacen
  WHERE user_id::text = v_user_id::text
    AND activo = true
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'supervisor') THEN
    RAISE EXCEPTION 'Solo un administrador o supervisor puede solicitar un recuento.';
  END IF;

  SELECT item.*
  INTO v_item
  FROM public.physical_audit_items AS item
  INNER JOIN public.physical_audit_locations AS location
    ON location.id = item.audit_location_id
  WHERE item.id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El número de parte de auditoría no existe.';
  END IF;

  IF v_item.recount_requested THEN
    RETURN;
  END IF;

  IF v_item.found_qty IS NULL THEN
    RAISE EXCEPTION 'Este número de parte todavía no tiene un conteo registrado.';
  END IF;

  UPDATE public.physical_audit_items
  SET recount_requested = true,
      recount_requested_by = v_user_id::text,
      recount_requested_at = now(),
      last_counted_by = v_item.counted_by::text,
      last_counted_at = v_item.counted_at,
      found_qty = NULL,
      counted_by = NULL,
      counted_at = NULL
  WHERE id = p_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.physical_audit_get_item_recount_states(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.physical_audit_get_item_recount_states(bigint) TO authenticated;

REVOKE ALL ON FUNCTION public.physical_audit_request_item_recount(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.physical_audit_request_item_recount(bigint) TO authenticated;

COMMIT;

-- Verificación opcional:
-- SELECT item.id, item.part_number, item.po, item.fifo_number,
--        item.recount_requested, item.last_counted_by, item.last_counted_at,
--        location.location_code
-- FROM public.physical_audit_items item
-- JOIN public.physical_audit_locations location
--   ON location.id = item.audit_location_id
-- WHERE item.recount_requested = true;
