-- ============================================================
-- MIGRACIÓN: permitir devolver a una locación ocupada
-- Agrega la partida como otra fila en location_items y conserva
-- las asignaciones existentes. Nunca sobrescribe el material actual.
-- ============================================================

CREATE OR REPLACE FUNCTION public.return_shipping_direct_to_location(p_shipping_direct_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_record public.shipping_direct%ROWTYPE;
  v_location public.locations%ROWTYPE;
  v_fifo_number integer;
  v_legacy_fifo_number integer;
  v_existing_item_count bigint;
  v_now timestamp without time zone := now();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada para regresar el material.';
  END IF;

  SELECT COALESCE(NULLIF(BTRIM(ua.nombre_completo), ''), NULLIF(BTRIM(ua.email), ''), 'Usuario')
    INTO v_actor_name
  FROM public.usuarioalmacen AS ua
  WHERE ua.user_id = v_actor_id
    AND ua.activo = true
  LIMIT 1;

  IF v_actor_name IS NULL THEN
    RAISE EXCEPTION 'No se encontró un perfil activo para la sesión actual.';
  END IF;

  SELECT * INTO v_record
  FROM public.shipping_direct
  WHERE id = p_shipping_direct_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la salida de Shipping Direct solicitada.';
  END IF;

  IF v_record.returned_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta salida ya fue regresada a su locación original.';
  END IF;

  IF v_record.location_id IS NOT NULL THEN
    SELECT * INTO v_location
    FROM public.locations
    WHERE id = v_record.location_id
    FOR UPDATE;
  END IF;

  -- Compatibilidad con registros históricos que guardaron solo el código.
  IF v_location.id IS NULL AND NULLIF(BTRIM(v_record.location_code), '') IS NOT NULL THEN
    SELECT * INTO v_location
    FROM public.locations
    WHERE location_code = BTRIM(v_record.location_code)
    FOR UPDATE;
  END IF;

  IF v_location.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la locación original de esta salida.';
  END IF;

  IF v_location.status NOT IN ('disponible', 'ocupado') THEN
    RAISE EXCEPTION 'La locación % tiene un estado no compatible con el regreso.', v_location.location_code;
  END IF;

  SELECT COUNT(*) INTO v_existing_item_count
  FROM public.location_items AS li
  WHERE li.location_id = v_location.id;

  -- En ubicaciones ocupadas heredadas, materializa primero el resumen antiguo
  -- en location_items si aún no existe allí; así la vista múltiple no lo oculta.
  IF v_location.status = 'ocupado'
     AND v_existing_item_count = 0
     AND NULLIF(BTRIM(v_location.part_number), '') IS NOT NULL THEN
    v_legacy_fifo_number := NULL;
    IF v_location.entry_id IS NOT NULL THEN
      SELECT fl.fifo_number INTO v_legacy_fifo_number
      FROM public.fifo_labels AS fl
      WHERE fl.entry_id = v_location.entry_id
      ORDER BY fl.id ASC
      LIMIT 1;
    END IF;

    INSERT INTO public.location_items (
      location_id, location_code, entry_id, part_number, po, qty, fifo_number, assigned_at
    ) VALUES (
      v_location.id,
      v_location.location_code,
      v_location.entry_id,
      v_location.part_number,
      v_location.po,
      COALESCE(v_location.qty, 0),
      v_legacy_fifo_number,
      COALESCE(v_location.assigned_at, v_now)
    );
    v_existing_item_count := 1;
  END IF;

  v_fifo_number := v_record.fifo_number;
  IF v_fifo_number IS NULL AND v_record.entry_id IS NOT NULL THEN
    SELECT fl.fifo_number INTO v_fifo_number
    FROM public.fifo_labels AS fl
    WHERE fl.entry_id = v_record.entry_id
    ORDER BY fl.id ASC
    LIMIT 1;
  END IF;

  -- Evita duplicar exactamente la misma entrada/FIFO en esa locación.
  IF EXISTS (
    SELECT 1
    FROM public.location_items AS li
    WHERE li.location_id = v_location.id
      AND li.entry_id IS NOT DISTINCT FROM v_record.entry_id
      AND li.part_number = v_record.part_number
      AND li.po IS NOT DISTINCT FROM v_record.po
      AND li.fifo_number IS NOT DISTINCT FROM v_fifo_number
  ) THEN
    RAISE EXCEPTION 'La misma partida ya está asignada a la locación %; no se duplicó.', v_location.location_code;
  END IF;

  INSERT INTO public.location_items (
    location_id, location_code, entry_id, part_number, po, qty, fifo_number, assigned_at
  ) VALUES (
    v_location.id,
    v_location.location_code,
    v_record.entry_id,
    v_record.part_number,
    v_record.po,
    v_record.qty,
    v_fifo_number,
    v_now
  );

  IF v_existing_item_count = 0 THEN
    -- La locación estaba libre: la devolución es su primera asignación.
    UPDATE public.locations
    SET status = 'ocupado',
        entry_id = v_record.entry_id,
        part_number = v_record.part_number,
        qty = v_record.qty,
        po = v_record.po,
        assigned_at = v_now
    WHERE id = v_location.id;
  ELSE
    -- La locación ya tenía artículos: conservar su resumen y sumar la nueva fila.
    UPDATE public.locations
    SET status = 'ocupado'
    WHERE id = v_location.id;
  END IF;

  UPDATE public.shipping_direct
  SET returned_at = v_now,
      returned_by = LEFT(v_actor_name, 100)
  WHERE id = v_record.id;
END;
$$;

REVOKE ALL ON FUNCTION public.return_shipping_direct_to_location(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_shipping_direct_to_location(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
