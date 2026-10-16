import { supabase } from '@/lib/supabase';

export type LocationAssignment = {
  record_id: string;
  storage_type: 'principal' | 'kitteo';
  rack: string;
  location_id: number;
  location_code: string;
  location_status: 'ocupado' | 'disponible';
  entry_id: number | null;
  part_number: string;
  qty: number;
  po: string | null;
  fifo_number: number | null;
  assigned_at: string | null;
};

type RawLocation = {
  id: unknown;
  rack: string | null;
  location_code: string | null;
  status: string | null;
  entry_id: unknown;
  part_number: string | null;
  qty: unknown;
  po: string | null;
  assigned_at: string | null;
};

type RawAssignment = {
  id: unknown;
  location_id: unknown;
  location_code: string | null;
  entry_id: unknown;
  part_number: string | null;
  po: string | null;
  qty: unknown;
  fifo_number: unknown;
  assigned_at: string | null;
};

type RawFifoLabel = {
  entry_id: unknown;
  fifo_number: unknown;
};

const PAGE_SIZE = 1000;
const QUERY_CHUNK_SIZE = 500;

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLocationStatus(value: string | null | undefined): 'ocupado' | 'disponible' {
  return value?.toLowerCase() === 'ocupado' ? 'ocupado' : 'disponible';
}

function inferRack(locationCode: string) {
  return locationCode.split('-')[0] || locationCode;
}

async function fetchAllRows<T>(table: string, select: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`No se pudo consultar ${table}: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchFifoByEntryIds(entryIds: number[]) {
  const fifoByEntryId = new Map<number, number>();
  const uniqueIds = [...new Set(entryIds)];
  for (let index = 0; index < uniqueIds.length; index += QUERY_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(index, index + QUERY_CHUNK_SIZE);
    const { data, error } = await supabase
      .from('fifo_labels')
      .select('entry_id, fifo_number')
      .in('entry_id', chunk)
      .order('fifo_number', { ascending: true });
    if (error) throw new Error(`No se pudo consultar el FIFO: ${error.message}`);
    ((data ?? []) as RawFifoLabel[]).forEach(label => {
      const entryId = toNumberOrNull(label.entry_id);
      const fifoNumber = toNumberOrNull(label.fifo_number);
      if (entryId !== null && fifoNumber !== null && !fifoByEntryId.has(entryId)) {
        fifoByEntryId.set(entryId, fifoNumber);
      }
    });
  }
  return fifoByEntryId;
}

function mapAssignments(
  storageType: LocationAssignment['storage_type'],
  locations: RawLocation[],
  assignments: RawAssignment[],
  fifoByEntryId: Map<number, number>,
): LocationAssignment[] {
  const locationsById = new Map<number, RawLocation>();
  locations.forEach(location => {
    const id = toNumberOrNull(location.id);
    if (id !== null) locationsById.set(id, location);
  });

  const locationsWithChildRows = new Set<number>();
  const rows: LocationAssignment[] = [];

  assignments.forEach(item => {
    const locationId = toNumberOrNull(item.location_id);
    if (locationId === null) return;
    locationsWithChildRows.add(locationId);
    const partNumber = item.part_number?.trim();
    if (!partNumber) return;

    const location = locationsById.get(locationId);
    const locationCode = item.location_code?.trim() || location?.location_code?.trim() || '—';
    const entryId = toNumberOrNull(item.entry_id);
    const storedFifo = toNumberOrNull(item.fifo_number);
    rows.push({
      record_id: `${storageType}-item-${String(item.id ?? rows.length)}`,
      storage_type: storageType,
      rack: location?.rack?.trim() || inferRack(locationCode),
      location_id: locationId,
      location_code: locationCode,
      location_status: getLocationStatus(location?.status ?? 'ocupado'),
      entry_id: entryId,
      part_number: partNumber,
      qty: toNumberOrNull(item.qty) ?? 0,
      po: item.po?.trim() || null,
      fifo_number: storedFifo ?? (entryId !== null ? fifoByEntryId.get(entryId) ?? null : null),
      assigned_at: item.assigned_at ?? location?.assigned_at ?? null,
    });
  });

  // Compatibilidad con registros históricos que todavía guardan su partida
  // directamente en la fila de la locación y no tienen fila hija.
  locations.forEach(location => {
    const locationId = toNumberOrNull(location.id);
    const partNumber = location.part_number?.trim();
    if (locationId === null || !partNumber || locationsWithChildRows.has(locationId)) return;

    const locationCode = location.location_code?.trim() || '—';
    const entryId = toNumberOrNull(location.entry_id);
    rows.push({
      record_id: `${storageType}-legacy-${locationId}`,
      storage_type: storageType,
      rack: location.rack?.trim() || inferRack(locationCode),
      location_id: locationId,
      location_code: locationCode,
      location_status: getLocationStatus(location.status),
      entry_id: entryId,
      part_number: partNumber,
      qty: toNumberOrNull(location.qty) ?? 0,
      po: location.po?.trim() || null,
      fifo_number: entryId !== null ? fifoByEntryId.get(entryId) ?? null : null,
      assigned_at: location.assigned_at ?? null,
    });
  });

  return rows;
}

export async function fetchLocationAssignments(): Promise<LocationAssignment[]> {
  const [principalLocations, principalItems, kitteoLocations, kitteoItems] = await Promise.all([
    fetchAllRows<RawLocation>('locations', 'id, rack, location_code, status, entry_id, part_number, qty, po, assigned_at'),
    fetchAllRows<RawAssignment>('location_items', 'id, location_id, location_code, entry_id, part_number, po, qty, fifo_number, assigned_at'),
    fetchAllRows<RawLocation>('kitteo_locations', 'id, rack, location_code, status, entry_id, part_number, qty, po, assigned_at'),
    fetchAllRows<RawAssignment>('kitteo_location_items', 'id, location_id, location_code, entry_id, part_number, po, qty, fifo_number, assigned_at'),
  ]);

  const allAssignments = [...principalItems, ...kitteoItems];
  const allLegacyLocations = [...principalLocations, ...kitteoLocations];
  const entryIdsNeedingFallbackFifo = [
    ...allAssignments
      .filter(item => toNumberOrNull(item.fifo_number) === null)
      .map(item => toNumberOrNull(item.entry_id)),
    ...allLegacyLocations.map(location => toNumberOrNull(location.entry_id)),
  ].filter((entryId): entryId is number => entryId !== null);
  const fifoByEntryId = await fetchFifoByEntryIds(entryIdsNeedingFallbackFifo);

  return [
    ...mapAssignments('principal', principalLocations, principalItems, fifoByEntryId),
    ...mapAssignments('kitteo', kitteoLocations, kitteoItems, fifoByEntryId),
  ].sort((left, right) => (
    left.storage_type.localeCompare(right.storage_type)
    || left.rack.localeCompare(right.rack, 'es', { numeric: true })
    || left.location_code.localeCompare(right.location_code, 'es', { numeric: true })
    || left.part_number.localeCompare(right.part_number, 'es', { numeric: true })
    || (left.fifo_number ?? Number.MAX_SAFE_INTEGER) - (right.fifo_number ?? Number.MAX_SAFE_INTEGER)
  ));
}
