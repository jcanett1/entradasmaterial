-- Canonicalización equivalente a terminalExitState.ts y a la búsqueda de Racks.
CREATE OR REPLACE FUNCTION public.inventory_return_normalize_part(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT upper(regexp_replace(
    translate(translate(normalize(COALESCE(p_value, ''), NFKC), U&'\200B\200C\200D\FEFF', ''), '‐‑‒–—−', '------'),
    '\s+', '', 'g'
  ));
$function$;

CREATE OR REPLACE FUNCTION public.inventory_return_normalize_po(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT upper(regexp_replace(
    translate(normalize(COALESCE(p_value, ''), NFKC), U&'\200B\200C\200D\FEFF', ''),
    '^\s+|\s+$', '', 'g'
  ));
$function$;

-- Actualiza solamente las expresiones de comparación de la RPC creada
-- en 20261109165000; preserva sus validaciones, locks y auditoría.
DO $block$
DECLARE
  v_definition text := pg_get_functiondef('public.return_final_exit_to_inventory(integer,text,integer)'::regprocedure);
BEGIN
  v_definition := replace(v_definition,
    $old$upper(regexp_replace(BTRIM(COALESCE(v_entry.part_number, '')), '\s+', '', 'g'))$old$,
    'public.inventory_return_normalize_part(v_entry.part_number)');
  v_definition := replace(v_definition,
    $old$upper(regexp_replace(BTRIM(COALESCE(v_exit_part_number, '')), '\s+', '', 'g'))$old$,
    'public.inventory_return_normalize_part(v_exit_part_number)');
  v_definition := replace(v_definition,
    $old$upper(regexp_replace(BTRIM(COALESCE(e.part_number, '')), '\s+', '', 'g'))$old$,
    'public.inventory_return_normalize_part(e.part_number)');
  v_definition := replace(v_definition,
    $old$upper(BTRIM(COALESCE(v_entry.po, '')))$old$,
    'public.inventory_return_normalize_po(v_entry.po)');
  v_definition := replace(v_definition,
    $old$upper(BTRIM(COALESCE(v_exit_po, '')))$old$,
    'public.inventory_return_normalize_po(v_exit_po)');
  v_definition := replace(v_definition,
    $old$upper(BTRIM(COALESCE(e.po, '')))$old$,
    'public.inventory_return_normalize_po(e.po)');
  IF v_definition NOT LIKE '%inventory_return_normalize_part(v_entry.part_number)%'
     OR v_definition NOT LIKE '%inventory_return_normalize_part(e.part_number)%'
     OR v_definition NOT LIKE '%inventory_return_normalize_po(v_entry.po)%' THEN
    RAISE EXCEPTION 'No se pudo alinear la normalización de la función de devolución.';
  END IF;
  EXECUTE v_definition;
END;
$block$;

-- La aplicación usa RPC SECURITY DEFINER para actualizaciones de estado.
-- Revocar UPDATE de tabla completo es necesario: revocar una columna sola
-- no prevalece sobre el permiso UPDATE existente para toda la tabla.
REVOKE UPDATE ON TABLE public.kitteo_exits, public.shipping_direct FROM PUBLIC, anon, authenticated;
REVOKE DELETE ON TABLE public.kitteo_exits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.return_final_exit_to_inventory(integer, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_final_exit_to_inventory(integer, text, integer) TO authenticated;

-- Evita crear salidas artificialmente devueltas mediante INSERT directo.
-- El DELETE Shipping Direct se conserva solo para el rollback de una
-- transferencia pendiente cuyo envío no llegó a completarse.
CREATE OR REPLACE FUNCTION public.guard_terminal_exit_return_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user IN ('postgres', 'service_role') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.returned_at IS NOT NULL OR NEW.returned_by IS NOT NULL THEN
      RAISE EXCEPTION 'Una devolución debe registrarse mediante la función autorizada.';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'shipping_direct'
       AND OLD.returned_at IS NULL
       AND EXISTS (SELECT 1 FROM public.transferes WHERE id = OLD.source_transfer_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'No se permite borrar una salida definitiva completada; debe conservarse su historial.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_shipping_direct_return_integrity ON public.shipping_direct;
CREATE TRIGGER guard_shipping_direct_return_integrity
  BEFORE INSERT OR DELETE ON public.shipping_direct
  FOR EACH ROW EXECUTE FUNCTION public.guard_terminal_exit_return_integrity();

DROP TRIGGER IF EXISTS guard_kitteo_exit_return_integrity ON public.kitteo_exits;
CREATE TRIGGER guard_kitteo_exit_return_integrity
  BEFORE INSERT ON public.kitteo_exits
  FOR EACH ROW EXECUTE FUNCTION public.guard_terminal_exit_return_integrity();

NOTIFY pgrst, 'reload schema';
