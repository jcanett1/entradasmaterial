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

export type UserRole = 'admin' | 'supervisor' | 'operador' | 'contador';

export type PhysicalAuditStatus = 'programada' | 'en_progreso' | 'completada' | 'cerrada' | 'cancelada';
export type PhysicalAuditAssignmentStatus = 'asignado' | 'en_progreso' | 'completado' | 'cancelado';
export type PhysicalAuditLocationStatus = 'pendiente' | 'en_progreso' | 'completada' | 'omitida';
export type PhysicalAuditItemStatus = 'pendiente' | 'correcto' | 'faltante' | 'sobrante';
export type PhysicalAuditFindingStatus = 'pendiente_revision' | 'validado' | 'rechazado' | 'aplicado';
export type PhysicalAuditLocationSource = 'normal' | 'kitto';

export type PhysicalAudit = {
  id: number;
  name: string;
  description: string | null;
  status: PhysicalAuditStatus;
  planned_start: string | null;
  planned_end: string | null;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  updated_at: string;
};

export type PhysicalAuditRackAssignment = {
  id: number;
  audit_id: number;
  source: PhysicalAuditLocationSource;
  rack: string;
  contador_user_id: string;
  assigned_by: string | null;
  status: PhysicalAuditAssignmentStatus;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type PhysicalAuditLocation = {
  id: number;
  audit_id: number;
  assignment_id: number | null;
  location_id: number | null;
  location_code: string;
  rack: string;
  source: PhysicalAuditLocationSource;
  contador_user_id: string;
  status: PhysicalAuditLocationStatus;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
  recount_requested: boolean;
  recount_requested_by: string | null;
  recount_requested_at: string | null;
  last_counted_by: string | null;
  last_counted_at: string | null;
};

export type PhysicalAuditCounterItem = {
  id: number;
  audit_id: number;
  audit_location_id: number;
  rack: string;
  location_code: string;
  part_number: string;
  description: string | null;
  po: string | null;
  fifo_number: number | null;
  found_qty: number | null;
  counted: boolean;
  counted_at: string | null;
  notes: string | null;
};

export type PhysicalAuditSupervisorItem = PhysicalAuditCounterItem & {
  audit_name: string;
  audit_status: PhysicalAuditStatus;
  contador_user_id: string;
  location_item_id: number | null;
  entry_id: number | null;
  expected_qty: number;
  difference_qty: number | null;
  status: PhysicalAuditItemStatus;
  counted_by: string | null;
  updated_at: string;
};

export type PhysicalAuditFinding = {
  id: number;
  audit_id: number;
  audit_name?: string;
  audit_location_id: number | null;
  reported_by: string;
  part_number: string;
  description: string | null;
  po: string | null;
  fifo_number: number | null;
  expected_location_id: number | null;
  expected_location_code: string | null;
  expected_location_item_id: number | null;
  found_location_id: number | null;
  found_location_code: string;
  found_rack: string | null;
  found_qty: number;
  notes: string | null;
  status: PhysicalAuditFindingStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
};

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
  rol: UserRole;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type NewUsuarioAlmacen = {
  email: string;
  password: string;
  nombre_completo: string;
  departamento?: string;
  rol: UserRole;
  activo: boolean;
};
