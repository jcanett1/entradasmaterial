import { createClient } from '@supabase/supabase-js';

// Agregar valores por defecto (fallback)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ujibmyclnhouogevzxcl.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaWJteWNsbmhvdW9nZXZ6eGNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0OTMyODksImV4cCI6MjA2NzA2OTI4OX0.GrKEUV6HOSmBauj1lHu3z_l8rqmfWZuSVi1mIREB22I';

// COMENTAR O ELIMINAR esta validación que causa el error
// if (!supabaseUrl || !supabaseAnonKey) {
//   throw new Error('Missing Supabase environment variables');
// }

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Entry = {
  id: number;
  part_number: string;
  description: string | null;
  total_units: number;
  total_boxes: number;
  unit_of_measure: string | null;
  registered_by: string | null;
  registered_at: string; // viene de Postgres
};

export type NewEntry = Omit<Entry, 'id' | 'registered_at'>;
// Nuevo: Tipo para usuarioalmacen
export type UsuarioAlmacen = {
  id: string;
  user_id: string;
  nombre_completo: string | null;
  departamento: string | null;
  rol: 'admin' | 'supervisor' | 'operador';
  activo: boolean;
  created_at: string;
  updated_at: string;
};
