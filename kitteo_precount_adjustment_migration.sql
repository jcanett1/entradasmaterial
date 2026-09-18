-- ============================================================
-- MIGRACIÓN: AJUSTES AUTORIZADOS DE PRECONTEO KITTEO — ETAPA 2
-- ============================================================
-- Requiere haber ejecutado antes:
--   kitteo_precount_migration.sql
--
-- Agrega revisión y aprobación de preconteos finalizados.
-- Solo admin y supervisor pueden ejecutar la función de ajuste.
-- La función valida el rol dentro de la base de datos y no confía
-- únicamente en el botón o en el frontend.
-- ============================================================

-- 1) Estado de revisión del preconteo.
ALTER TABLE public.kitteo_precounts
  ADD COLUMN IF NOT EXISTS adjustment_status varchar(20) NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS reviewed_by varchar(255) NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS review_notes text NULL;

-- Los preconteos creados antes de esta migración quedan pendientes
-- únicamente si ya estaban finalizados; los borradores no se pueden ajustar.
UPDATE public.kitteo_precounts
SET adjustment_status = 'pendiente'
WHERE adjustment_status IS NULL;

ALTER TABLE public.kitteo_precounts
  DROP CONSTRAINT IF EXISTS kitteo_precounts_adjustment_status_check;

ALTER TABLE public.kitteo_precounts
  ADD CONSTRAINT kitteo_precounts_adjustment_status_check
  CHECK (adjustment_status IN ('pendiente', 'aplicado', 'sin_diferencia', 'rechazado'));

CREATE INDEX IF NOT EXISTS idx_kitteo_precounts_adjustment_status
  ON public.kitteo_precounts USING btree (adjustment_status);

-- 2) Función segura de revisión.
-- p_action permitido: 'aplicar' o 'rechazar'.
-- p_reviewer se conserva como parámetro de compatibilidad, pero la función
-- ignora ese valor y obtiene el nombre real desde usuarioalmacen + auth.uid().
-- Para 'aplicar', las cantidades contadas reemplazan las cantidades
-- actuales de los artículos que todavía existen en la locación.
CREATE OR REPLACE FUNCTION public.review_kitteo_precount(
  p_precount_id integer,
  p_action text,
  p_reviewer text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_precount public.kitteo_precounts%ROWTYPE;
  v_role text;
  v_reviewer text;
  v_has_difference boolean := false;
  v_item record;
  v_updated_count integer;
BEGIN
  -- Validar el usuario actual directamente contra usuarioalmacen.
  SELECT ua.rol,
         COALESCE(NULLIF(BTRIM(ua.nombre_completo), ''), NULLIF(BTRIM(ua.email), ''), auth.uid()::text)
    INTO v_role, v_reviewer
  FROM public.usuarioalmacen AS ua
  WHERE ua.user_id = auth.uid()
    AND ua.activo = true
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'supervisor') THEN
    RAISE EXCEPTION 'Solo admin o supervisor puede revisar ajustes de KITTEO';
  END IF;

  IF p_action NOT IN ('aplicar', 'rechazar') THEN
    RAISE EXCEPTION 'Acción de revisión no válida: %', p_action;
  END IF;

  SELECT *
    INTO v_precount
  FROM public.kitteo_precounts
  WHERE id = p_precount_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe el preconteo %', p_precount_id;
  END IF;

  IF v_precount.status <> 'finalizado' THEN
    RAISE EXCEPTION 'Solo se pueden revisar preconteos finalizados';
  END IF;

  IF v_precount.adjustment_status <> 'pendiente' THEN
    RAISE EXCEPTION 'Este preconteo ya fue revisado con estado %', v_precount.adjustment_status;
  END IF;

  IF p_action = 'rechazar' THEN
    UPDATE public.kitteo_precounts
    SET adjustment_status = 'rechazado',
        reviewed_by = v_reviewer,
        reviewed_at = CURRENT_TIMESTAMP,
        review_notes = COALESCE(NULLIF(BTRIM(p_notes), ''), 'Preconteo rechazado sin ajuste de inventario'),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_precount_id;

    RETURN jsonb_build_object(
      'precount_id', p_precount_id,
      'status', 'rechazado',
      'reviewed_by', v_reviewer
    );
  END IF;

  -- Aplicar los valores contados. No se crean artículos nuevos ni se
  -- eliminan artículos; si un artículo ya no existe, la operación falla
  -- para evitar ajustar una fila distinta por accidente.
  FOR v_item IN
    SELECT *
    FROM public.kitteo_precount_items
    WHERE precount_id = p_precount_id
    ORDER BY id
  LOOP
    IF v_item.counted_qty IS NULL THEN
      RAISE EXCEPTION 'El artículo % no tiene cantidad física capturada', v_item.part_number;
    END IF;

    IF v_item.counted_qty <> v_item.system_qty
       OR COALESCE(v_item.counted_boxes, v_item.system_boxes, 0) <> COALESCE(v_item.system_boxes, 0) THEN
      v_has_difference := true;
    END IF;

    IF v_item.location_item_id IS NOT NULL THEN
      UPDATE public.kitteo_location_items
      SET qty = v_item.counted_qty,
          boxes = CASE
            WHEN v_item.counted_boxes IS NULL THEN boxes
            ELSE v_item.counted_boxes
          END,
          registered_by = v_reviewer
      WHERE id = v_item.location_item_id
        AND location_id = v_precount.location_id;

      GET DIAGNOSTICS v_updated_count = ROW_COUNT;
      IF v_updated_count <> 1 THEN
        RAISE EXCEPTION 'El artículo % ya no existe en la locación %', v_item.part_number, v_precount.location_code;
      END IF;
    ELSE
      -- Compatibilidad con una locación ocupada heredada que todavía no
      -- tiene fila hija en kitteo_location_items.
      UPDATE public.kitteo_locations
      SET qty = v_item.counted_qty,
          boxes = CASE
            WHEN v_item.counted_boxes IS NULL THEN boxes
            ELSE v_item.counted_boxes
          END,
          registered_by = v_reviewer
      WHERE id = v_precount.location_id;
    END IF;
  END LOOP;

  -- Registrar al revisor en la locación principal sin alterar su estado.
  UPDATE public.kitteo_locations
  SET registered_by = v_reviewer
  WHERE id = v_precount.location_id;

  UPDATE public.kitteo_precounts
  SET adjustment_status = CASE WHEN v_has_difference THEN 'aplicado' ELSE 'sin_diferencia' END,
      reviewed_by = v_reviewer,
      reviewed_at = CURRENT_TIMESTAMP,
      review_notes = NULLIF(BTRIM(COALESCE(p_notes, '')), ''),
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_precount_id;

  RETURN jsonb_build_object(
    'precount_id', p_precount_id,
    'status', CASE WHEN v_has_difference THEN 'aplicado' ELSE 'sin_diferencia' END,
    'reviewed_by', v_reviewer,
    'location_id', v_precount.location_id
  );
END;
$$;

-- 3) Permiso de ejecución para usuarios autenticados.
REVOKE ALL ON FUNCTION public.review_kitteo_precount(integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_kitteo_precount(integer, text, text, text) TO authenticated;

-- 4) Verificación opcional.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'kitteo_precounts'
  AND column_name IN ('adjustment_status', 'reviewed_by', 'reviewed_at', 'review_notes')
ORDER BY ordinal_position;
