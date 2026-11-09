CREATE OR REPLACE FUNCTION public.inventory_history_entry_unavailable(
  p_entry_id integer,
  p_part_number text,
  p_po text,
  p_registered_at timestamp without time zone,
  p_total_units integer,
  p_total_boxes integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM public.location_items AS li
      WHERE li.entry_id = p_entry_id
         OR (
           li.entry_id IS NULL AND li.fifo_number IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM public.fifo_labels AS fl
             WHERE fl.entry_id = p_entry_id AND fl.fifo_number = li.fifo_number
               AND fl.part_number IS NOT NULL AND fl.part_number <> ''
               AND li.part_number IS NOT NULL AND li.part_number <> ''
               AND public.inventory_return_normalize_part(fl.part_number) = public.inventory_return_normalize_part(li.part_number)
               AND public.inventory_return_normalize_po(fl.po) = public.inventory_return_normalize_po(li.po)
           )
         )
    )
    OR EXISTS (SELECT 1 FROM public.locations AS l WHERE l.entry_id = p_entry_id)
    OR EXISTS (SELECT 1 FROM public.transferes AS t WHERE t.entry_id = p_entry_id)
    OR EXISTS (SELECT 1 FROM public.kitteo_location_items AS kli WHERE kli.entry_id = p_entry_id)
    OR EXISTS (
      SELECT 1 FROM public.kitteo_locations AS kl
      WHERE kl.entry_id = p_entry_id AND kl.status = 'ocupado'
    )
    OR EXISTS (
      SELECT 1 FROM public.shipping_direct AS sd
      WHERE sd.returned_at IS NULL
        AND (
          sd.entry_id = p_entry_id
          OR (
            sd.entry_id IS NULL AND sd.exited_at IS NOT NULL AND p_registered_at <= sd.exited_at
            AND public.inventory_return_normalize_part(sd.part_number) = public.inventory_return_normalize_part(p_part_number)
            AND public.inventory_return_normalize_po(sd.po) = public.inventory_return_normalize_po(p_po)
            AND (sd.qty IS NULL OR sd.qty = p_total_units)
            AND (sd.boxes IS NULL OR sd.boxes = p_total_boxes)
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.kitteo_exits AS ke
      WHERE ke.returned_at IS NULL
        AND (
          ke.entry_id = p_entry_id
          OR (
            ke.entry_id IS NULL AND ke.exited_at IS NOT NULL AND p_registered_at <= ke.exited_at
            AND public.inventory_return_normalize_part(ke.part_number) = public.inventory_return_normalize_part(p_part_number)
            AND public.inventory_return_normalize_po(ke.po) = public.inventory_return_normalize_po(p_po)
            AND (ke.qty IS NULL OR ke.qty = p_total_units)
            AND (ke.boxes IS NULL OR ke.boxes = p_total_boxes)
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.shipping_direct AS sd
      JOIN public.inventory_return_events AS ire
        ON ire.source_exit_type = 'shipping_direct' AND ire.source_exit_id = sd.id
      WHERE sd.entry_id IS NULL AND sd.returned_at IS NOT NULL
        AND ire.source_match_is_ambiguous IS TRUE AND ire.entry_id <> p_entry_id
        AND sd.exited_at IS NOT NULL AND p_registered_at <= sd.exited_at
        AND public.inventory_return_normalize_part(sd.part_number) = public.inventory_return_normalize_part(p_part_number)
        AND public.inventory_return_normalize_po(sd.po) = public.inventory_return_normalize_po(p_po)
        AND (sd.qty IS NULL OR sd.qty = p_total_units)
        AND (sd.boxes IS NULL OR sd.boxes = p_total_boxes)
    )
    OR EXISTS (
      SELECT 1
      FROM public.kitteo_exits AS ke
      JOIN public.inventory_return_events AS ire
        ON ire.source_exit_type = 'kitteo_exits' AND ire.source_exit_id = ke.id
      WHERE ke.entry_id IS NULL AND ke.returned_at IS NOT NULL
        AND ire.source_match_is_ambiguous IS TRUE AND ire.entry_id <> p_entry_id
        AND ke.exited_at IS NOT NULL AND p_registered_at <= ke.exited_at
        AND public.inventory_return_normalize_part(ke.part_number) = public.inventory_return_normalize_part(p_part_number)
        AND public.inventory_return_normalize_po(ke.po) = public.inventory_return_normalize_po(p_po)
        AND (ke.qty IS NULL OR ke.qty = p_total_units)
        AND (ke.boxes IS NULL OR ke.boxes = p_total_boxes)
    );
$function$;

CREATE OR REPLACE FUNCTION public.inventory_history_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'total', count(*)::bigint,
    'units', COALESCE(sum(e.total_units), 0)::bigint,
    'boxes', COALESCE(sum(e.total_boxes), 0)::bigint
  )
  FROM public.entries AS e;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_history_page(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_search text DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_available_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_page integer := COALESCE(p_page, 1);
  v_page_size integer := COALESCE(p_page_size, 25);
  v_search_key text := public.inventory_history_search_key(COALESCE(p_search, ''));
  v_search_pattern text;
  v_total_count bigint;
  v_rows jsonb;
BEGIN
  IF v_page < 1 THEN
    RAISE EXCEPTION 'La página debe ser mayor que cero.';
  END IF;
  IF v_page_size < 1 OR v_page_size > 1000 THEN
    RAISE EXCEPTION 'El tamaño de página debe estar entre 1 y 1000.';
  END IF;
  IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL AND p_date_from > p_date_to THEN
    RAISE EXCEPTION 'La fecha inicial no puede ser posterior a la fecha final.';
  END IF;

  v_search_pattern := '%' || replace(replace(replace(v_search_key, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%';

  WITH filtered AS MATERIALIZED (
    SELECT e.id, e.part_number, e.description, e.total_units, e.total_boxes,
           e.unit_of_measure, e.registered_by, e.registered_at, e.po
    FROM public.entries AS e
    WHERE (p_date_from IS NULL OR e.registered_at >= p_date_from::timestamp)
      AND (p_date_to IS NULL OR e.registered_at < (p_date_to + 1)::timestamp)
      AND (
        v_search_key = ''
        OR public.inventory_history_search_key(e.part_number) LIKE v_search_pattern ESCAPE chr(92)
        OR public.inventory_history_search_key(e.description) LIKE v_search_pattern ESCAPE chr(92)
        OR public.inventory_history_search_key(e.unit_of_measure) LIKE v_search_pattern ESCAPE chr(92)
        OR public.inventory_history_search_key(e.registered_by) LIKE v_search_pattern ESCAPE chr(92)
        OR public.inventory_history_search_key(e.po) LIKE v_search_pattern ESCAPE chr(92)
      )
      AND (
        NOT COALESCE(p_available_only, false)
        OR NOT public.inventory_history_entry_unavailable(
          e.id, e.part_number, e.po, e.registered_at, e.total_units, e.total_boxes
        )
      )
  ), page_rows AS (
    SELECT * FROM filtered
    ORDER BY registered_at DESC, id DESC
    LIMIT v_page_size OFFSET ((v_page::bigint - 1) * v_page_size::bigint)
  )
  SELECT
    (SELECT count(*)::bigint FROM filtered),
    COALESCE((SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY page_rows.registered_at DESC, page_rows.id DESC) FROM page_rows), '[]'::jsonb)
    INTO v_total_count, v_rows;

  RETURN jsonb_build_object('rows', COALESCE(v_rows, '[]'::jsonb), 'total_count', v_total_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.inventory_history_entry_unavailable(integer, text, text, timestamp without time zone, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_history_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_history_page(integer, integer, text, date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_history_entry_unavailable(integer, text, text, timestamp without time zone, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_history_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_history_page(integer, integer, text, date, date, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
