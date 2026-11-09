import { supabase } from '@/lib/supabase';
import type { Entry } from '@/lib/supabase';

export type InventoryHistorySummary = {
  total: number;
  units: number;
  boxes: number;
};

export type InventoryHistoryFilters = {
  search: string;
  dateFrom: string;
  dateTo: string;
  availableOnly: boolean;
};

export async function fetchInventoryHistoryPage(
  page: number,
  pageSize: number,
  filters: InventoryHistoryFilters,
): Promise<{ rows: Entry[]; totalCount: number; error: string | null }> {
  const { data, error } = await supabase.rpc('inventory_history_page', {
    p_page: page,
    p_page_size: pageSize,
    p_search: filters.search.trim() || null,
    p_date_from: filters.dateFrom || null,
    p_date_to: filters.dateTo || null,
    p_available_only: filters.availableOnly,
  });

  if (error) return { rows: [], totalCount: 0, error: error.message };
  const result = data as { rows?: Entry[]; total_count?: number } | null;
  return {
    rows: Array.isArray(result?.rows) ? result.rows : [],
    totalCount: Number(result?.total_count ?? 0),
    error: null,
  };
}

export async function fetchInventoryHistorySummary(): Promise<{
  summary: InventoryHistorySummary | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('inventory_history_summary');
  if (error) return { summary: null, error: error.message };
  const result = data as InventoryHistorySummary | null;
  if (!result) return { summary: null, error: 'Supabase no devolvió el resumen del historial.' };
  return {
    summary: {
      total: Number(result.total ?? 0),
      units: Number(result.units ?? 0),
      boxes: Number(result.boxes ?? 0),
    },
    error: null,
  };
}
