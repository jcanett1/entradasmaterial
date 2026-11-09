export type TerminalExitSource = 'shipping_direct' | 'kitteo_exits';

export type TerminalExit = {
  id: number;
  source: TerminalExitSource;
  entry_id: number | null;
  part_number: string | null;
  po: string | null;
  qty: number | null;
  boxes: number | null;
  exited_at: string | null;
  returned_at: string | null;
  returned_entry_id?: number;
  source_match_is_ambiguous?: boolean;
};

export type InventoryEntryFingerprint = {
  id: number;
  part_number: string;
  po: string | null;
  registered_at: string;
  total_units: number;
  total_boxes: number;
};

const normalizePart = (value: string | null) => (value ?? '').normalize('NFKC')
  .replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[‐‑‒–—−]/g, '-')
  .replace(/\s+/g, '').toUpperCase();
const normalizePo = (value: string | null) => (value ?? '').normalize('NFKC')
  .replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toUpperCase();

export function matchesTerminalExit(entry: InventoryEntryFingerprint, exit: TerminalExit): boolean {
  if (exit.entry_id !== null) return entry.id === Number(exit.entry_id);
  if (normalizePart(entry.part_number) !== normalizePart(exit.part_number)
    || normalizePo(entry.po) !== normalizePo(exit.po)) return false;
  const entryTime = Date.parse(entry.registered_at);
  const exitTime = exit.exited_at ? Date.parse(exit.exited_at) : Number.NaN;
  if (!Number.isFinite(entryTime) || !Number.isFinite(exitTime) || entryTime > exitTime) return false;
  return (exit.qty === null || entry.total_units === Number(exit.qty))
    && (exit.boxes === null || entry.total_boxes === Number(exit.boxes));
}

export function isBlockedByTerminalExit(entry: InventoryEntryFingerprint, exit: TerminalExit): boolean {
  if (!matchesTerminalExit(entry, exit)) return false;
  if (!exit.returned_at) return true;
  // Una devolución heredada ambigua libera solo la entrada elegida. Las otras
  // coincidencias conservan su bloqueo hasta aclarar su vínculo con la salida.
  return exit.entry_id === null && exit.source_match_is_ambiguous === true
    && exit.returned_entry_id !== entry.id;
}
