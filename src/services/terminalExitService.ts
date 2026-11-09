import { supabase } from '@/lib/supabase';
import type { TerminalExit, TerminalExitSource } from '@/lib/terminalExitState';

const PAGE_SIZE = 1000;
type RawExit = Omit<TerminalExit, 'source' | 'returned_entry_id' | 'source_match_is_ambiguous'>;
type ReturnEvent = {
  entry_id: number;
  source_exit_type: TerminalExitSource;
  source_exit_id: number;
  source_match_is_ambiguous: boolean;
};

async function loadPages<T>(load: (from: number, to: number) => PromiseLike<{
  data: unknown[] | null;
  error: { message: string } | null;
}>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await load(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
}

export async function fetchTerminalExits(): Promise<{
  data: TerminalExit[];
  error: { message: string } | null;
}> {
  try {
    const columns = 'id, entry_id, part_number, po, qty, boxes, exited_at, returned_at';
    const [shipping, kitteo, events] = await Promise.all([
      loadPages<RawExit>((from, to) => supabase.from('shipping_direct')
        .select(columns).order('id').range(from, to)),
      loadPages<RawExit>((from, to) => supabase.from('kitteo_exits')
        .select(columns).order('id').range(from, to)),
      loadPages<ReturnEvent>((from, to) => supabase.from('inventory_return_events')
        .select('entry_id, source_exit_type, source_exit_id, source_match_is_ambiguous')
        .order('id').range(from, to)),
    ]);
    const byExit = new Map(events.map(event => [`${event.source_exit_type}:${event.source_exit_id}`, event]));
    const addSource = (rows: RawExit[], source: TerminalExitSource): TerminalExit[] => rows.map(row => {
      const event = byExit.get(`${source}:${row.id}`);
      return {
        ...row,
        entry_id: row.entry_id === null ? null : Number(row.entry_id),
        source,
        returned_entry_id: event ? Number(event.entry_id) : undefined,
        source_match_is_ambiguous: event?.source_match_is_ambiguous,
      };
    });
    return { data: [...addSource(shipping, 'shipping_direct'), ...addSource(kitteo, 'kitteo_exits')], error: null };
  } catch (error) {
    return { data: [], error: { message: error instanceof Error ? error.message : 'Error cargando salidas definitivas.' } };
  }
}
