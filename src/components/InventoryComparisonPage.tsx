import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Database,
  Download,
  FileCheck2,
  FileSpreadsheet,
  Info,
  ListFilter,
  Loader2,
  Package,
  Search,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

type CorporateRow = {
  sourceRowNumber: number;
  inventoryId: string;
  key: string;
  description: string;
  onHand: number;
};

type ParsedBalance = {
  rows: CorporateRow[];
  dataRowCount: number;
  duplicates: number;
  skipped: number;
};

type PendingUpload = ParsedBalance & { fileName: string };

type BalanceImport = {
  id: string;
  file_name: string;
  imported_at: string;
  data_row_count: number;
  stored_row_count: number;
  duplicate_row_count: number;
  skipped_row_count: number;
};

type AuditOption = {
  id: number;
  name: string;
  status: string;
  created_at: string;
};

type ComparisonRun = {
  id: string;
  balance_import_id: string;
  physical_audit_id: number | null;
  physical_audit_name_snapshot: string | null;
  physical_audit_status_snapshot: string | null;
  compared_at: string;
  system_quantity_rule: string | null;
};

type SystemSource = {
  part_number: string | null;
  description?: string | null;
  total_units?: number | null;
  qty?: number | null;
};

type LocationItemSource = {
  location_id: number | string | null;
  part_number: string | null;
  qty: number | string | null;
};

type LocationSource = {
  id: number | string;
  status: string | null;
  part_number: string | null;
  qty: number | string | null;
};

type PartLocationBalance = { partNumber: string; quantity: number };
type LocationBalances = {
  warehouse: Map<string, PartLocationBalance>;
  kitteo: Map<string, PartLocationBalance>;
};

type PhysicalSource = {
  audit_location_id: number;
  source: string | null;
  part_number: string | null;
  description: string | null;
  found_qty: number | null;
};

type PhysicalCountStatus = 'complete' | 'partial' | 'pending' | 'not_audited';
type ComparisonStatus = 'match' | 'difference' | 'corporate-only' | 'system-only' | 'physical-only';

type ComparisonRow = {
  key: string;
  inventoryId: string;
  description: string;
  hasCorporate: boolean;
  corporateQty: number | null;
  hasSystem: boolean;
  systemQty: number | null;
  warehouseQty: number | null;
  kitteoQty: number | null;
  warehousePhysicalQty: number | null;
  kitteoPhysicalQty: number | null;
  physicalQty: number | null;
  physicalItemCount: number;
  physicalCountedItems: number;
  physicalCountStatus: PhysicalCountStatus;
  differenceSystemCorporate: number;
  differencePhysicalCorporate: number | null;
  status: ComparisonStatus;
};

type StoredComparisonRow = {
  inventory_id: string;
  normalized_inventory_id: string;
  description: string | null;
  has_corporate: boolean;
  corporate_on_hand: number | string | null;
  has_system: boolean;
  system_units: number | string | null;
  warehouse_units: number | string | null;
  kitteo_units: number | string | null;
  physical_counted: number | string | null;
  physical_audit_item_count: number;
  physical_audit_counted_items: number;
  physical_count_status: PhysicalCountStatus;
  difference_system_corporate: number | string;
  difference_physical_corporate: number | string | null;
};

type StoredFinalReviewRow = {
  inventory_id: string;
  normalized_inventory_id: string;
  description: string | null;
  on_hand: number | string;
  warehouse_counted: number | string | null;
  kitteo_counted: number | string | null;
  total_counted: number | string | null;
  difference: number | string | null;
  physical_count_status: PhysicalCountStatus;
  physical_audit_item_count: number;
  physical_audit_counted_items: number;
  review_status: FinalReviewStatus;
};

type FinalReviewStatus = 'match' | 'difference' | 'partial' | 'pending' | 'not_audited';
type FinalReviewFilter = 'all' | 'difference' | 'match' | 'pending';
type FinalReviewRow = {
  key: string;
  inventoryId: string;
  description: string;
  onHand: number;
  warehouseCounted: number | null;
  kitteoCounted: number | null;
  totalCounted: number | null;
  difference: number | null;
  physicalCountStatus: PhysicalCountStatus;
  physicalItemCount: number;
  physicalCountedItems: number;
  finalStatus: FinalReviewStatus;
};

const PAGE_SIZE = 1000;
const INSERT_BATCH_SIZE = 300;
const RESULT_PAGE_SIZE = 25;
const SYSTEM_QUANTITY_RULE = 'Saldo neto por número de parte: suma de entries.total_units menos salidas definitivas de shipping_direct (excluye devoluciones) y kitteo_exits. No se restan transferes porque son movimientos internos. El saldo mostrado tiene piso 0 cuando las salidas superan lo registrado. Almacén y KITTEO guardan las cantidades asignadas a sus locaciones al momento de la comparación.';
const numberFormat = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });
const formatNumber = (value: number) => numberFormat.format(value);
const formatDifference = (value: number) => value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
const formatDate = (value: string) => new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

const normalizeInventoryId = (value: unknown) => String(value ?? '')
  .normalize('NFKC')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/[‐‑‒–—−]/g, '-')
  .replace(/\s+/g, '')
  .toUpperCase();

const normalizeHeader = (value: unknown) => String(value ?? '')
  .normalize('NFKC')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

const cleanDescription = (value: unknown) => String(value ?? '').trim();
const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const normalized = typeof value === 'number' ? value : String(value).replace(/,/g, '').trim();
  if (normalized === '') return null;
  const parsed = typeof normalized === 'number' ? normalized : Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

async function parseWorkbook(file: File): Promise<ParsedBalance> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) throw new Error('El archivo no contiene hojas de cálculo.');
    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
    const headerIndex = rawRows.findIndex(row => {
      const headers = row.map(normalizeHeader);
      return headers.includes('inventory id') && headers.includes('description') && headers.includes('on hand');
    });
    if (headerIndex < 0) {
      throw new Error('No encontré los encabezados “Inventory ID”, “Description” y “On Hand” en la primera hoja.');
    }

    const headers = rawRows[headerIndex].map(normalizeHeader);
    const idIndex = headers.indexOf('inventory id');
    const descriptionIndex = headers.indexOf('description');
    const quantityIndex = headers.indexOf('on hand');
    const rows: CorporateRow[] = [];
    const seenIds = new Set<string>();
    let dataRowCount = 0;
    let duplicates = 0;
    let skipped = 0;

    for (let index = headerIndex + 1; index < rawRows.length; index += 1) {
      const row = rawRows[index];
      if (!row.some(value => value !== null && value !== undefined && String(value).trim() !== '')) continue;
      dataRowCount += 1;
      const inventoryId = String(row[idIndex] ?? '').trim();
      const key = normalizeInventoryId(inventoryId);
      const parsedOnHand = asNumber(row[quantityIndex]);
      if (!key || parsedOnHand === null || parsedOnHand < 0 || parsedOnHand > 999999999999.99) {
        skipped += 1;
        continue;
      }
      const onHand = Number(parsedOnHand.toFixed(2));
      if (seenIds.has(key)) duplicates += 1;
      seenIds.add(key);
      rows.push({
        sourceRowNumber: index + 1,
        inventoryId,
        key,
        description: cleanDescription(row[descriptionIndex]),
        onHand,
      });
    }

    if (rows.length === 0) throw new Error('No encontré filas válidas con Inventory ID y On Hand numérico no negativo.');
    return { rows, dataRowCount, duplicates, skipped };
  }
}

async function fetchAllPages<T>(fetchPage: (from: number, to: number) => Promise<{ data: T[]; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

function aggregateLocationQuantities(locations: LocationSource[], items: LocationItemSource[]) {
  const balances = new Map<string, PartLocationBalance>();
  const locationsWithItemRows = new Set<number>();
  const addQuantity = (partNumber: string | null, qty: number | string | null) => {
    const key = normalizeInventoryId(partNumber);
    if (!key || !partNumber?.trim()) return;
    const existing = balances.get(key);
    balances.set(key, {
      partNumber: existing?.partNumber ?? partNumber.trim(),
      quantity: (existing?.quantity ?? 0) + (asNumber(qty) ?? 0),
    });
  };

  items.forEach(item => {
    const locationId = asNumber(item.location_id);
    if (locationId !== null) locationsWithItemRows.add(locationId);
    addQuantity(item.part_number, item.qty);
  });

  // Locaciones antiguas pueden conservar su única partida en la fila padre.
  locations.forEach(location => {
    const locationId = asNumber(location.id);
    if (locationId === null || locationsWithItemRows.has(locationId) || location.status?.toLowerCase() !== 'ocupado') return;
    addQuantity(location.part_number, location.qty);
  });

  return balances;
}

async function fetchCurrentLocationBalances(): Promise<LocationBalances> {
  const [warehouseLocations, warehouseItems, kitteoLocations, kitteoItems] = await Promise.all([
    fetchAllPages<LocationSource>(async (from, to) => {
      const { data, error } = await supabase.from('locations')
        .select('id, status, part_number, qty').order('id', { ascending: true }).range(from, to);
      return { data: (data ?? []) as LocationSource[], error };
    }),
    fetchAllPages<LocationItemSource>(async (from, to) => {
      const { data, error } = await supabase.from('location_items')
        .select('location_id, part_number, qty').order('id', { ascending: true }).range(from, to);
      return { data: (data ?? []) as LocationItemSource[], error };
    }),
    fetchAllPages<LocationSource>(async (from, to) => {
      const { data, error } = await supabase.from('kitteo_locations')
        .select('id, status, part_number, qty').order('id', { ascending: true }).range(from, to);
      return { data: (data ?? []) as LocationSource[], error };
    }),
    fetchAllPages<LocationItemSource>(async (from, to) => {
      const { data, error } = await supabase.from('kitteo_location_items')
        .select('location_id, part_number, qty').order('id', { ascending: true }).range(from, to);
      return { data: (data ?? []) as LocationItemSource[], error };
    }),
  ]);

  return {
    warehouse: aggregateLocationQuantities(warehouseLocations, warehouseItems),
    kitteo: aggregateLocationQuantities(kitteoLocations, kitteoItems),
  };
}

function mapStoredRow(row: StoredComparisonRow): ComparisonRow {
  const corporateQty = row.corporate_on_hand === null ? null : Number(row.corporate_on_hand);
  const systemQty = row.system_units === null ? null : Number(row.system_units);
  const physicalQty = row.physical_counted === null ? null : Number(row.physical_counted);
  const differenceSystemCorporate = Number(row.difference_system_corporate);
  const differencePhysicalCorporate = row.difference_physical_corporate === null
    ? null
    : Number(row.difference_physical_corporate);
  const status: ComparisonStatus = !row.has_corporate && !row.has_system
    ? 'physical-only'
    : !row.has_corporate
      ? 'system-only'
      : !row.has_system
        ? 'corporate-only'
        : differenceSystemCorporate === 0 ? 'match' : 'difference';
  return {
    key: row.normalized_inventory_id,
    inventoryId: row.inventory_id,
    description: row.description || 'Sin descripción',
    hasCorporate: row.has_corporate,
    corporateQty,
    hasSystem: row.has_system,
    systemQty,
    warehouseQty: row.warehouse_units === null ? null : Number(row.warehouse_units),
    kitteoQty: row.kitteo_units === null ? null : Number(row.kitteo_units),
    warehousePhysicalQty: null,
    kitteoPhysicalQty: null,
    physicalQty,
    physicalItemCount: Number(row.physical_audit_item_count),
    physicalCountedItems: Number(row.physical_audit_counted_items),
    physicalCountStatus: row.physical_count_status,
    differenceSystemCorporate,
    differencePhysicalCorporate,
    status,
  };
}

function mapStoredFinalReviewRow(row: StoredFinalReviewRow): FinalReviewRow {
  return {
    key: row.normalized_inventory_id,
    inventoryId: row.inventory_id,
    description: row.description || 'Sin descripción',
    onHand: Number(row.on_hand),
    warehouseCounted: row.warehouse_counted === null ? null : Number(row.warehouse_counted),
    kitteoCounted: row.kitteo_counted === null ? null : Number(row.kitteo_counted),
    totalCounted: row.total_counted === null ? null : Number(row.total_counted),
    difference: row.difference === null ? null : Number(row.difference),
    physicalCountStatus: row.physical_count_status,
    physicalItemCount: Number(row.physical_audit_item_count),
    physicalCountedItems: Number(row.physical_audit_counted_items),
    finalStatus: row.review_status,
  };
}

function buildComparisonRows(
  corporateRows: CorporateRow[],
  entries: SystemSource[],
  shippingDirect: SystemSource[],
  kitteoExits: SystemSource[],
  physicalRows: PhysicalSource[],
  locationBalances: LocationBalances,
) {
  const corporateById = new Map<string, { inventoryId: string; description: string; onHand: number }>();
  corporateRows.forEach(row => {
    const existing = corporateById.get(row.key);
    if (existing) {
      existing.onHand += row.onHand;
      if (!existing.description && row.description) existing.description = row.description;
    } else {
      corporateById.set(row.key, { inventoryId: row.inventoryId, description: row.description, onHand: row.onHand });
    }
  });

  const systemById = new Map<string, { partNumber: string; description: string | null; quantity: number }>();
  const addSystemQuantity = (partNumber: string | null, description: string | null | undefined, quantity: number, sign: 1 | -1) => {
    const key = normalizeInventoryId(partNumber);
    if (!key) return;
    const existing = systemById.get(key) ?? { partNumber: String(partNumber).trim(), description: description ?? null, quantity: 0 };
    existing.quantity += quantity * sign;
    if (!existing.description && description) existing.description = description;
    systemById.set(key, existing);
  };
  entries.forEach(row => addSystemQuantity(row.part_number, row.description, asNumber(row.total_units) ?? 0, 1));
  shippingDirect.forEach(row => addSystemQuantity(row.part_number, null, asNumber(row.qty) ?? 0, -1));
  kitteoExits.forEach(row => addSystemQuantity(row.part_number, null, asNumber(row.qty) ?? 0, -1));

  let negativeSystemBalanceCount = 0;
  const systemBalances = new Map<string, { partNumber: string; description: string | null; units: number }>();
  systemById.forEach((row, key) => {
    if (row.quantity < 0) negativeSystemBalanceCount += 1;
    systemBalances.set(key, { partNumber: row.partNumber, description: row.description, units: Math.max(0, row.quantity) });
  });

  const physicalById = new Map<string, {
    partNumber: string;
    description: string | null;
    totalItems: number;
    countedItems: number;
    quantity: number;
    warehouseCountedItems: number;
    warehouseQuantity: number;
    kitteoCountedItems: number;
    kitteoQuantity: number;
  }>();
  physicalRows.forEach(row => {
    const key = normalizeInventoryId(row.part_number);
    if (!key) return;
    const existing = physicalById.get(key) ?? {
      partNumber: String(row.part_number).trim(),
      description: row.description ?? null,
      totalItems: 0,
      countedItems: 0,
      quantity: 0,
      warehouseCountedItems: 0,
      warehouseQuantity: 0,
      kitteoCountedItems: 0,
      kitteoQuantity: 0,
    };
    existing.totalItems += 1;
    if (!existing.description && row.description) existing.description = row.description;
    if (row.found_qty !== null && row.found_qty !== undefined) {
      const countedQuantity = asNumber(row.found_qty) ?? 0;
      existing.quantity += countedQuantity;
      existing.countedItems += 1;
      if (row.source === 'normal') {
        existing.warehouseQuantity += countedQuantity;
        existing.warehouseCountedItems += 1;
      } else if (row.source === 'kitto') {
        existing.kitteoQuantity += countedQuantity;
        existing.kitteoCountedItems += 1;
      }
    }
    physicalById.set(key, existing);
  });

  const allIds = new Set([
    ...corporateById.keys(),
    ...systemBalances.keys(),
    ...locationBalances.warehouse.keys(),
    ...locationBalances.kitteo.keys(),
    ...physicalById.keys(),
  ]);
  const rows = [...allIds].map(key => {
    const corporate = corporateById.get(key);
    const system = systemBalances.get(key);
    const warehouse = locationBalances.warehouse.get(key);
    const kitteo = locationBalances.kitteo.get(key);
    const physical = physicalById.get(key);
    const hasLocationInventory = Boolean(warehouse || kitteo);
    const physicalCountStatus: PhysicalCountStatus = !physical
      ? 'not_audited'
      : physical.countedItems === 0
        ? 'pending'
        : physical.countedItems < physical.totalItems ? 'partial' : 'complete';
    const physicalQty = physical && physical.countedItems > 0 ? physical.quantity : null;
    const corporateQty = corporate?.onHand ?? null;
    const systemQty = system?.units ?? (hasLocationInventory ? 0 : null);
    const differenceSystemCorporate = (systemQty ?? 0) - (corporateQty ?? 0);
    const differencePhysicalCorporate = corporateQty !== null && physicalCountStatus === 'complete' && physicalQty !== null
      ? physicalQty - corporateQty
      : null;
    const hasSystem = Boolean(system) || hasLocationInventory;
    const status: ComparisonStatus = !corporate && !hasSystem && physical
      ? 'physical-only'
      : !corporate
        ? 'system-only'
        : !hasSystem
          ? 'corporate-only'
          : differenceSystemCorporate === 0 ? 'match' : 'difference';
    return {
      key,
      inventoryId: corporate?.inventoryId ?? system?.partNumber ?? warehouse?.partNumber ?? kitteo?.partNumber ?? physical?.partNumber ?? key,
      description: corporate?.description || system?.description || physical?.description || 'Sin descripción',
      hasCorporate: Boolean(corporate),
      corporateQty,
      hasSystem,
      systemQty,
      warehouseQty: warehouse?.quantity ?? 0,
      kitteoQty: kitteo?.quantity ?? 0,
      warehousePhysicalQty: physical && physical.warehouseCountedItems > 0 ? physical.warehouseQuantity : null,
      kitteoPhysicalQty: physical && physical.kitteoCountedItems > 0 ? physical.kitteoQuantity : null,
      physicalQty,
      physicalItemCount: physical?.totalItems ?? 0,
      physicalCountedItems: physical?.countedItems ?? 0,
      physicalCountStatus,
      differenceSystemCorporate,
      differencePhysicalCorporate,
      status,
    } satisfies ComparisonRow;
  }).sort((a, b) => a.inventoryId.localeCompare(b.inventoryId, 'es', { numeric: true }));

  return { rows, negativeSystemBalanceCount };
}

const statusInfo: Record<ComparisonStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  match: { label: 'Coincide', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  difference: { label: 'Con diferencia', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: CircleAlert },
  'corporate-only': { label: 'Solo en balance', className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Building2 },
  'system-only': { label: 'Solo en sistema', className: 'bg-violet-50 text-violet-700 border-violet-200', icon: Database },
  'physical-only': { label: 'Solo en conteo', className: 'bg-purple-50 text-purple-700 border-purple-200', icon: ClipboardCheck },
};

const physicalStatusLabels: Record<PhysicalCountStatus, string> = {
  complete: 'Completo',
  partial: 'Parcial',
  pending: 'Pendiente',
  not_audited: 'Sin auditoría',
};

export function InventoryComparisonPage() {
  const { userProfile } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [imports, setImports] = useState<BalanceImport[]>([]);
  const [audits, setAudits] = useState<AuditOption[]>([]);
  const [runs, setRuns] = useState<ComparisonRun[]>([]);
  const [selectedImportId, setSelectedImportId] = useState('');
  const [selectedAuditId, setSelectedAuditId] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>([]);
  const [finalReviewRows, setFinalReviewRows] = useState<FinalReviewRow[]>([]);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingUpload, setSavingUpload] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [filter, setFilter] = useState<'all' | ComparisonStatus>('all');
  const [comparisonTab, setComparisonTab] = useState<'comparison' | 'final_review'>('comparison');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageError, setPageError] = useState('');
  const [fileError, setFileError] = useState('');
  const [notice, setNotice] = useState('');
  const [negativeSystemBalanceCount, setNegativeSystemBalanceCount] = useState(0);

  const selectedImport = imports.find(item => item.id === selectedImportId) ?? null;
  const selectedAudit = audits.find(item => String(item.id) === selectedAuditId) ?? null;
  const activeRun = runs.find(item => item.id === selectedRunId) ?? null;

  const clearSelectedResult = () => {
    setSelectedRunId('');
    setComparisonRows([]);
    setFinalReviewRows([]);
    setNegativeSystemBalanceCount(0);
    setCurrentPage(1);
  };

  const loadSnapshot = async (runId: string) => {
    const [stored, storedFinalReview] = await Promise.all([
      fetchAllPages<StoredComparisonRow>(async (from, to) => {
        const { data, error } = await supabase
          .from('inventory_comparison_items')
          .select('inventory_id, normalized_inventory_id, description, has_corporate, corporate_on_hand, has_system, system_units, warehouse_units, kitteo_units, physical_counted, physical_audit_item_count, physical_audit_counted_items, physical_count_status, difference_system_corporate, difference_physical_corporate')
          .eq('comparison_run_id', runId)
          .order('normalized_inventory_id', { ascending: true })
          .range(from, to);
        return { data: (data ?? []) as unknown as StoredComparisonRow[], error };
      }),
      fetchAllPages<StoredFinalReviewRow>(async (from, to) => {
        const { data, error } = await supabase
          .from('inventory_final_review_items')
          .select('inventory_id, normalized_inventory_id, description, on_hand, warehouse_counted, kitteo_counted, total_counted, difference, physical_count_status, physical_audit_item_count, physical_audit_counted_items, review_status')
          .eq('comparison_run_id', runId)
          .order('normalized_inventory_id', { ascending: true })
          .range(from, to);
        return { data: (data ?? []) as unknown as StoredFinalReviewRow[], error };
      }),
    ]);
    setComparisonRows(stored.map(mapStoredRow));
    setFinalReviewRows(storedFinalReview.map(mapStoredFinalReviewRow));
    setFilter('all');
    setSearch('');
    setCurrentPage(1);
    setNegativeSystemBalanceCount(0);
  };

  const loadInitialData = async () => {
    setLoading(true);
    setPageError('');
    const [importsResponse, auditsResponse, runsResponse] = await Promise.all([
      supabase.from('inventory_balance_imports')
        .select('id, file_name, imported_at, data_row_count, stored_row_count, duplicate_row_count, skipped_row_count')
        .order('imported_at', { ascending: false }).limit(50),
      supabase.from('physical_audits')
        .select('id, name, status, created_at')
        .order('created_at', { ascending: false }).limit(250),
      supabase.from('inventory_comparison_runs')
        .select('id, balance_import_id, physical_audit_id, physical_audit_name_snapshot, physical_audit_status_snapshot, compared_at, system_quantity_rule')
        .order('compared_at', { ascending: false }).limit(50),
    ]);
    if (importsResponse.error) setPageError(`No se pudieron cargar los balances guardados: ${importsResponse.error.message}`);
    if (auditsResponse.error) setPageError(current => current || `No se pudieron cargar las auditorías físicas: ${auditsResponse.error.message}`);
    if (runsResponse.error) setPageError(current => current || `No se pudo cargar el historial de comparaciones: ${runsResponse.error.message}`);

    const loadedImports = (importsResponse.data ?? []) as unknown as BalanceImport[];
    const loadedAudits = (auditsResponse.data ?? []) as unknown as AuditOption[];
    const loadedRuns = (runsResponse.data ?? []) as unknown as ComparisonRun[];
    setImports(loadedImports);
    setAudits(loadedAudits);
    setRuns(loadedRuns);
    if (loadedRuns[0]) {
      setSelectedRunId(loadedRuns[0].id);
      setSelectedImportId(loadedRuns[0].balance_import_id);
      setSelectedAuditId(loadedRuns[0].physical_audit_id === null ? '' : String(loadedRuns[0].physical_audit_id));
      try {
        await loadSnapshot(loadedRuns[0].id);
      } catch (error) {
        setPageError(error instanceof Error ? `No se pudo cargar el resultado guardado: ${error.message}` : 'No se pudo cargar el resultado guardado.');
      }
    } else {
      setSelectedImportId(loadedImports[0]?.id ?? '');
      setSelectedRunId('');
      setComparisonRows([]);
      setFinalReviewRows([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadInitialData();
    // La carga inicial se ejecuta una vez; los cambios posteriores usan los botones de actualizar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readFile = async (file?: File) => {
    if (!file) return;
    setFileError('');
    setPageError('');
    setNotice('');
    setPendingUpload(null);
    if (!/\.xlsx?$/i.test(file.name)) {
      setFileError('Selecciona un archivo de Excel .xlsx o .xls.');
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setFileError('El archivo excede el límite de 30 MB.');
      return;
    }
    setReading(true);
    try {
      const parsed = await parseWorkbook(file);
      setPendingUpload({ ...parsed, fileName: file.name });
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'No se pudo leer el archivo.');
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void readFile(event.dataTransfer.files[0]);
  };

  const saveBalance = async () => {
    if (!pendingUpload) return;
    setSavingUpload(true);
    setFileError('');
    setPageError('');
    setNotice('');
    try {
      const { data: importRecord, error: importError } = await supabase
        .from('inventory_balance_imports')
        .insert({
          file_name: pendingUpload.fileName,
          imported_by: userProfile?.user_id ?? null,
          data_row_count: pendingUpload.dataRowCount,
          stored_row_count: pendingUpload.rows.length,
          duplicate_row_count: pendingUpload.duplicates,
          skipped_row_count: pendingUpload.skipped,
        })
        .select('id, file_name, imported_at, data_row_count, stored_row_count, duplicate_row_count, skipped_row_count')
        .single();
      if (importError || !importRecord) throw new Error(importError?.message ?? 'No se pudo crear el registro de importación.');

      const importId = String(importRecord.id);
      const rowsToStore = pendingUpload.rows.map(row => ({
        import_id: importId,
        source_row_number: row.sourceRowNumber,
        inventory_id: row.inventoryId,
        description: row.description || null,
        on_hand: row.onHand,
      }));
      try {
        for (let index = 0; index < rowsToStore.length; index += INSERT_BATCH_SIZE) {
          const { error } = await supabase.from('inventory_balance_items').insert(rowsToStore.slice(index, index + INSERT_BATCH_SIZE));
          if (error) throw new Error(error.message);
        }
      } catch (insertError) {
        const { error: rollbackError } = await supabase.from('inventory_balance_imports').delete().eq('id', importId);
        const detail = insertError instanceof Error ? insertError.message : 'Error al guardar las filas del balance.';
        throw new Error(rollbackError
          ? `${detail}. Además, no se pudo eliminar el encabezado parcial (${rollbackError.message}).`
          : `${detail}. Se revirtió el encabezado y sus filas parciales.`);
      }

      const savedImport = importRecord as unknown as BalanceImport;
      setImports(current => [savedImport, ...current.filter(item => item.id !== importId)]);
      setSelectedImportId(importId);
      clearSelectedResult();
      setPendingUpload(null);
      setNotice(`Balance “${savedImport.file_name}” guardado en Supabase con ${formatNumber(savedImport.stored_row_count)} filas válidas. El archivo binario no se conserva; sí sus datos y metadatos.`);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'No se pudo guardar el balance en la base de datos.');
    } finally {
      setSavingUpload(false);
    }
  };

  const loadAuditItems = async (auditId: number) => {
    const auditLocations = await fetchAllPages<{ id: number; source: string | null }>(async (from, to) => {
      const { data, error } = await supabase
        .from('physical_audit_locations')
        .select('id, source')
        .eq('audit_id', auditId)
        .order('id', { ascending: true })
        .range(from, to);
      return { data: (data ?? []) as { id: number; source: string | null }[], error };
    });
    const ids = auditLocations.map(location => location.id);
    if (ids.length === 0) return [] as PhysicalSource[];
    const sourceByLocationId = new Map(auditLocations.map(location => [location.id, location.source]));

    const chunks: number[][] = [];
    for (let index = 0; index < ids.length; index += 100) chunks.push(ids.slice(index, index + 100));
    const results: PhysicalSource[] = [];
    for (let index = 0; index < chunks.length; index += 4) {
      const pageResults = await Promise.all(chunks.slice(index, index + 4).map(chunk => fetchAllPages<PhysicalSource>(async (from, to) => {
        const { data, error } = await supabase
          .from('physical_audit_items')
          .select('audit_location_id, part_number, description, found_qty')
          .in('audit_location_id', chunk)
          .order('id', { ascending: true })
          .range(from, to);
        const rows = (data ?? []) as Omit<PhysicalSource, 'source'>[];
        return {
          data: rows.map(row => ({ ...row, source: sourceByLocationId.get(row.audit_location_id) ?? null })),
          error,
        };
      })));
      pageResults.forEach(rows => results.push(...rows));
    }
    return results;
  };

  const executeComparison = async () => {
    if (!selectedImportId) return;
    setComparing(true);
    setPageError('');
    setNotice('');
    let createdRunId: string | null = null;
    try {
      const [corporateRows, entryRows, shippingRows, kitteoExitRows, physicalRows, locationBalances] = await Promise.all([
        fetchAllPages<CorporateRow>(async (from, to) => {
          const { data, error } = await supabase
            .from('inventory_balance_items')
            .select('source_row_number, inventory_id, description, on_hand')
            .eq('import_id', selectedImportId)
            .order('source_row_number', { ascending: true })
            .range(from, to);
          const rows = ((data ?? []) as unknown as { source_row_number: number; inventory_id: string; description: string | null; on_hand: number | string }[]).map(row => {
            const inventoryId = String(row.inventory_id);
            return {
              sourceRowNumber: row.source_row_number,
              inventoryId,
              key: normalizeInventoryId(inventoryId),
              description: row.description ?? '',
              onHand: Number(row.on_hand),
            };
          });
          return { data: rows, error };
        }),
        fetchAllPages<SystemSource>(async (from, to) => {
          const { data, error } = await supabase.from('entries')
            .select('part_number, description, total_units').order('id', { ascending: true }).range(from, to);
          return { data: (data ?? []) as SystemSource[], error };
        }),
        fetchAllPages<SystemSource>(async (from, to) => {
          const { data, error } = await supabase.from('shipping_direct')
            .select('part_number, qty, returned_at').is('returned_at', null).order('id', { ascending: true }).range(from, to);
          return { data: (data ?? []) as SystemSource[], error };
        }),
        fetchAllPages<SystemSource>(async (from, to) => {
          const { data, error } = await supabase.from('kitteo_exits')
            .select('part_number, qty').order('id', { ascending: true }).range(from, to);
          return { data: (data ?? []) as SystemSource[], error };
        }),
        selectedAuditId ? loadAuditItems(Number(selectedAuditId)) : Promise.resolve([] as PhysicalSource[]),
        fetchCurrentLocationBalances(),
      ]);

      if (corporateRows.length === 0) throw new Error('El balance seleccionado no tiene filas guardadas.');
      const { rows, negativeSystemBalanceCount: negativeCount } = buildComparisonRows(
        corporateRows,
        entryRows,
        shippingRows,
        kitteoExitRows,
        physicalRows,
        locationBalances,
      );
      if (rows.length === 0) throw new Error('No se generaron filas para comparar.');

      const { data: runRecord, error: runError } = await supabase
        .from('inventory_comparison_runs')
        .insert({
          balance_import_id: selectedImportId,
          physical_audit_id: selectedAudit?.id ?? null,
          physical_audit_name_snapshot: selectedAudit?.name ?? null,
          physical_audit_status_snapshot: selectedAudit?.status ?? null,
          compared_by: userProfile?.user_id ?? null,
          system_quantity_rule: SYSTEM_QUANTITY_RULE,
        })
        .select('id, balance_import_id, physical_audit_id, physical_audit_name_snapshot, physical_audit_status_snapshot, compared_at, system_quantity_rule')
        .single();
      if (runError || !runRecord) throw new Error(runError?.message ?? 'No se pudo guardar el encabezado de la comparación.');
      createdRunId = String(runRecord.id);

      const snapshotRows = rows.map(row => ({
        comparison_run_id: createdRunId,
        inventory_id: row.inventoryId,
        normalized_inventory_id: row.key,
        description: row.description === 'Sin descripción' ? null : row.description,
        has_corporate: row.hasCorporate,
        corporate_on_hand: row.corporateQty,
        has_system: row.hasSystem,
        system_units: row.systemQty,
        warehouse_units: row.warehouseQty,
        kitteo_units: row.kitteoQty,
        physical_counted: row.physicalQty,
        physical_audit_item_count: row.physicalItemCount,
        physical_audit_counted_items: row.physicalCountedItems,
        physical_count_status: row.physicalCountStatus,
      }));
      for (let index = 0; index < snapshotRows.length; index += INSERT_BATCH_SIZE) {
        const { error } = await supabase.from('inventory_comparison_items').insert(snapshotRows.slice(index, index + INSERT_BATCH_SIZE));
        if (error) throw new Error(error.message);
      }

      const finalReviewSnapshotRows = rows
        .filter(row => row.hasCorporate && row.corporateQty !== null)
        .map(row => {
          const hasSourceCount = row.warehousePhysicalQty !== null || row.kitteoPhysicalQty !== null;
          const totalCounted = hasSourceCount
            ? (row.warehousePhysicalQty ?? 0) + (row.kitteoPhysicalQty ?? 0)
            : null;
          const difference = row.physicalCountStatus === 'complete' && totalCounted !== null
            ? totalCounted - (row.corporateQty ?? 0)
            : null;
          const reviewStatus: FinalReviewStatus = difference !== null
            ? difference === 0 ? 'match' : 'difference'
            : row.physicalCountStatus === 'complete' ? 'not_audited' : row.physicalCountStatus;
          return {
            comparison_run_id: createdRunId,
            inventory_id: row.inventoryId,
            normalized_inventory_id: row.key,
            description: row.description === 'Sin descripción' ? null : row.description,
            on_hand: row.corporateQty ?? 0,
            warehouse_counted: row.warehousePhysicalQty,
            kitteo_counted: row.kitteoPhysicalQty,
            total_counted: totalCounted,
            difference,
            physical_count_status: row.physicalCountStatus,
            physical_audit_item_count: row.physicalItemCount,
            physical_audit_counted_items: row.physicalCountedItems,
            review_status: reviewStatus,
          };
        });
      for (let index = 0; index < finalReviewSnapshotRows.length; index += INSERT_BATCH_SIZE) {
        const { error } = await supabase.from('inventory_final_review_items').insert(finalReviewSnapshotRows.slice(index, index + INSERT_BATCH_SIZE));
        if (error) throw new Error(`No se pudo guardar el snapshot de Revisión final: ${error.message}`);
      }

      const savedRun = runRecord as unknown as ComparisonRun;
      setRuns(current => [savedRun, ...current.filter(run => run.id !== createdRunId)]);
      setSelectedRunId(createdRunId);
      setSelectedImportId(savedRun.balance_import_id);
      setSelectedAuditId(savedRun.physical_audit_id === null ? '' : String(savedRun.physical_audit_id));
      setComparisonRows(rows);
      setFinalReviewRows(finalReviewSnapshotRows.map(mapStoredFinalReviewRow));
      setNegativeSystemBalanceCount(negativeCount);
      setFilter('all');
      setSearch('');
      setCurrentPage(1);
      setNotice(`Comparación guardada: ${formatNumber(rows.length)} números de parte usando “${selectedImport?.file_name ?? 'balance'}”${selectedAudit ? ` y la auditoría “${selectedAudit.name}”` : ''}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ocurrió un error al comparar.';
      if (createdRunId) {
        const { error: rollbackError } = await supabase.from('inventory_comparison_runs').delete().eq('id', createdRunId);
        setPageError(rollbackError
          ? `${message}. También falló la limpieza del snapshot parcial (${rollbackError.message}).`
          : `${message}. Se revirtió el snapshot parcial.`);
      } else {
        setPageError(message);
      }
    } finally {
      setComparing(false);
    }
  };

  const selectRun = async (runId: string) => {
    setSelectedRunId(runId);
    setPageError('');
    setNotice('');
    if (!runId) {
      setComparisonRows([]);
      setFinalReviewRows([]);
      setNegativeSystemBalanceCount(0);
      return;
    }
    setComparisonRows([]);
    setFinalReviewRows([]);
    setNegativeSystemBalanceCount(0);
    const run = runs.find(item => item.id === runId);
    if (run) {
      setSelectedImportId(run.balance_import_id);
      setSelectedAuditId(run.physical_audit_id === null ? '' : String(run.physical_audit_id));
    }
    try {
      await loadSnapshot(runId);
    } catch (error) {
      setPageError(error instanceof Error ? `No se pudo cargar el resultado guardado: ${error.message}` : 'No se pudo cargar el resultado guardado.');
    }
  };

  const counts = useMemo(() => ({
    all: comparisonRows.length,
    match: comparisonRows.filter(row => row.status === 'match').length,
    difference: comparisonRows.filter(row => row.status === 'difference').length,
    'corporate-only': comparisonRows.filter(row => row.status === 'corporate-only').length,
    'system-only': comparisonRows.filter(row => row.status === 'system-only').length,
    'physical-only': comparisonRows.filter(row => row.status === 'physical-only').length,
  }), [comparisonRows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return comparisonRows.filter(row => {
      const matchesFilter = filter === 'all' || row.status === filter;
      const searchable = `${row.inventoryId} ${row.description}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return matchesFilter && (!term || searchable.includes(term));
    });
  }, [comparisonRows, filter, search]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / RESULT_PAGE_SIZE));
  const safePage = Math.min(currentPage, pageCount);
  const pageRows = filteredRows.slice((safePage - 1) * RESULT_PAGE_SIZE, safePage * RESULT_PAGE_SIZE);
  const firstVisibleRow = filteredRows.length === 0 ? 0 : (safePage - 1) * RESULT_PAGE_SIZE + 1;
  const lastVisibleRow = Math.min(safePage * RESULT_PAGE_SIZE, filteredRows.length);

  const downloadCsv = () => {
    const headings = [
      'Inventory ID',
      'Description',
      'On Hand (corporativo)',
      'Almacén',
      'KITTEO',
      'Unidades / Sistema (saldo neto)',
      'Físicamente contado (physical_audit_items.found_qty)',
      'Estado del conteo físico',
      'Diferencia sistema - corporativo',
      'Diferencia físico - corporativo',
      'Resultado',
    ];
    const safeText = (value: string) => /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
    const escape = (value: string | number) => `"${String(typeof value === 'string' ? safeText(value) : value).replace(/"/g, '""')}"`;
    const csv = [headings, ...filteredRows.map(row => [
      row.inventoryId,
      row.description,
      row.corporateQty ?? '',
      row.warehouseQty ?? '',
      row.kitteoQty ?? '',
      row.systemQty ?? '',
      row.physicalQty ?? '',
      physicalStatusLabels[row.physicalCountStatus],
      formatDifference(row.differenceSystemCorporate),
      row.differencePhysicalCorporate === null ? '' : formatDifference(row.differencePhysicalCorporate),
      statusInfo[row.status].label,
    ])].map(line => line.map(escape).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comparacion_inventario_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filterItems: { key: 'all' | ComparisonStatus; label: string; count: number }[] = [
    { key: 'all', label: 'Todos', count: counts.all },
    { key: 'difference', label: 'Con diferencia', count: counts.difference },
    { key: 'corporate-only', label: 'Solo en balance', count: counts['corporate-only'] },
    { key: 'system-only', label: 'Solo en sistema', count: counts['system-only'] },
    { key: 'physical-only', label: 'Solo en conteo', count: counts['physical-only'] },
    { key: 'match', label: 'Coinciden', count: counts.match },
  ];

  if (loading) {
    return <div className="flex justify-center rounded-2xl border border-gray-100 bg-white py-16"><Loader2 className="h-9 w-9 animate-spin text-indigo-500" /></div>;
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[.16em] text-indigo-600">Conciliación de inventario</p>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">Comparación</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">Compara el balance de corporativo con el saldo neto del sistema y, si eliges una auditoría, con sus conteos físicos.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700"><ShieldCheck className="h-4 w-4" />Datos guardados en Supabase</span>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><FileSpreadsheet className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-extrabold text-gray-900">Subir balance corporativo</h2>
            <p className="mt-0.5 text-xs text-gray-500">Excel con las columnas Inventory ID, Description y On Hand. Los datos se guardan; no se modifica el inventario operativo.</p>
          </div>
          <span className="hidden rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-extrabold text-gray-500 sm:inline">.XLSX / .XLS</span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.9fr)]">
          <div
            className={`flex min-h-32 flex-wrap items-center gap-3 rounded-xl border border-dashed p-4 transition ${dragging ? 'border-indigo-400 bg-indigo-50' : 'border-indigo-200 bg-slate-50 hover:bg-indigo-50/40'} ${reading ? 'opacity-70' : ''}`}
            onDragOver={event => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input ref={fileInput} className="sr-only" type="file" accept=".xlsx,.xls" onChange={event => void readFile(event.target.files?.[0])} />
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-100 text-indigo-600">{reading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}</span>
            <div className="min-w-[150px] flex-1">
              <p className="text-sm font-bold text-gray-800">{reading ? 'Leyendo el Excel…' : 'Arrastra el archivo aquí o selecciónalo'}</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">Se lee en el navegador; al pulsar Guardar balance se conservan las filas y metadatos en la base de datos.</p>
            </div>
            <button type="button" onClick={() => fileInput.current?.click()} disabled={reading} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"><FileSpreadsheet className="h-4 w-4" />Elegir archivo</button>
          </div>

          <div className="flex min-h-32 flex-col justify-center rounded-xl border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
              <span>{pendingUpload ? 'ARCHIVO LISTO PARA GUARDAR' : 'BALANCE SELECCIONADO'}</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{pendingUpload ? 'PENDIENTE' : selectedImport ? 'GUARDADO' : 'SIN ARCHIVO'}</span>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700"><FileSpreadsheet className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-gray-800" title={pendingUpload?.fileName ?? selectedImport?.file_name}>{pendingUpload?.fileName ?? selectedImport?.file_name ?? 'Todavía no hay un balance guardado'}</p>
                <p className="mt-1 text-[11px] text-gray-500">{pendingUpload
                  ? `${formatNumber(pendingUpload.rows.length)} filas válidas · ${pendingUpload.duplicates} duplicadas · ${pendingUpload.skipped} omitidas`
                  : selectedImport
                    ? `${formatNumber(selectedImport.stored_row_count)} filas · cargado ${formatDate(selectedImport.imported_at)}`
                    : 'Carga un archivo para comenzar.'}</p>
              </div>
              {pendingUpload ? <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-4 w-4" /></span> : selectedImport ? <BadgeCheck className="h-5 w-5 flex-shrink-0 text-emerald-600" /> : null}
            </div>
            {pendingUpload && (pendingUpload.duplicates > 0 || pendingUpload.skipped > 0) && <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />Los Inventory ID repetidos se conservan como filas y se suman al comparar. Se omiten filas incompletas o con On Hand no numérico, negativo o fuera del rango de la base de datos.</p>}
            <button type="button" onClick={saveBalance} disabled={!pendingUpload || savingUpload} className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-500 px-3 text-xs font-extrabold text-white shadow-sm hover:from-indigo-700 hover:to-violet-600 disabled:cursor-not-allowed disabled:opacity-50">{savingUpload ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}{savingUpload ? 'Guardando filas…' : 'Guardar balance en la base de datos'}</button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[11px] font-bold text-gray-600">Balance corporativo guardado</span>
            <select value={selectedImportId} onChange={event => { setSelectedImportId(event.target.value); clearSelectedResult(); }} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
              <option value="">Selecciona un balance…</option>
              {imports.map(item => <option key={item.id} value={item.id}>{item.file_name} · {formatDate(item.imported_at)}</option>)}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[11px] font-bold text-gray-600">Auditoría física para found_qty</span>
            <select value={selectedAuditId} onChange={event => { setSelectedAuditId(event.target.value); clearSelectedResult(); }} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
              <option value="">Sin conteo físico</option>
              {audits.map(audit => <option key={audit.id} value={audit.id}>{audit.name} · {audit.status}</option>)}
            </select>
          </label>
          <button type="button" onClick={executeComparison} disabled={!selectedImportId || comparing || savingUpload} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-500 px-4 text-xs font-extrabold text-white shadow-sm hover:from-indigo-700 hover:to-violet-600 disabled:cursor-not-allowed disabled:opacity-50">{comparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}{comparing ? 'Comparando y guardando…' : 'Comparar y guardar resultado'}</button>
        </div>
        {audits.length === 0 && <p className="mt-2 text-[11px] text-amber-700">No hay auditorías físicas disponibles todavía. Puedes comparar el saldo corporativo y del sistema ahora, y volver a comparar cuando exista una auditoría con conteos.</p>}
      </section>

      <section className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700"><Database className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold text-amber-900">Unidades / Sistema · saldo actual neto</p>
          <p className="mt-0.5 text-[11px] leading-5 text-amber-800">Sistema-Neto sigue siendo el total: suma <code>entries.total_units</code> y resta salidas no devueltas de <code>shipping_direct.qty</code> y salidas de <code>kitteo_exits.qty</code>; las transferencias internas no se descuentan. Almacén y KITTEO muestran por separado lo asignado a sus locaciones al guardar la comparación; pueden no sumar el total si hay material sin ubicación o movimientos pendientes.</p>
        </div>
      </section>

      <section className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-3">
        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700"><ClipboardCheck className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold text-violet-900">Físicamente contado · auditoría seleccionada</p>
          <p className="mt-0.5 text-[11px] leading-5 text-violet-800">Se suma <code>physical_audit_items.found_qty</code> por número de parte dentro de la auditoría elegida. La diferencia físico − corporativo solo aparece si todas las filas de ese número tienen <code>found_qty</code>; conteos parciales o pendientes no producen diferencia.</p>
        </div>
      </section>

      {pageError && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-800"><CircleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" /><span className="flex-1">{pageError}</span><button type="button" aria-label="Cerrar error" onClick={() => setPageError('')}><X className="h-4 w-4" /></button></div>}
      {fileError && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-800"><CircleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" /><span className="flex-1">{fileError}</span><button type="button" aria-label="Cerrar error" onClick={() => setFileError('')}><X className="h-4 w-4" /></button></div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" /><span className="flex-1">{notice}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><X className="h-4 w-4" /></button></div>}
      {negativeSystemBalanceCount > 0 && <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /><span>En {formatNumber(negativeSystemBalanceCount)} Inventory ID, las salidas definitivas registradas exceden las entradas. Conforme al esquema, el saldo neto se limitó a 0 en vez de guardar una cantidad negativa.</span></div>}
      {comparisonRows.some(row => row.warehouseQty === null || row.kitteoQty === null) && <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">Este snapshot histórico es anterior al desglose por Almacén y KITTEO. Vuelve a ejecutar la comparación para guardar esos saldos.</div>}

      <section className="flex flex-col justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center">
        <div className="min-w-0">
          <label htmlFor="comparison-history" className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-500">Historial de comparaciones</label>
          {activeRun && <p className="mt-1 truncate text-[10px] text-gray-500">{formatDate(activeRun.compared_at)} · {imports.find(item => item.id === activeRun.balance_import_id)?.file_name ?? 'Balance guardado'} · {activeRun.physical_audit_name_snapshot ?? 'Sin conteo físico'}</p>}
        </div>
        <select id="comparison-history" value={selectedRunId} onChange={event => void selectRun(event.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-indigo-400 sm:max-w-[480px]">
          <option value="">Sin snapshot seleccionado</option>
          {runs.map(run => {
            const fileName = imports.find(item => item.id === run.balance_import_id)?.file_name ?? 'Balance guardado';
            const auditName = run.physical_audit_name_snapshot ? ` · ${run.physical_audit_name_snapshot}` : ' · sin conteo';
            return <option key={run.id} value={run.id}>{formatDate(run.compared_at)} · {fileName}{auditName}</option>;
          })}
        </select>
      </section>

      <div className="flex w-fit gap-1 rounded-xl border border-gray-100 bg-white p-1 shadow-sm" role="tablist" aria-label="Vistas de comparación">
        <button type="button" role="tab" aria-selected={comparisonTab === 'comparison'} onClick={() => setComparisonTab('comparison')} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${comparisonTab === 'comparison' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}><ArrowLeftRight className="h-4 w-4" />Comparación</button>
        <button type="button" role="tab" aria-selected={comparisonTab === 'final_review'} onClick={() => setComparisonTab('final_review')} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${comparisonTab === 'final_review' ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}><ClipboardCheck className="h-4 w-4" />Revisión final</button>
      </div>

      {comparisonTab === 'final_review' ? (
        <FinalReviewView rows={finalReviewRows} hasSnapshot={Boolean(activeRun)} />
      ) : (
      <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="Coinciden" value={counts.match} detail="Mismo saldo sistema/corporativo" tone="green" icon={<CheckCircle2 className="h-5 w-5" />} />
        <MetricCard label="Con diferencia" value={counts.difference} detail="Sistema frente a On Hand" tone="amber" icon={<CircleAlert className="h-5 w-5" />} />
        <MetricCard label="Solo en balance" value={counts['corporate-only']} detail="Sin registro de sistema" tone="blue" icon={<Building2 className="h-5 w-5" />} />
        <MetricCard label="Solo en sistema" value={counts['system-only']} detail="No aparece en el Excel" tone="violet" icon={<Database className="h-5 w-5" />} />
        <MetricCard label="Solo en conteo" value={counts['physical-only']} detail="Aparece solo en auditoría" tone="violet" icon={<ClipboardCheck className="h-5 w-5" />} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-indigo-600"><ListFilter className="h-5 w-5" /><h2 className="text-sm font-extrabold text-gray-900">Resultado por Inventory ID</h2></div>
            <p className="mt-1 text-[11px] text-gray-500">Diferencias: <strong>sistema − corporativo</strong> y <strong>físico completo − corporativo</strong>.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={downloadCsv} disabled={comparisonRows.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"><Download className="h-4 w-4" />Descargar CSV</button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between sm:px-5">
          <div className="flex min-h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-gray-400 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
            <Search className="h-4 w-4 flex-shrink-0" />
            <input aria-label="Buscar por Inventory ID o descripción" type="search" placeholder="Buscar ID o descripción…" value={search} onChange={event => { setSearch(event.target.value); setCurrentPage(1); }} className="min-w-0 flex-1 border-0 bg-transparent text-xs text-gray-700 outline-none placeholder:text-gray-400" />
            {search && <button type="button" aria-label="Limpiar búsqueda" onClick={() => { setSearch(''); setCurrentPage(1); }}><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1" role="group" aria-label="Filtrar resultados">
            {filterItems.map(item => <button key={item.key} type="button" onClick={() => { setFilter(item.key); setCurrentPage(1); }} className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition ${filter === item.key ? 'border border-indigo-200 bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}>{item.label}<span className={`rounded px-1.5 py-0.5 text-[9px] ${filter === item.key ? 'bg-indigo-100' : 'bg-gray-100'}`}>{item.count}</span></button>)}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1570px] border-collapse">
            <thead className="bg-gradient-to-r from-slate-50 to-indigo-50/60">
              <tr>
                <th className="px-4 py-3 text-left text-[9px] font-extrabold uppercase tracking-wider text-gray-500">Inventory ID</th>
                <th className="px-3 py-3 text-left text-[9px] font-extrabold uppercase tracking-wider text-gray-500">Descripción</th>
                <th className="px-3 py-3 text-right text-[9px] font-extrabold uppercase tracking-wider text-gray-500">On Hand<br /><span className="text-[8px] text-gray-400">Corporativo</span></th>
                <th className="px-3 py-3 text-right text-[9px] font-extrabold uppercase tracking-wider text-gray-500">Almacén<br /><span className="text-[8px] text-gray-400">Asignado a racks</span></th>
                <th className="px-3 py-3 text-right text-[9px] font-extrabold uppercase tracking-wider text-gray-500">KITTEO<br /><span className="text-[8px] text-gray-400">Asignado a locaciones</span></th>
                <th className="px-3 py-3 text-right text-[9px] font-extrabold uppercase tracking-wider text-gray-500">Unidades<br /><span className="text-[8px] text-gray-400">Sistema-Neto · total</span></th>
                <th className="px-3 py-3 text-right text-[9px] font-extrabold uppercase tracking-wider text-gray-500">Físicamente<br /><span className="text-[8px] text-gray-400">Contado · found_qty</span></th>
                <th className="px-3 py-3 text-right text-[9px] font-extrabold uppercase tracking-wider text-gray-500">Diferencia<br /><span className="text-[8px] text-gray-400">Sistema − corporativo</span></th>
                <th className="px-3 py-3 text-right text-[9px] font-extrabold uppercase tracking-wider text-gray-500">Diferencia<br /><span className="text-[8px] text-gray-400">Físico − corporativo</span></th>
                <th className="px-4 py-3 text-left text-[9px] font-extrabold uppercase tracking-wider text-gray-500">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, index) => {
                const status = statusInfo[row.status];
                const StatusIcon = status.icon;
                const differenceClass = (difference: number) => difference === 0
                  ? 'border-gray-200 bg-gray-50 text-gray-500'
                  : difference > 0 ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-red-200 bg-red-50 text-red-700';
                const rowStatusClass = row.status === 'difference'
                  ? row.differenceSystemCorporate > 0 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-red-50 text-red-700 border-red-200'
                  : status.className;
                return <tr key={row.key} className={`border-b border-gray-100 last:border-0 hover:bg-indigo-50/50 ${index % 2 ? 'bg-slate-50/60' : 'bg-white'}`}>
                  <td className="px-4 py-3"><span className="inline-block max-w-[220px] truncate rounded-md border border-indigo-100 bg-indigo-50 px-2 py-1 font-mono text-[10px] font-bold text-indigo-700" title={row.inventoryId}>{row.inventoryId}</span></td>
                  <td className="max-w-[260px] truncate px-3 py-3 text-xs text-gray-600" title={row.description}>{row.description}</td>
                  <td className="px-3 py-3 text-right text-xs font-extrabold tabular-nums text-gray-800">{row.corporateQty === null ? <span className="text-gray-300">—</span> : formatNumber(row.corporateQty)}</td>
                  <td className="px-3 py-3 text-right text-xs font-extrabold tabular-nums text-gray-800">{row.warehouseQty === null ? <span className="text-gray-300">—</span> : formatNumber(row.warehouseQty)}</td>
                  <td className="px-3 py-3 text-right text-xs font-extrabold tabular-nums text-gray-800">{row.kitteoQty === null ? <span className="text-gray-300">—</span> : formatNumber(row.kitteoQty)}</td>
                  <td className="px-3 py-3 text-right text-xs font-extrabold tabular-nums text-gray-800">{row.systemQty === null ? <span className="text-gray-300">—</span> : formatNumber(row.systemQty)}</td>
                  <td className="px-3 py-3 text-right"><div className="flex flex-col items-end gap-1"><strong className="text-xs tabular-nums text-gray-800">{row.physicalQty === null ? <span className="text-gray-300">—</span> : formatNumber(row.physicalQty)}</strong><span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-extrabold ${row.physicalCountStatus === 'complete' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : row.physicalCountStatus === 'partial' ? 'border-amber-200 bg-amber-50 text-amber-700' : row.physicalCountStatus === 'pending' ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>{physicalStatusLabels[row.physicalCountStatus]}</span></div></td>
                  <td className="px-3 py-3 text-right"><span className={`inline-flex min-w-12 justify-center rounded-full border px-2 py-1 text-[10px] font-extrabold tabular-nums ${differenceClass(row.differenceSystemCorporate)}`}>{formatDifference(row.differenceSystemCorporate)}</span></td>
                  <td className="px-3 py-3 text-right">{row.differencePhysicalCorporate === null ? <span className="text-xs text-gray-300">—</span> : <span className={`inline-flex min-w-12 justify-center rounded-full border px-2 py-1 text-[10px] font-extrabold tabular-nums ${differenceClass(row.differencePhysicalCorporate)}`}>{formatDifference(row.differencePhysicalCorporate)}</span>}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-extrabold ${rowStatusClass}`}><StatusIcon className="h-3.5 w-3.5" />{status.label}</span></td>
                </tr>;
              })}
              {filteredRows.length === 0 && <tr><td colSpan={10} className="h-40 text-center text-xs text-gray-400"><div className="flex flex-col items-center gap-2"><Search className="h-5 w-5" /><strong className="text-gray-600">{comparisonRows.length === 0 ? 'Aún no hay una comparación guardada' : 'No hay resultados para este filtro'}</strong><span>{comparisonRows.length === 0 ? 'Guarda un balance y pulsa “Comparar y guardar resultado”.' : 'Prueba otra búsqueda o selecciona “Todos”.'}</span></div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50/70 px-4 py-3 text-[10px] text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span>Mostrando <strong className="text-gray-700">{formatNumber(firstVisibleRow)}–{formatNumber(lastVisibleRow)}</strong> de <strong className="text-gray-700">{formatNumber(filteredRows.length)}</strong> resultados</span>
          {pageCount > 1 && <div className="flex items-center gap-2"><button type="button" aria-label="Página anterior" disabled={safePage === 1} onClick={() => setCurrentPage(page => Math.max(1, page - 1))} className="grid h-7 w-7 place-items-center rounded border border-gray-200 bg-white text-indigo-600 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span>Página <strong>{safePage}</strong> de <strong>{pageCount}</strong></span><button type="button" aria-label="Página siguiente" disabled={safePage === pageCount} onClick={() => setCurrentPage(page => Math.min(pageCount, page + 1))} className="grid h-7 w-7 place-items-center rounded border border-gray-200 bg-white text-indigo-600 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div>}
          <span className="inline-flex items-center gap-1.5 truncate" title={activeRun?.system_quantity_rule ?? SYSTEM_QUANTITY_RULE}><FileCheck2 className="h-3.5 w-3.5 flex-shrink-0 text-indigo-400" />{activeRun ? `Snapshot · ${activeRun.id.slice(0, 8)}` : 'Resultado en pantalla'}</span>
        </div>
      </section>

      <p className="flex items-start justify-center gap-1.5 px-2 text-center text-[10px] leading-5 text-gray-400"><Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-indigo-400" />Cada comparación conserva una copia de sus cantidades y diferencias; cambios futuros al inventario o a la auditoría no alteran los resultados históricos.</p>
      </>
      )}
    </div>
  );
}

function MetricCard({ label, value, detail, tone, icon }: { label: string; value: number; detail: string; tone: 'green' | 'amber' | 'blue' | 'violet'; icon: React.ReactNode }) {
  const tones = {
    green: 'border-emerald-100 bg-gradient-to-br from-emerald-50 to-white text-emerald-700',
    amber: 'border-amber-100 bg-gradient-to-br from-amber-50 to-white text-amber-700',
    blue: 'border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-700',
    violet: 'border-violet-100 bg-gradient-to-br from-violet-50 to-white text-violet-700',
  };
  return <div className={`flex min-h-[88px] items-center gap-3 rounded-xl border p-3 shadow-sm ${tones[tone]}`}>
    <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-white/80">{icon}</span>
    <span className="flex min-w-0 flex-col"><span className="truncate text-[10px] font-extrabold text-gray-600">{label}</span><strong className="mt-0.5 text-xl font-black leading-tight">{formatNumber(value)}</strong><small className="mt-0.5 truncate text-[9px] text-gray-400">{detail}</small></span>
  </div>;
}

const finalReviewStatusInfo: Record<FinalReviewStatus, { label: string; className: string }> = {
  match: { label: 'Coincide · sin diferencia', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  difference: { label: 'Con diferencia', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  partial: { label: 'Conteo parcial', className: 'border-orange-200 bg-orange-50 text-orange-700' },
  pending: { label: 'Pendiente de conteo', className: 'border-gray-200 bg-gray-50 text-gray-600' },
  not_audited: { label: 'Sin auditoría física', className: 'border-gray-200 bg-gray-50 text-gray-500' },
};

function FinalReviewView({ rows, hasSnapshot }: { rows: FinalReviewRow[]; hasSnapshot: boolean }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FinalReviewFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const reviewRows = rows;

  const counts = useMemo(() => ({
    all: reviewRows.length,
    difference: reviewRows.filter(row => row.finalStatus === 'difference').length,
    match: reviewRows.filter(row => row.finalStatus === 'match').length,
    pending: reviewRows.filter(row => !['difference', 'match'].includes(row.finalStatus)).length,
  }), [reviewRows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return reviewRows.filter(row => {
      const matchesFilter = filter === 'all'
        || row.finalStatus === filter
        || (filter === 'pending' && !['difference', 'match'].includes(row.finalStatus));
      const searchable = `${row.inventoryId} ${row.description}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return matchesFilter && (!term || searchable.includes(term));
    });
  }, [filter, reviewRows, search]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / RESULT_PAGE_SIZE));
  const safePage = Math.min(currentPage, pageCount);
  const pageRows = filteredRows.slice((safePage - 1) * RESULT_PAGE_SIZE, safePage * RESULT_PAGE_SIZE);
  const firstVisibleRow = filteredRows.length === 0 ? 0 : (safePage - 1) * RESULT_PAGE_SIZE + 1;
  const lastVisibleRow = Math.min(safePage * RESULT_PAGE_SIZE, filteredRows.length);
  const downloadCsv = () => {
    const headings = [
      'Inventory ID',
      'Description',
      'On Hand',
      'Conteo almacén',
      'Conteo KITTEO',
      'Total contado almacén + KITTEO',
      'Diferencia total contado - On Hand',
      'Estado',
    ];
    const safeText = (value: string) => /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
    const escape = (value: string | number) => `"${String(typeof value === 'string' ? safeText(value) : value).replace(/"/g, '""')}"`;
    const csv = [headings, ...filteredRows.map(row => [
      row.inventoryId,
      row.description,
      row.onHand,
      row.warehouseCounted ?? '',
      row.kitteoCounted ?? '',
      row.totalCounted ?? '',
      row.difference === null ? '' : formatDifference(row.difference),
      row.finalStatus === 'difference' && row.difference !== null
        ? `Diferencia ${formatDifference(row.difference)}`
        : finalReviewStatusInfo[row.finalStatus].label,
    ])].map(line => line.map(escape).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `revision_final_inventario_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!hasSnapshot) {
    return <section className="rounded-2xl border border-dashed border-indigo-200 bg-white p-10 text-center shadow-sm"><ClipboardCheck className="mx-auto h-8 w-8 text-indigo-400" /><h2 className="mt-3 text-base font-extrabold text-gray-800">Todavía no hay una comparación guardada</h2><p className="mt-1 text-sm text-gray-500">Selecciona un balance y una auditoría física, y pulsa “Comparar y guardar resultado” para preparar la revisión final.</p></section>;
  }

  if (!rows.length) {
    return <section className="rounded-2xl border border-dashed border-violet-200 bg-white p-10 text-center shadow-sm"><Package className="mx-auto h-8 w-8 text-violet-300" /><h2 className="mt-3 text-base font-extrabold text-gray-800">Este snapshot todavía no tiene Revisión final guardada</h2><p className="mx-auto mt-1 max-w-xl text-sm text-gray-500">Las comparaciones anteriores a la nueva tabla no se rellenaron automáticamente. Ejecuta una comparación nueva para guardar aquí el On Hand, los conteos de almacén y KITTEO, el total y la diferencia.</p></section>;
  }

  const reviewFilters: { key: FinalReviewFilter; label: string; count: number }[] = [
    { key: 'all', label: 'Todos', count: counts.all },
    { key: 'difference', label: 'Con diferencia', count: counts.difference },
    { key: 'match', label: 'Coinciden', count: counts.match },
    { key: 'pending', label: 'Pendientes / incompletos', count: counts.pending },
  ];

  return (
    <div className="space-y-4">
      <section className="flex flex-col justify-between gap-3 rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-violet-700">Cierre de conteo físico</p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-gray-900">Revisión final de On Hand</h2>
          <p className="mt-1 text-xs leading-5 text-gray-600">Solo incluye los artículos del balance corporativo. Total contado = almacén + KITTEO; diferencia = total contado − On Hand.</p>
        </div>
        <button type="button" onClick={downloadCsv} disabled={filteredRows.length === 0} className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"><Download className="h-4 w-4" />Descargar revisión CSV</button>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Artículos On Hand" value={counts.all} detail="Incluidos en el balance" tone="blue" icon={<Package className="h-5 w-5" />} />
        <MetricCard label="Sin diferencia" value={counts.match} detail="Conteo completo contra On Hand" tone="green" icon={<CheckCircle2 className="h-5 w-5" />} />
        <MetricCard label="Con diferencia" value={counts.difference} detail="Conteo completo distinto de On Hand" tone="amber" icon={<CircleAlert className="h-5 w-5" />} />
        <MetricCard label="Pendientes / incompletos" value={counts.pending} detail="No se concluye la diferencia" tone="violet" icon={<ClipboardCheck className="h-5 w-5" />} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between sm:px-5">
          <div className="flex min-h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-gray-400 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
            <Search className="h-4 w-4 flex-shrink-0" />
            <input aria-label="Buscar en la revisión final" type="search" placeholder="Buscar Inventory ID o descripción…" value={search} onChange={event => { setSearch(event.target.value); setCurrentPage(1); }} className="min-w-0 flex-1 border-0 bg-transparent text-xs text-gray-700 outline-none placeholder:text-gray-400" />
            {search && <button type="button" aria-label="Limpiar búsqueda" onClick={() => { setSearch(''); setCurrentPage(1); }}><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1" role="group" aria-label="Filtrar revisión final">
            {reviewFilters.map(item => <button key={item.key} type="button" onClick={() => { setFilter(item.key); setCurrentPage(1); }} className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition ${filter === item.key ? 'border border-violet-200 bg-violet-50 text-violet-700' : 'text-gray-500 hover:bg-gray-100'}`}>{item.label}<span className={`rounded px-1.5 py-0.5 text-[9px] ${filter === item.key ? 'bg-violet-100' : 'bg-gray-100'}`}>{item.count}</span></button>)}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse">
            <thead className="bg-gradient-to-r from-slate-50 to-violet-50/70">
              <tr>
                <th className="px-4 py-3 text-left text-[9px] font-extrabold uppercase tracking-wider text-gray-500">Inventory ID</th>
                <th className="px-3 py-3 text-left text-[9px] font-extrabold uppercase tracking-wider text-gray-500">Descripción</th>
                <th className="px-3 py-3 text-right text-[9px] font-extrabold uppercase tracking-wider text-gray-500">On Hand</th>
                <th className="px-3 py-3 text-right text-[9px] font-extrabold uppercase tracking-wider text-gray-500">Conteo almacén</th>
                <th className="px-3 py-3 text-right text-[9px] font-extrabold uppercase tracking-wider text-gray-500">Conteo KITTEO</th>
                <th className="px-3 py-3 text-right text-[9px] font-extrabold uppercase tracking-wider text-gray-500">Total almacén + KITTEO</th>
                <th className="px-4 py-3 text-left text-[9px] font-extrabold uppercase tracking-wider text-gray-500">¿Tiene diferencia?</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, index) => {
                const status = finalReviewStatusInfo[row.finalStatus];
                return <tr key={row.key} className={`border-b border-gray-100 last:border-0 hover:bg-violet-50/50 ${index % 2 ? 'bg-slate-50/60' : 'bg-white'}`}>
                  <td className="px-4 py-3"><span className="inline-block max-w-[220px] truncate rounded-md border border-indigo-100 bg-indigo-50 px-2 py-1 font-mono text-[10px] font-bold text-indigo-700" title={row.inventoryId}>{row.inventoryId}</span></td>
                  <td className="max-w-[260px] truncate px-3 py-3 text-xs text-gray-600" title={row.description}>{row.description}</td>
                  <td className="px-3 py-3 text-right text-xs font-extrabold tabular-nums text-gray-800">{formatNumber(row.onHand)}</td>
                  <td className="px-3 py-3 text-right text-xs font-extrabold tabular-nums text-gray-800">{row.warehouseCounted === null ? <span className="font-normal text-gray-300">—</span> : formatNumber(row.warehouseCounted)}</td>
                  <td className="px-3 py-3 text-right text-xs font-extrabold tabular-nums text-gray-800">{row.kitteoCounted === null ? <span className="font-normal text-gray-300">—</span> : formatNumber(row.kitteoCounted)}</td>
                  <td className="px-3 py-3 text-right"><div className="flex flex-col items-end gap-1"><strong className="text-xs tabular-nums text-gray-800">{row.totalCounted === null ? <span className="font-normal text-gray-300">—</span> : formatNumber(row.totalCounted)}</strong><span className="text-[8px] font-semibold text-gray-400">{row.finalStatus === 'match' || row.finalStatus === 'difference' ? 'Conteo completo' : row.finalStatus === 'partial' ? 'Suma parcial capturada' : 'Sin cantidad capturada'}</span></div></td>
                  <td className="px-4 py-3"><div className="flex flex-col items-start gap-1"><span className={`inline-flex items-center rounded-full border px-2 py-1 text-[9px] font-extrabold ${status.className}`}>{row.finalStatus === 'difference' && row.difference !== null ? `Diferencia ${formatDifference(row.difference)}` : status.label}</span>{row.finalStatus === 'match' && <span className="text-[9px] text-gray-400">0 unidades</span>}</div></td>
                </tr>;
              })}
              {filteredRows.length === 0 && <tr><td colSpan={7} className="h-40 text-center text-xs text-gray-400"><div className="flex flex-col items-center gap-2"><Search className="h-5 w-5" /><strong className="text-gray-600">No hay resultados para este filtro</strong><span>Prueba otra búsqueda o selecciona “Todos”.</span></div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50/70 px-4 py-3 text-[10px] text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span>Mostrando <strong className="text-gray-700">{formatNumber(firstVisibleRow)}–{formatNumber(lastVisibleRow)}</strong> de <strong className="text-gray-700">{formatNumber(filteredRows.length)}</strong> artículos On Hand</span>
          {pageCount > 1 && <div className="flex items-center gap-2"><button type="button" aria-label="Página anterior de revisión final" disabled={safePage === 1} onClick={() => setCurrentPage(page => Math.max(1, page - 1))} className="grid h-7 w-7 place-items-center rounded border border-gray-200 bg-white text-violet-600 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span>Página <strong>{safePage}</strong> de <strong>{pageCount}</strong></span><button type="button" aria-label="Página siguiente de revisión final" disabled={safePage === pageCount} onClick={() => setCurrentPage(page => Math.min(pageCount, page + 1))} className="grid h-7 w-7 place-items-center rounded border border-gray-200 bg-white text-violet-600 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div>}
          <span className="inline-flex items-center gap-1.5"><FileCheck2 className="h-3.5 w-3.5 text-violet-400" />El resultado corresponde al snapshot seleccionado</span>
        </div>
      </section>

      <p className="flex items-start gap-1.5 px-2 text-[10px] leading-5 text-gray-400"><Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-400" />Los conteos se separan por el origen de cada locación en la auditoría física. Solo se confirma una diferencia cuando todos los artículos de ese Inventory ID en la auditoría tienen cantidad capturada; un conteo parcial queda pendiente de revisión.</p>
    </div>
  );
}
