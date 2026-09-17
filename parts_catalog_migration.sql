-- ================================================================
-- CATÁLOGO DE NÚMEROS DE PARTE
-- Ejecutar en el Editor SQL de Supabase
-- ================================================================

CREATE TABLE IF NOT EXISTS public.parts_catalog (
  id serial NOT NULL,
  inventory_id character varying(150) NOT NULL,
  description text NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT parts_catalog_pkey PRIMARY KEY (id),
  CONSTRAINT parts_catalog_inventory_id_key UNIQUE (inventory_id)
);

CREATE INDEX IF NOT EXISTS idx_parts_catalog_inventory_id
  ON public.parts_catalog USING btree (inventory_id);

GRANT SELECT, INSERT ON TABLE public.parts_catalog TO authenticated;
REVOKE UPDATE, DELETE ON TABLE public.parts_catalog FROM authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.parts_catalog_id_seq TO authenticated;

-- Los usuarios autenticados pueden consultar el catálogo para el autocompletado
-- del formulario de inventario. Solo admin y supervisor pueden insertar partes.
ALTER TABLE public.parts_catalog ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_parts_catalog()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarioalmacen ua
    WHERE ua.user_id::text = auth.uid()::text
      AND ua.activo = true
      AND ua.rol IN ('admin', 'supervisor')
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_parts_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_parts_catalog() TO authenticated;

-- Si la tabla ya existía con una política amplia de INSERT, se elimina para
-- que no pueda combinarse con la política restringida (las políticas RLS se
-- evalúan con OR entre sí).
DO $$
DECLARE
  existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'parts_catalog'
      AND cmd IN ('INSERT', 'ALL')
      AND policyname <> 'parts_catalog_insert_admin_supervisor'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.parts_catalog', existing_policy.policyname);
  END LOOP;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'parts_catalog'
      AND policyname = 'parts_catalog_select_authenticated'
  ) THEN
    CREATE POLICY parts_catalog_select_authenticated
      ON public.parts_catalog
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'parts_catalog'
      AND policyname = 'parts_catalog_insert_admin_supervisor'
  ) THEN
    CREATE POLICY parts_catalog_insert_admin_supervisor
      ON public.parts_catalog
      FOR INSERT
      TO authenticated
      WITH CHECK (public.can_manage_parts_catalog());
  END IF;
END
$$;

-- No se crean políticas de UPDATE/DELETE: el catálogo solo se administra
-- mediante altas controladas por admin y supervisor.
