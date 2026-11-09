ALTER TABLE public.kitteo_exits
  ADD COLUMN IF NOT EXISTS returned_at timestamp without time zone,
  ADD COLUMN IF NOT EXISTS returned_by character varying;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_return_events_source_exit_unique_idx
  ON public.inventory_return_events (source_exit_type, source_exit_id);

CREATE OR REPLACE FUNCTION public.return_final_exit_to_inventory(
  p_entry_id integer,
  p_source_exit_type text,
  p_source_exit_id integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_entry public.entries%ROWTYPE;
  v_exit_entry_id integer;
  v_exit_part_number text;
  v_exit_po text;
  v_exit_qty integer;
  v_exit_boxes integer;
  v_exit_at timestamp without time zone;
  v_returned_at timestamp without time zone;
  v_candidate_count bigint := 0;
  v_match_is_ambiguous boolean := false;
  v_now timestamp without time zone := now();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada para regresar la entrada.';
  END IF;

  IF p_entry_id IS NULL OR p_source_exit_id IS NULL
     OR p_source_exit_type IS NULL
     OR p_source_exit_type NOT IN ('shipping_direct', 'kitteo_exits') THEN
    RAISE EXCEPTION 'La entrada o la salida seleccionada no es válida.';
  END IF;

  SELECT COALESCE(NULLIF(BTRIM(ua.nombre_completo), ''), NULLIF(BTRIM(ua.email), ''), 'Usuario')
    INTO v_actor_name
  FROM public.usuarioalmacen AS ua
  WHERE ua.user_id = v_actor_id
    AND ua.activo = true
    AND ua.rol IN ('admin', 'supervisor')
  LIMIT 1;

  IF v_actor_name IS NULL THEN
    RAISE EXCEPTION 'Solo supervisores y administradores pueden regresar entradas a inventario.';
  END IF;

  SELECT * INTO v_entry
  FROM public.entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la entrada original seleccionada.';
  END IF;

  IF p_source_exit_type = 'shipping_direct' THEN
    SELECT sd.entry_id, sd.part_number, sd.po, sd.qty, sd.boxes, sd.exited_at, sd.returned_at
      INTO v_exit_entry_id, v_exit_part_number, v_exit_po, v_exit_qty, v_exit_boxes, v_exit_at, v_returned_at
    FROM public.shipping_direct AS sd
    WHERE sd.id = p_source_exit_id
    FOR UPDATE;
  ELSE
    SELECT ke.entry_id, ke.part_number, ke.po, ke.qty, ke.boxes, ke.exited_at, ke.returned_at
      INTO v_exit_entry_id, v_exit_part_number, v_exit_po, v_exit_qty, v_exit_boxes, v_exit_at, v_returned_at
    FROM public.kitteo_exits AS ke
    WHERE ke.id = p_source_exit_id
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la salida definitiva seleccionada.';
  END IF;

  IF v_returned_at IS NOT NULL OR EXISTS (
    SELECT 1
    FROM public.inventory_return_events AS ire
    WHERE ire.source_exit_type = p_source_exit_type
      AND ire.source_exit_id = p_source_exit_id
  ) THEN
    RAISE EXCEPTION 'Esta salida definitiva ya fue regresada a inventario.';
  END IF;

  IF v_exit_entry_id IS NOT NULL THEN
    IF v_exit_entry_id <> p_entry_id THEN
      RAISE EXCEPTION 'La salida seleccionada no corresponde a esta entrada.';
    END IF;
  ELSE
    IF upper(regexp_replace(BTRIM(COALESCE(v_entry.part_number, '')), '\s+', '', 'g'))
         <> upper(regexp_replace(BTRIM(COALESCE(v_exit_part_number, '')), '\s+', '', 'g'))
       OR upper(BTRIM(COALESCE(v_entry.po, ''))) <> upper(BTRIM(COALESCE(v_exit_po, '')))
       OR v_exit_at IS NULL
       OR v_entry.registered_at IS NULL
       OR v_entry.registered_at > v_exit_at
       OR (v_exit_qty IS NOT NULL AND v_entry.total_units <> v_exit_qty)
       OR (v_exit_boxes IS NOT NULL AND v_entry.total_boxes <> v_exit_boxes) THEN
      RAISE EXCEPTION 'Los datos históricos de la salida no coinciden con la entrada seleccionada.';
    END IF;

    SELECT COUNT(*) INTO v_candidate_count
    FROM public.entries AS e
    WHERE upper(regexp_replace(BTRIM(COALESCE(e.part_number, '')), '\s+', '', 'g'))
            = upper(regexp_replace(BTRIM(COALESCE(v_exit_part_number, '')), '\s+', '', 'g'))
      AND upper(BTRIM(COALESCE(e.po, ''))) = upper(BTRIM(COALESCE(v_exit_po, '')))
      AND e.registered_at IS NOT NULL
      AND v_exit_at IS NOT NULL
      AND e.registered_at <= v_exit_at
      AND (v_exit_qty IS NULL OR e.total_units = v_exit_qty)
      AND (v_exit_boxes IS NULL OR e.total_boxes = v_exit_boxes);

    IF v_candidate_count = 0 THEN
      RAISE EXCEPTION 'No se encontró una entrada que coincida con la salida histórica.';
    END IF;

    v_match_is_ambiguous := v_candidate_count > 1;
  END IF;

  IF p_source_exit_type = 'shipping_direct' THEN
    UPDATE public.shipping_direct
    SET returned_at = v_now,
        returned_by = LEFT(v_actor_name, 100)
    WHERE id = p_source_exit_id
      AND returned_at IS NULL;
  ELSE
    UPDATE public.kitteo_exits
    SET returned_at = v_now,
        returned_by = LEFT(v_actor_name, 100)
    WHERE id = p_source_exit_id
      AND returned_at IS NULL;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta salida definitiva ya fue regresada a inventario.';
  END IF;

  INSERT INTO public.inventory_return_events (
    entry_id,
    source_exit_type,
    source_exit_id,
    source_match_is_ambiguous,
    returned_at,
    returned_by,
    returned_by_name,
    reason
  ) VALUES (
    p_entry_id,
    p_source_exit_type,
    p_source_exit_id,
    v_match_is_ambiguous,
    v_now,
    v_actor_id,
    LEFT(v_actor_name, 100),
    'Regreso a inventario desde la tabla de entradas; se conserva la entrada original.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.return_final_exit_to_inventory(integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.return_final_exit_to_inventory(integer, text, integer) TO authenticated;
