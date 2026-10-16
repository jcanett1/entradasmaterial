-- Al reportar material encontrado, conservar el hallazgo y registrarlo de inmediato
-- como una línea contada dentro de la auditoría. No modifica location_items ni
-- kitteo_location_items (el inventario general permanece sin cambios).
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida';
  END IF;

  IF NULLIF(BTRIM(p_part_number), '') IS NULL THEN
    RAISE EXCEPTION 'El número de parte es obligatorio';
  END IF;

  IF NULLIF(BTRIM(p_found_location_code), '') IS NULL THEN
    RAISE EXCEPTION 'El rack donde se encontró es obligatorio';
  END IF;

  IF p_found_qty IS NULL OR p_found_qty < 0 THEN
    RAISE EXCEPTION 'La cantidad encontrada debe ser un entero mayor o igual a cero';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.physical_audit_locations al
    WHERE al.id = p_audit_location_id
      AND al.audit_id = p_audit_id
      AND al.status <> 'omitida'
      AND (
        public.physical_audit_is_manager()
        OR al.contador_user_id = auth.uid()
      )
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para reportar hallazgos en esta auditoría';
  END IF;

  -- Estas referencias apuntan a las tablas del inventario normal. Evitar guardar
  -- IDs de KITTEO o cualquier ID que no corresponda al código de locación dado.
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
    AND l.location_code = p_found_location_code
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
    BTRIM(p_found_location_code),
    NULLIF(BTRIM(p_found_rack), ''),
    p_found_qty,
    NULLIF(BTRIM(p_notes), ''),
    'aplicado'
  )
  RETURNING id INTO v_finding_id;

  -- Esperado 0: el trigger existente calcula la diferencia/estado como sobrante
  -- cuando se encontró una cantidad positiva. found_qty no nulo = ya contado.
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
