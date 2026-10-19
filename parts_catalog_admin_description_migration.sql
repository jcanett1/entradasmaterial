-- Solo usuarios activos con rol admin podrán agregar números de parte.
-- Se conserva lectura para todos los usuarios autenticados (política existente).
CREATE OR REPLACE FUNCTION public.can_manage_parts_catalog()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarioalmacen ua
    WHERE ua.user_id = auth.uid()
      AND ua.activo = true
      AND ua.rol = 'admin'
  );
$function$;

REVOKE ALL ON FUNCTION public.can_manage_parts_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_parts_catalog() TO authenticated;

DROP POLICY IF EXISTS parts_catalog_insert_admin_supervisor
  ON public.parts_catalog;
DROP POLICY IF EXISTS parts_catalog_insert_admin_only
  ON public.parts_catalog;
CREATE POLICY parts_catalog_insert_admin_only
  ON public.parts_catalog
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_parts_catalog());

-- El catálogo actual no tiene descripciones nulas o en blanco.
-- Estas restricciones bloquean también espacios en blanco en futuros INSERT/UPDATE.
ALTER TABLE public.parts_catalog
  ALTER COLUMN description SET NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.parts_catalog'::regclass
      AND conname = 'parts_catalog_description_nonempty_check'
  ) THEN
    ALTER TABLE public.parts_catalog
      ADD CONSTRAINT parts_catalog_description_nonempty_check
      CHECK (btrim(description) <> '');
  END IF;
END
$migration$;
