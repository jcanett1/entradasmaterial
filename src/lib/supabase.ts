import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ujibmyclnhouogevzxcl.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaWJteWNsbmhvdW9nZXZ6eGNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0OTMyODksImV4cCI6MjA2NzA2OTI4OX0.GrKEUV6HOSmBauj1lHu3z_l8rqmfWZuSVi1mIREB22I';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* =============================================
   TIPOS — Inventario
============================================= */
export type Entry = {
  id: number;
  part_number: string;
  description: string | null;
  total_units: number;
  total_boxes: number;
  unit_of_measure: string | null;
  registered_by: string | null;
  registered_at: string;
  po: string | null;
};

export type NewEntry = Omit<Entry, 'id' | 'registered_at'>;

/* =============================================
   TIPOS — Usuarios del Almacén
   Ahora enlazada con auth.users a través de user_id.
============================================= */
export type UsuarioAlmacen = {
  id: string;
  user_id: string;            // UUID de auth.users
  email: string;
  nombre_completo: string | null;
  departamento: string | null;
  rol: 'admin' | 'supervisor' | 'operador';
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type NewUsuarioAlmacen = {
  email: string;
  password: string;
  nombre_completo: string;
  departamento?: string;
  rol: 'admin' | 'supervisor' | 'operador';
  activo: boolean;
};
