-- ============================================
-- SCRIPT SQL PARA SUPABASE
-- Sistema de Inventario - Tabla de Registros
-- ============================================

-- 1. Crear la tabla de registros de inventario
CREATE TABLE IF NOT EXISTS inventory_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    part_number VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    total_units INTEGER NOT NULL DEFAULT 0,
    total_boxes INTEGER NOT NULL DEFAULT 0,
    unit_of_measure VARCHAR(50) NOT NULL,
    registered_by VARCHAR(255) NOT NULL,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Crear índices para mejorar el rendimiento de búsquedas
CREATE INDEX IF NOT EXISTS idx_inventory_part_number ON inventory_records(part_number);
CREATE INDEX IF NOT EXISTS idx_inventory_registered_by ON inventory_records(registered_by);
CREATE INDEX IF NOT EXISTS idx_inventory_registered_at ON inventory_records(registered_at);

-- 3. Habilitar Row Level Security (RLS)
ALTER TABLE inventory_records ENABLE ROW LEVEL SECURITY;

-- 4. Crear política para permitir que usuarios autenticados vean todos los registros
CREATE POLICY "Allow authenticated users to view all records"
ON inventory_records
FOR SELECT
TO authenticated
USING (true);

-- 5. Crear política para permitir que usuarios autenticados inserten registros
CREATE POLICY "Allow authenticated users to insert records"
ON inventory_records
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 6. Crear política para permitir que usuarios autenticados actualicen registros
CREATE POLICY "Allow authenticated users to update records"
ON inventory_records
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 7. Crear política para permitir que usuarios autenticados eliminen registros
CREATE POLICY "Allow authenticated users to delete records"
ON inventory_records
FOR DELETE
TO authenticated
USING (true);

-- 8. Crear función para actualizar el campo updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Crear trigger para actualizar updated_at en cada UPDATE
DROP TRIGGER IF EXISTS update_inventory_records_updated_at ON inventory_records;
CREATE TRIGGER update_inventory_records_updated_at
    BEFORE UPDATE ON inventory_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- INSTRUCCIONES DE USO:
-- 1. Ve a tu proyecto en Supabase Dashboard
-- 2. Navega a SQL Editor
-- 3. Copia y pega este script completo
-- 4. Ejecuta el script
-- ============================================
