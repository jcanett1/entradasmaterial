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

type PhysicalSource = {
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
  physical_counted: number | string | null;
  physical_audit_item_count: number;
  physical_audit_counted_items: number;
  physical_count_status: PhysicalCountStatus;
  difference_system_corporate: number | string;
  difference_physical_corporate: number | string | null;
};

const PAGE_SIZE = 1000;
const INSERT_BATCH_SIZE = 300;
const RESULT_PAGE_SIZE = 25;
const SYSTEM_QUANTITY_RULE = 'Saldo neto por Inventory ID: suma de entries.total_units menos salidas definitivas de shipping_direct (excluye devoluciones) y kitteo_exits. No se restan transferes porque son movimientos internos. El saldo mostrado tiene piso 0 cuando las salidas superan lo registrado, conforme al esquema de comparación.';
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
    physicalQty,
    physicalItemCount: Number(row.physical_audit_item_count),
    physicalCountedItems: Number(row.physical_audit_counted_items),
    physicalCountStatus: row.physical_count_status,
    differenceSystemCorporate,
    differencePhysicalCorporate,
    status,
  };
}

function buildComparisonRows(
  corporateRows: CorporateRow[],
  entries: SystemSource[],
  shippingDirect: SystemSource[],
  kitteoExits: SystemSource[],
  physicalRows: PhysicalSource[],
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
    };
    existing.totalItems += 1;
    if (!existing.description && row.description) existing.description = row.description;
    if (row.found_qty !== null && row.found_qty !== undefined) {
      existing.quantity += asNumber(row.found_qty) ?? 0;
      existing.countedItems += 1;
    }
    physicalById.set(key, existing);
  });

  const allIds = new Set([...corporateById.keys(), ...systemBalances.keys(), ...physicalById.keys()]);
  const rows = [...allIds].map(key => {
    const corporate = corporateById.get(key);
    const system = systemBalances.get(key);
    const physical = physicalById.get(key);
    const physicalCountStatus: PhysicalCountStatus = !physical
      ? 'not_audited'
      : physical.countedItems === 0
        ? 'pending'
        : physical.countedItems < physical.totalItems ? 'partial' : 'complete';
    const physicalQty = physical && physical.countedItems > 0 ? physical.quantity : null;
    const corporateQty = corporate?.onHand ?? null;
    const systemQty = system?.units ?? null;
    const differenceSystemCorporate = (systemQty ?? 0) - (corporateQty ?? 0);
    const differencePhysicalCorporate = corporateQty !== null && physicalCountStatus === 'complete' && physicalQty !== null
      ? physicalQty - corporateQty
      : null;
    const status: ComparisonStatus = !corporate && !system && physical
      ? 'physical-only'
      : !corporate
        ? 'system-only'
        : !system
          ? 'corporate-only'
          : differenceSystemCorporate === 0 ? 'match' : 'difference';
    return {
      key,
      inventoryId: corporate?.inventoryId ?? system?.partNumber ?? physical?.partNumber ?? key,
      description: corporate?.description || system?.description || physical?.description || 'Sin descripción',
      hasCorporate: Boolean(corporate),
      corporateQty,
      hasSystem: Boolean(system),
      systemQty,
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
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingUpload, setSavingUpload] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [filter, setFilter] = useState<'all' | ComparisonStatus>('all');
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
    setNegativeSystemBalanceCount(0);
    setCurrentPage(1);
  };

  const loadSnapshot = async (runId: string) => {
    const stored = await fetchAllPages<StoredComparisonRow>(async (from, to) => {
      const { data, error } = await supabase
        .from('inventory_comparison_items')
        .select('inventory_id, normalized_inventory_id, description, has_corporate, corporate_on_hand, has_system, system_units, physical_counted, physical_audit_item_count, physical_audit_counted_items, physical_count_status, difference_system_corporate, difference_physical_corporate')
        .eq('comparison_run_id', runId)
        .order('normalized_inventory_id', { ascending: true })
        .range(from, to);
      return { data: (data ?? []) as unknown as StoredComparisonRow[], error };
    });
    setComparisonRows(stored.map(mapStoredRow));
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
    const auditLocations = await fetchAllPages<{ id: number }>(async (from, to) => {
      const { data, error } = await supabase
        .from('physical_audit_locations')
        .select('id')
        .eq('audit_id', auditId)
        .order('id', { ascending: true })
        .range(from, to);
      return { data: (data ?? []) as { id: number }[], error };
    });
    const ids = auditLocations.map(location => location.id);
    if (ids.length === 0) return [] as PhysicalSource[];

    const chunks: number[][] = [];
    for (let index = 0; index < ids.length; index += 100) chunks.push(ids.slice(index, index + 100));
    const results: PhysicalSource[] = [];
    for (let index = 0; index < chunks.length; index += 4) {
      const pageResults = await Promise.all(chunks.slice(index, index + 4).map(chunk => fetchAllPages<PhysicalSource>(async (from, to) => {
        const { data, error } = await supabase
          .from('physical_audit_items')
          .select('part_number, description, found_qty')
          .in('audit_location_id', chunk)
          .order('id', { ascending: true })
          .range(from, to);
        return { data: (data ?? []) as PhysicalSource[], error };
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
      const [corporateRows, entryRows, shippingRows, kitteoExitRows, physicalRows] = await Promise.all([
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
      ]);

      if (corporateRows.length === 0) throw new Error('El balance seleccionado no tiene filas guardadas.');
      const { rows, negativeSystemBalanceCount: negativeCount } = buildComparisonRows(
        corporateRows,
        entryRows,
        shippingRows,
        kitteoExitRows,
        physicalRows,
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
        physical_counted: row.physicalQty,
        physical_audit_item_count: row.physicalItemCount,
        physical_audit_counted_items: row.physicalCountedItems,
        physical_count_status: row.physicalCountStatus,
      }));
      for (let index = 0; index < snapshotRows.length; index += INSERT_BATCH_SIZE) {
        const { error } = await supabase.from('inventory_comparison_items').insert(snapshotRows.slice(index, index + INSERT_BATCH_SIZE));
        if (error) throw new Error(error.message);
      }

      const savedRun = runRecord as unknown as ComparisonRun;
      setRuns(current => [savedRun, ...current.filter(run => run.id !== createdRunId)]);
      setSelectedRunId(createdRunId);
      setSelectedImportId(savedRun.balance_import_id);
      setSelectedAuditId(savedRun.physical_audit_id === null ? '' : String(savedRun.physical_audit_id));
      setComparisonRows(rows);
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
      setNegativeSystemBalanceCount(0);
      return;
    }
    setComparisonRows([]);
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
          <p className="mt-0.5 text-[11px] leading-5 text-amber-800">Suma <code>entries.total_units</code>, resta <code>shipping_direct.qty</code> no devuelto y <code>kitteo_exits.qty</code>. Las transferencias internas no se descuentan. Si las salidas históricas exceden lo registrado para un ID, el saldo se muestra en 0 y se indica abajo.</p>
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
            <label className="text-[10px] font-bold text-gray-500">Historial guardado</label>
            <select value={selectedRunId} onChange={event => void selectRun(event.target.value)} className="max-w-[360px] rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[11px] text-gray-700 outline-none focus:border-indigo-400">
              <option value="">Sin snapshot seleccionado</option>
              {runs.map(run => {
                const fileName = imports.find(item => item.id === run.balance_import_id)?.file_name ?? 'Balance guardado';
                const auditName = run.physical_audit_name_snapshot ? ` · ${run.physical_audit_name_snapshot}` : ' · sin conteo';
                return <option key={run.id} value={run.id}>{formatDate(run.compared_at)} · {fileName}{auditName}</option>;
              })}
            </select>
            <button type="button" onClick={downloadCsv} disabled={comparisonRows.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"><Download className="h-4 w-4" />Descargar CSV</button>
          </div>
        </div>

        {activeRun && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-[10px] text-gray-500 sm:px-5"><span><strong>Comparado:</strong> {formatDate(activeRun.compared_at)}</span><span><strong>Balance:</strong> {imports.find(item => item.id === activeRun.balance_import_id)?.file_name ?? 'Guardado'}</span><span><strong>Auditoría:</strong> {activeRun.physical_audit_name_snapshot ?? 'Sin conteo físico'}</span></div>}

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
          <table className="w-full min-w-[1370px] border-collapse">
            <thead className="bg-gradient-to-r from-slate-50 to-indigo-50/60">
              <tr>
                <th className="px-4 py-3 text-left text-[9px] font-extrabold uppercase tracking-wider text-gray-500">Inventory ID</th>
                <th className="px-3 py-3 text-left text-[9px] font-extrabold uppercase tracking-wider text-gray-500">Descripción</th>
                <th className="px-3 py-3 text-right text-[9px] font-extrabold uppercase tracking-wider text-gray-500">On Hand<br /><span className="text-[8px] text-gray-400">Corporativo</span></th>
                <th className="px-3 py-3 text-right text-[9px] font-extrabold uppercase tracking-wider text-gray-500">Unidades<br /><span className="text-[8px] text-gray-400">Sistema · neto</span></th>
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
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : difference > 0 ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-red-200 bg-red-50 text-red-700';
                return <tr key={row.key} className={`border-b border-gray-100 last:border-0 hover:bg-indigo-50/50 ${index % 2 ? 'bg-slate-50/60' : 'bg-white'}`}>
                  <td className="px-4 py-3"><span className="inline-block max-w-[220px] truncate rounded-md border border-indigo-100 bg-indigo-50 px-2 py-1 font-mono text-[10px] font-bold text-indigo-700" title={row.inventoryId}>{row.inventoryId}</span></td>
                  <td className="max-w-[260px] truncate px-3 py-3 text-xs text-gray-600" title={row.description}>{row.description}</td>
                  <td className="px-3 py-3 text-right text-xs font-extrabold tabular-nums text-gray-800">{row.corporateQty === null ? <span className="text-gray-300">—</span> : formatNumber(row.corporateQty)}</td>
                  <td className="px-3 py-3 text-right text-xs font-extrabold tabular-nums text-gray-800">{row.systemQty === null ? <span className="text-gray-300">—</span> : formatNumber(row.systemQty)}</td>
                  <td className="px-3 py-3 text-right"><div className="flex flex-col items-end gap-1"><strong className="text-xs tabular-nums text-gray-800">{row.physicalQty === null ? <span className="text-gray-300">—</span> : formatNumber(row.physicalQty)}</strong><span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-extrabold ${row.physicalCountStatus === 'complete' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : row.physicalCountStatus === 'partial' ? 'border-amber-200 bg-amber-50 text-amber-700' : row.physicalCountStatus === 'pending' ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>{physicalStatusLabels[row.physicalCountStatus]}</span></div></td>
                  <td className="px-3 py-3 text-right"><span className={`inline-flex min-w-12 justify-center rounded-full border px-2 py-1 text-[10px] font-extrabold tabular-nums ${differenceClass(row.differenceSystemCorporate)}`}>{formatDifference(row.differenceSystemCorporate)}</span></td>
                  <td className="px-3 py-3 text-right">{row.differencePhysicalCorporate === null ? <span className="text-xs text-gray-300">—</span> : <span className={`inline-flex min-w-12 justify-center rounded-full border px-2 py-1 text-[10px] font-extrabold tabular-nums ${differenceClass(row.differencePhysicalCorporate)}`}>{formatDifference(row.differencePhysicalCorporate)}</span>}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-extrabold ${status.className}`}><StatusIcon className="h-3.5 w-3.5" />{status.label}</span></td>
                </tr>;
              })}
              {filteredRows.length === 0 && <tr><td colSpan={8} className="h-40 text-center text-xs text-gray-400"><div className="flex flex-col items-center gap-2"><Search className="h-5 w-5" /><strong className="text-gray-600">{comparisonRows.length === 0 ? 'Aún no hay una comparación guardada' : 'No hay resultados para este filtro'}</strong><span>{comparisonRows.length === 0 ? 'Guarda un balance y pulsa “Comparar y guardar resultado”.' : 'Prueba otra búsqueda o selecciona “Todos”.'}</span></div></td></tr>}
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
