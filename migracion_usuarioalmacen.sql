-- ================================================================
-- MIGRACIÓN: Desligar usuarioalmacen de auth.users
-- Ejecutar en el Editor SQL de Supabase
-- ================================================================

-- PASO 1: Eliminar la FK y el índice ligado a auth.users
ALTER TABLE public.usuarioalmacen
  DROP CONSTRAINT IF EXISTS usuarioalmacen_user_id_fkey,
  DROP CONSTRAINT IF EXISTS usuarioalmacen_user_id_key;

DROP INDEX IF EXISTS public.idx_usuarioalmacen_user_id;

-- PASO 2: Hacer user_id opcional (ya no es requerido)
ALTER TABLE public.usuarioalmacen
  ALTER COLUMN user_id DROP NOT NULL;

-- PASO 3: Agregar campo email (identificador principal del usuario)
ALTER TABLE public.usuarioalmacen
  ADD COLUMN IF NOT EXISTS email text;

-- Hacer email único y requerido
ALTER TABLE public.usuarioalmacen
  ADD CONSTRAINT usuarioalmacen_email_key UNIQUE (email);

-- PASO 4: Agregar campo password (texto plano por ahora)
ALTER TABLE public.usuarioalmacen
  ADD COLUMN IF NOT EXISTS password text;

-- PASO 5: Crear índice en email para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_usuarioalmacen_email
  ON public.usuarioalmacen USING btree (email);

-- ================================================================
-- PASO 6: Insertar el primer usuario admin
-- IMPORTANTE: Cambia los valores antes de ejecutar
-- ================================================================
INSERT INTO public.usuarioalmacen (email, password, nombre_completo, departamento, rol, activo)
VALUES (
  'jcanett@pxg.com',       -- correo del administrador
  'tu_contrasena_aqui',    -- contraseña (cámbiala)
  'Administrador',         -- nombre completo
  'Sistemas',              -- departamento
  'admin',
  true
)
ON CONFLICT (email) DO UPDATE
  SET rol = 'admin',
      activo = true;

-- ================================================================
-- PASO 7 (OPCIONAL): Política RLS para que solo usuarios
-- autenticados con la sesión local puedan leer la tabla.
-- Si tienes RLS activado, desactívalo o agrega política permisiva:
-- ================================================================

-- Opción A: Desactivar RLS en la tabla (más simple)
-- ALTER TABLE public.usuarioalmacen DISABLE ROW LEVEL SECURITY;

-- Opción B: Permitir lectura anónima (necesario para el login)
-- ALTER TABLE public.usuarioalmacen ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "allow_anon_read" ON public.usuarioalmacen
--   FOR SELECT TO anon USING (true);
-- CREATE POLICY "allow_anon_insert" ON public.usuarioalmacen
--   FOR INSERT TO anon WITH CHECK (true);
-- CREATE POLICY "allow_anon_update" ON public.usuarioalmacen
--   FOR UPDATE TO anon USING (true);
-- CREATE POLICY "allow_anon_delete" ON public.usuarioalmacen
--   FOR DELETE TO anon USING (true);
