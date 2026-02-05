import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type InventoryRecord = {
  id: string;
  part_number: string;
  description: string;
  total_units: number;
  total_boxes: number;
  unit_of_measure: string;
  registered_by: string;
  registered_at: string;
  created_at: string;
  updated_at: string;
};

export type NewInventoryRecord = Omit<InventoryRecord, 'id' | 'created_at' | 'updated_at'>;
