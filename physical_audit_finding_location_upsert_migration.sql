CREATE OR REPLACE FUNCTION public.physical_audit_report_finding(
  p_audit_id bigint,
  p_audit_location_id bigint,
  p_part_number character varying,
  p_description text,
  p_expected_location_code character varying,
  p_found_location_code character varying,
  p_found_rack character varying,
  p_found_qty integer,
  p_po character varying DEFAULT NULL::character varying,
  p_fifo_number integer DEFAULT NULL::integer,
  p_notes text DEFAULT NULL::text,
  p_expected_location_id integer DEFAULT NULL::integer,
  p_expected_location_item_id integer DEFAULT NULL::integer,
  p_found_location_id integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_finding_id bigint;
  v_audit_item_id bigint;
  v_created_at timestamptz;
  v_expected_location_id integer;
  v_expected_location_item_id integer;
  v_found_location_id integer;
  v_assigned_location_code character varying;
  v_assigned_rack character varying;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida';
  END IF;

  IF NULLIF(BTRIM(p_part_number), '') IS NULL THEN
    RAISE EXCEPTION 'El número de parte es obligatorio';
  END IF;

  IF NULLIF(BTRIM(p_found_location_code), '') IS NULL THEN
    RAISE EXCEPTION 'La locación donde se encontró es obligatoria';
  END IF;

  IF p_found_qty IS NULL OR p_found_qty < 0 THEN
    RAISE EXCEPTION 'La cantidad encontrada debe ser un entero mayor o igual a cero';
  END IF;

  SELECT al.location_code, al.rack
    INTO v_assigned_location_code, v_assigned_rack
  FROM public.physical_audit_locations al
  WHERE al.id = p_audit_location_id
    AND al.audit_id = p_audit_id
    AND al.status <> 'omitida'
    AND (
      public.physical_audit_is_manager()
      OR al.contador_user_id = auth.uid()
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No tienes permiso para reportar hallazgos en esta locación de la auditoría';
  END IF;

  -- Estas referencias apuntan a las tablas del inventario normal. El ID se acepta
  -- solo si coincide con el código de la locación seleccionada.
  SELECT l.id
    INTO v_expected_location_id
  FROM public.locations l
  WHERE l.id = p_expected_location_id
    AND (p_expected_location_code IS NULL OR l.location_code = p_expected_location_code)
  LIMIT 1;

  SELECT li.id
    INTO v_expected_location_item_id
  FROM public.location_items li
  WHERE li.id = p_expected_location_item_id
    AND (p_expected_location_code IS NULL OR li.location_code = p_expected_location_code)
  LIMIT 1;

  SELECT l.id
    INTO v_found_location_id
  FROM public.locations l
  WHERE l.id = p_found_location_id
    AND l.location_code = v_assigned_location_code
  LIMIT 1;

  v_created_at := now();

  INSERT INTO public.physical_audit_findings (
    audit_id,
    audit_location_id,
    reported_by,
    part_number,
    description,
    po,
    fifo_number,
    expected_location_id,
    expected_location_code,
    expected_location_item_id,
    found_location_id,
    found_location_code,
    found_rack,
    found_qty,
    notes,
    status
  ) VALUES (
    p_audit_id,
    p_audit_location_id,
    auth.uid(),
    BTRIM(p_part_number),
    NULLIF(BTRIM(p_description), ''),
    NULLIF(BTRIM(p_po), ''),
    p_fifo_number,
    v_expected_location_id,
    NULLIF(BTRIM(p_expected_location_code), ''),
    v_expected_location_item_id,
    v_found_location_id,
    v_assigned_location_code,
    v_assigned_rack,
    p_found_qty,
    NULLIF(BTRIM(p_notes), ''),
    'aplicado'
  )
  RETURNING id INTO v_finding_id;

  -- Reutiliza la fila del mismo artículo/lote en esa locación. El conteo físico
  -- se actualiza, pero se conserva la cantidad esperada y no se crea duplicado.
  INSERT INTO public.physical_audit_items (
    audit_location_id,
    location_item_id,
    entry_id,
    part_number,
    description,
    po,
    fifo_number,
    expected_qty,
    found_qty,
    counted_by,
    counted_at,
    notes
  ) VALUES (
    p_audit_location_id,
    NULL,
    NULL,
    BTRIM(p_part_number),
    NULLIF(BTRIM(p_description), ''),
    NULLIF(BTRIM(p_po), ''),
    p_fifo_number,
    0,
    p_found_qty,
    auth.uid(),
    v_created_at,
    NULLIF(BTRIM(p_notes), '')
  )
  ON CONFLICT (
    audit_location_id,
    part_number,
    (COALESCE(po, ''::character varying)),
    (COALESCE(fifo_number, '-1'::integer))
  ) DO UPDATE SET
    description = COALESCE(EXCLUDED.description, public.physical_audit_items.description),
    found_qty = EXCLUDED.found_qty,
    counted_by = EXCLUDED.counted_by,
    counted_at = EXCLUDED.counted_at,
    notes = COALESCE(EXCLUDED.notes, public.physical_audit_items.notes)
  RETURNING id INTO v_audit_item_id;

  RETURN jsonb_build_object(
    'finding_id', v_finding_id,
    'audit_item_id', v_audit_item_id,
    'status', 'aplicado',
    'counted', true,
    'found_qty', p_found_qty,
    'created_at', v_created_at
  );
END;
$function$;
