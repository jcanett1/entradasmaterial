-- ============================================================
-- MIGRACIÓN: devolver salidas de Shipping Direct y registrar revisión
-- Ejecutar una sola vez en el proyecto Supabase de Entradas material.
-- La devolución es transaccional: conserva el historial y restaura
-- el artículo en su locación original solo si sigue disponible.
-- ============================================================

ALTER TABLE public.shipping_direct
  ADD COLUMN IF NOT EXISTS returned_at timestamp without time zone NULL,
  ADD COLUMN IF NOT EXISTS returned_by varchar(100) NULL,
  ADD COLUMN IF NOT EXISTS fifo_number integer NULL;

CREATE INDEX IF NOT EXISTS idx_shipping_direct_fifo_number
  ON public.shipping_direct (fifo_number);

-- El FIFO es opcional en algunas instalaciones antiguas, pero se conserva
-- en las asignaciones restauradas cuando está disponible en la salida.
ALTER TABLE public.location_items
  ADD COLUMN IF NOT EXISTS fifo_number integer NULL;

CREATE INDEX IF NOT EXISTS idx_location_items_fifo_number
  ON public.location_items (fifo_number);

-- Las actualizaciones directas del historial quedan reservadas a supervisores
-- y administradores. Los RPC controlados abajo permiten el regreso y la revisión.
DROP POLICY IF EXISTS shipping_direct_update_authenticated ON public.shipping_direct;
DROP POLICY IF EXISTS shipping_direct_update_managers ON public.shipping_direct;
CREATE POLICY shipping_direct_update_managers
  ON public.shipping_direct
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarioalmacen AS ua
      WHERE ua.user_id = auth.uid()
        AND ua.activo = true
        AND ua.rol IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarioalmacen AS ua
      WHERE ua.user_id = auth.uid()
        AND ua.activo = true
        AND ua.rol IN ('admin', 'supervisor')
    )
  );

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

  IF v_location.status <> 'disponible' THEN
    RAISE EXCEPTION 'La locación % ya está ocupada; no se modificó el inventario.', v_location.location_code;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.location_items AS li
    WHERE li.location_id = v_location.id
  ) THEN
    RAISE EXCEPTION 'La locación % ya contiene artículos asignados; no se modificó el inventario.', v_location.location_code;
  END IF;

  v_fifo_number := v_record.fifo_number;
  IF v_fifo_number IS NULL AND v_record.entry_id IS NOT NULL THEN
    SELECT fl.fifo_number INTO v_fifo_number
    FROM public.fifo_labels AS fl
    WHERE fl.entry_id = v_record.entry_id
    ORDER BY fl.id ASC
    LIMIT 1;
  END IF;

  INSERT INTO public.location_items (
    location_id,
    location_code,
    entry_id,
    part_number,
    po,
    qty,
    fifo_number,
    assigned_at
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

  UPDATE public.locations
  SET status = 'ocupado',
      entry_id = v_record.entry_id,
      part_number = v_record.part_number,
      qty = v_record.qty,
      po = v_record.po,
      assigned_at = v_now
  WHERE id = v_location.id;

  UPDATE public.shipping_direct
  SET returned_at = v_now,
      returned_by = LEFT(v_actor_name, 100)
  WHERE id = v_record.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_shipping_direct_reviewed(p_shipping_direct_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_name text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada para revisar el registro.';
  END IF;

  SELECT COALESCE(NULLIF(BTRIM(ua.nombre_completo), ''), NULLIF(BTRIM(ua.email), ''), 'Usuario')
    INTO v_actor_name
  FROM public.usuarioalmacen AS ua
  WHERE ua.user_id = v_actor_id
    AND ua.activo = true
    AND ua.rol IN ('admin', 'supervisor')
  LIMIT 1;

  IF v_actor_name IS NULL THEN
    RAISE EXCEPTION 'Solo supervisores y administradores pueden marcar registros como revisados.';
  END IF;

  UPDATE public.shipping_direct
  SET reviewed_at = COALESCE(reviewed_at, now()),
      reviewed_by = COALESCE(reviewed_by, LEFT(v_actor_name, 100))
  WHERE id = p_shipping_direct_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la salida de Shipping Direct solicitada.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.return_shipping_direct_to_location(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_shipping_direct_reviewed(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.return_shipping_direct_to_location(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_shipping_direct_reviewed(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
