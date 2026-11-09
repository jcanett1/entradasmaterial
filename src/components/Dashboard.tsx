import React, { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Entry, NewEntry } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { InventoryForm } from './InventoryForm';
import type { MultiEntry } from './InventoryForm';
import { InventoryTable } from './InventoryTable';
import { ReturnInventoryModal } from './ReturnInventoryModal';
import { fetchTerminalExits } from '@/services/terminalExitService';
import { isBlockedByTerminalExit, matchesTerminalExit } from '@/lib/terminalExitState';
import type { TerminalExit } from '@/lib/terminalExitState';
import { fetchInventoryHistoryPage, fetchInventoryHistorySummary } from '@/services/inventoryHistoryService';
import { LabelModal } from './LabelModal';
import { MultiLabelModal } from './MultiLabelModal';
import { PartsCatalogModal } from './PartsCatalogModal';
import { UserManagementDropdown } from './UserManagementDropdown';
import { RacksPage } from './RacksPage';
import { ExitsPage } from './ExitsPage';
import { KitteoPage } from './KitteoPage';
import { PhysicalAuditPage } from './PhysicalAuditPage';
import { InventoryComparisonPage } from './InventoryComparisonPage';
import {
  Package, Plus, X, RefreshCw, Download,
  LayoutDashboard, ClipboardList, Search,
  MapPin, LogOut, Tags, XCircle, ArrowRightFromLine, ArrowLeftRight, AlertTriangle, Hash, LockKeyhole,
  CheckCircle2, CalendarDays, FileText, ClipboardCheck, History,
} from 'lucide-react';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';

type MainTab = 'dashboard' | 'inventario' | 'racks' | 'kitteo' | 'reportes' | 'auditoria' | 'comparacion';
type RackSubTab = 'locaciones' | 'salidas';
type InventorySubTab = 'registro' | 'historial';
const HISTORY_PAGE_SIZE = 25;

const OperationsDashboard = lazy(() => import('./dashboard/OperationsDashboard').then(module => ({ default: module.OperationsDashboard })));
const LocationReports = lazy(() => import('./dashboard/LocationReports').then(module => ({ default: module.LocationReports })));

const toEntryId = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeInventoryPart = (value: string | null | undefined) =>
  (value ?? '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[‐‑‒–—−]/g, '-').replace(/\s+/g, '').toUpperCase();

const normalizeInventoryPo = (value: string | null | undefined) =>
  (value ?? '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toUpperCase();

const getInventoryAssignmentKey = (
  partNumber: string | null | undefined,
  po: string | null | undefined,
  fifoNumber: unknown,
) => {
  const fifo = toEntryId(fifoNumber);
  return `${normalizeInventoryPart(partNumber)}|${normalizeInventoryPo(po)}|${fifo ?? 'none'}`;
};

export function Dashboard() {
  const { userProfile, signOut, isAdmin, isManager, userRol } = useAuth();
  const isOperator = userRol === 'operador';
  const canViewDashboardAndReports = !isOperator && userRol !== 'supervisor';

  // ── Tabs ──
  const [mainTab, setMainTab] = useState<MainTab>(isOperator ? 'racks' : 'inventario');
  const visibleMainTab: MainTab = isOperator && mainTab !== 'racks' && mainTab !== 'kitteo'
    ? 'racks'
    : !canViewDashboardAndReports && (mainTab === 'dashboard' || mainTab === 'reportes')
      ? 'inventario'
      : mainTab;
  const [rackSubTab, setRackSubTab] = useState<RackSubTab>(isOperator ? 'salidas' : 'locaciones');
  const visibleRackSubTab: RackSubTab = isOperator ? 'salidas' : rackSubTab;
  const [visitedMainTabs, setVisitedMainTabs] = useState<Set<MainTab>>(() => new Set([isOperator ? 'racks' : 'inventario']));
  const [visitedRackSubTabs, setVisitedRackSubTabs] = useState<Set<RackSubTab>>(() => new Set([isOperator ? 'salidas' : 'locaciones']));

  useEffect(() => {
    setVisitedMainTabs(previous => new Set(previous).add(visibleMainTab));
  }, [visibleMainTab]);

  useEffect(() => {
    if (visibleMainTab === 'racks') {
      setVisitedRackSubTabs(previous => new Set(previous).add(visibleRackSubTab));
    }
  }, [visibleMainTab, visibleRackSubTab]);

  useEffect(() => {
    if (isOperator && mainTab !== 'racks' && mainTab !== 'kitteo') setMainTab('racks');
    if (!canViewDashboardAndReports && (mainTab === 'dashboard' || mainTab === 'reportes')) setMainTab('inventario');
    if (isOperator && rackSubTab !== 'salidas') setRackSubTab('salidas');
  }, [isOperator, canViewDashboardAndReports, mainTab, rackSubTab]);

  // ── Inventario ──
  const [inventorySubTab, setInventorySubTab] = useState<InventorySubTab>('registro');
  const [dailyRecords, setDailyRecords] = useState<Entry[]>([]);
  const [historyRecords, setHistoryRecords] = useState<Entry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [dailyLoading, setDailyLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExporting, setHistoryExporting] = useState(false);
  const historyRequestId = useRef(0);
  const historySummaryLoaded = useRef(false);
  const historySummaryLoading = useRef(false);
  const records = inventorySubTab === 'registro' ? dailyRecords : historyRecords;
  const loading = inventorySubTab === 'registro' ? dailyLoading : historyLoading;
  const [filteredRecords, setFilteredRecords] = useState<Entry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Entry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stats, setStats] = useState({ total: 0, units: 0, boxes: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [labelRecord, setLabelRecord] = useState<Entry | null>(null);
  const [showPartsCatalog, setShowPartsCatalog] = useState(false);

  // ── IDs de entries ya asignados a una locación (para bloqueo en tabla) ──
  const [assignedEntryIds, setAssignedEntryIds] = useState<Set<number>>(new Set());
  // Mapa de entry_id → location_code para mostrar la leyenda
  const [assignedEntryLocations, setAssignedEntryLocations] = useState<Record<number, string>>({});
  // Mapa de entry_id → FIFO para consultar e imprimir la etiqueta existente.
  const [fifoNumbersByEntryId, setFifoNumbersByEntryId] = useState<Record<number, number>>({});
  // Entradas que ya salieron definitivamente o están fuera del inventario principal.
  const [unavailableEntryIds, setUnavailableEntryIds] = useState<Set<number>>(new Set());
  // Respaldo para salidas históricas creadas antes de guardar entry_id.
  const [historicalExitFingerprints, setHistoricalExitFingerprints] = useState<TerminalExit[]>([]);
  const [unavailableEntryLabels, setUnavailableEntryLabels] = useState<Record<number, string>>({});
  const [assignedEntriesError, setAssignedEntriesError] = useState<string | null>(null);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [returnRecord, setReturnRecord] = useState<Entry | null>(null);
  const [inventoryRevision, setInventoryRevision] = useState(0);

  // ── Selección múltiple ──
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedRecordCache, setSelectedRecordCache] = useState<Map<number, Entry>>(new Map());
  const [showMultiLabel, setShowMultiLabel] = useState(false);

  useEffect(() => {
    setSelectedRecordCache(previous => {
      const next = new Map(previous);
      records.forEach(record => {
        if (selectedIds.has(record.id)) next.set(record.id, record);
      });
      for (const id of next.keys()) {
        if (!selectedIds.has(id)) next.delete(id);
      }
      return next;
    });
  }, [records, selectedIds]);

  /* =======================
     FETCH
  ======================= */
  const fetchRecords = useCallback(async () => {
    setDailyLoading(true);
    setRefreshing(true);
    const pageSize = 1000;
    const recordsData: unknown[] = [];
    let recordsError: { message: string } | null = null;
    const queryStart = new Date();
    queryStart.setHours(0, 0, 0, 0);
    const queryEnd = new Date(queryStart);
    queryEnd.setDate(queryEnd.getDate() + 1);

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase.from('entries').select('*')
        .gte('registered_at', queryStart.toISOString())
        .lt('registered_at', queryEnd.toISOString())
        .order('registered_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        recordsError = error;
        break;
      }

      recordsData.push(...(data ?? []));
      if ((data ?? []).length < pageSize) break;
    }

    if (recordsError) console.error('Error fetching records:', recordsError);
    else {
      const normalizedRecords = recordsData.map(record => {
        const entry = record as Entry;
        return {
          ...entry,
          id: toEntryId(entry.id) ?? entry.id,
        };
      });
      setDailyRecords(normalizedRecords);
    }
    setDailyLoading(false);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const fetchHistorySummary = useCallback(async (force = false) => {
    if ((historySummaryLoaded.current && !force) || historySummaryLoading.current) return;
    historySummaryLoading.current = true;
    try {
      const { summary, error } = await fetchInventoryHistorySummary();
      if (error || !summary) {
        setHistoryError(error ?? 'No se pudieron cargar los totales del historial.');
        return;
      }
      setStats(summary);
      historySummaryLoaded.current = true;
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'No se pudieron cargar los totales del historial.');
    } finally {
      historySummaryLoading.current = false;
    }
  }, []);

  const fetchHistoryPage = useCallback(async (
    page: number,
    filters: { search: string; dateFrom: string; dateTo: string; availableOnly: boolean },
  ) => {
    const requestId = ++historyRequestId.current;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const result = await fetchInventoryHistoryPage(page, HISTORY_PAGE_SIZE, filters);
      if (requestId !== historyRequestId.current) return;
      if (result.error) {
        setHistoryRecords([]);
        setHistoryTotalCount(0);
        setHistoryError(result.error);
        return;
      }
      setHistoryRecords(result.rows);
      setHistoryTotalCount(result.totalCount);
      setHistoryLoaded(true);
      const lastPage = Math.max(1, Math.ceil(result.totalCount / HISTORY_PAGE_SIZE));
      if (page > lastPage) setHistoryPage(lastPage);
    } catch (error) {
      if (requestId === historyRequestId.current) {
        setHistoryRecords([]);
        setHistoryTotalCount(0);
        setHistoryError(error instanceof Error ? error.message : 'No se pudo cargar el historial.');
      }
    } finally {
      if (requestId === historyRequestId.current) setHistoryLoading(false);
    }
  }, []);

  const refreshInventoryRecords = async () => {
    const refreshes: Promise<void>[] = [fetchRecords()];
    if (historyLoaded || inventorySubTab === 'historial') {
      refreshes.push(fetchHistoryPage(historyPage, { search: searchTerm, dateFrom, dateTo, availableOnly }));
      refreshes.push(fetchHistorySummary(true));
    }
    await Promise.all(refreshes);
  };

  /* Fetch de entries asignados, transferidos o salidos definitivamente */
  const fetchAssignedEntries = useCallback(async () => {
    setAssignmentsLoading(true);
    setAssignedEntriesError(null);
    try {

      const pageSize = 1000;
      const loadAllPages = async (loadPage: (from: number, to: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>) => {
        const rows: unknown[] = [];
        let error: { message: string } | null = null;
        for (let from = 0; ; from += pageSize) {
          const result = await loadPage(from, from + pageSize - 1);
          if (result.error) {
            error = result.error;
            break;
          }
          rows.push(...(result.data ?? []));
          if ((result.data ?? []).length < pageSize) break;
        }
        return { data: rows, error };
      };

      const [itemsResult, locationsResult, fifoResult, terminalExitsResult, transferesResult, kitteoItemsResult, kitteoLocationsResult] = await Promise.all([
        loadAllPages(async (from, to) => supabase
          .from('location_items')
          .select('entry_id, location_code, part_number, po, fifo_number')
          .range(from, to)),
        loadAllPages(async (from, to) => supabase
          .from('locations')
          .select('entry_id, location_code')
          .not('entry_id', 'is', null)
          .range(from, to)),
        loadAllPages(async (from, to) => supabase
          .from('fifo_labels')
          .select('entry_id, part_number, po, fifo_number')
          .range(from, to)),
        fetchTerminalExits(),
        loadAllPages(async (from, to) => supabase
          .from('transferes')
          .select('entry_id, location_code')
          .range(from, to)),
        loadAllPages(async (from, to) => supabase
          .from('kitteo_location_items')
          .select('entry_id, location_code')
          .range(from, to)),
        loadAllPages(async (from, to) => supabase
          .from('kitteo_locations')
          .select('entry_id, location_code')
          .eq('status', 'ocupado')
          .not('entry_id', 'is', null)
          .range(from, to)),
      ]);

      const requiredErrors = [
        itemsResult.error && `location_items: ${itemsResult.error.message}`,
        locationsResult.error && `locations: ${locationsResult.error.message}`,
        fifoResult.error && `fifo_labels: ${fifoResult.error.message}`,
        terminalExitsResult.error && `salidas definitivas: ${terminalExitsResult.error.message}`,
        transferesResult.error && `transferencias KITTEO: ${transferesResult.error.message}`,
        kitteoItemsResult.error && `artículos KITTEO: ${kitteoItemsResult.error.message}`,
        kitteoLocationsResult.error && `locaciones KITTEO: ${kitteoLocationsResult.error.message}`,
      ].filter((error): error is string => Boolean(error));
      if (requiredErrors.length > 0) {
        console.error('Error consultando datos requeridos para disponibilidad/asignaciones:', requiredErrors);
        setAssignedEntriesError(`No se pudieron verificar los bloqueos: ${requiredErrors.join(' | ')}`);
        return;
      }

      const itemRows = (itemsResult.data ?? []) as {
        entry_id: unknown;
        location_code: string | null;
        part_number: string | null;
        po: string | null;
        fifo_number: unknown;
      }[];
      const legacyRows = (locationsResult.data ?? []) as { entry_id: unknown; location_code: string | null }[];
      const fifoRows = (fifoResult.data ?? []) as {
        entry_id: unknown;
        part_number: string | null;
        po: string | null;
        fifo_number: unknown;
      }[];
      const terminalExitRows = terminalExitsResult.data;
      const activeTransferRows = (transferesResult.data ?? []) as { entry_id: unknown; location_code: string | null }[];
      const activeKitteoRows = (kitteoItemsResult.data ?? []) as { entry_id: unknown; location_code: string | null }[];
      const activeKitteoLocationRows = (kitteoLocationsResult.data ?? []) as { entry_id: unknown; location_code: string | null }[];
      const fifoToEntryId = new Map<string, number>();
      const fifoNumbers: Record<number, number> = {};
      fifoRows.forEach(row => {
        const entryId = toEntryId(row.entry_id);
        const fifoNumber = toEntryId(row.fifo_number);
        if (entryId !== null && fifoNumber !== null) fifoNumbers[entryId] = fifoNumber;
        if (entryId !== null && row.part_number && row.fifo_number !== null && row.fifo_number !== undefined) {
          fifoToEntryId.set(getInventoryAssignmentKey(row.part_number, row.po, row.fifo_number), entryId);
        }
      });

      const ids = new Set<number>();
      const locMap: Record<number, string> = {};
      const addAssignment = (entryId: number | null, locationCode: string | null | undefined) => {
        if (entryId === null) return;
        ids.add(entryId);
        const normalizedLocation = locationCode?.trim() ?? '';
        if (normalizedLocation) locMap[entryId] = normalizedLocation;
      };

      itemRows.forEach(row => {
        const directEntryId = toEntryId(row.entry_id);
        const resolvedEntryId = directEntryId ?? fifoToEntryId.get(getInventoryAssignmentKey(row.part_number, row.po, row.fifo_number)) ?? null;
        addAssignment(resolvedEntryId, row.location_code);
      });
      legacyRows.forEach(row => addAssignment(toEntryId(row.entry_id), row.location_code));

      const unavailableIds = new Set<number>();
      const unavailableLabels: Record<number, string> = {};
      const addUnavailable = (entryId: unknown, label: string) => {
        const normalizedId = toEntryId(entryId);
        if (normalizedId === null) return;
        unavailableIds.add(normalizedId);
        unavailableLabels[normalizedId] = label;
      };
      activeTransferRows.forEach(row => addUnavailable(row.entry_id, 'Transferencia KITTEO'));
      activeKitteoRows.forEach(row => addUnavailable(row.entry_id, 'KITTEO'));
      activeKitteoLocationRows.forEach(row => addUnavailable(row.entry_id, 'KITTEO'));
      terminalExitRows.filter(row => !row.returned_at).forEach(row => addUnavailable(row.entry_id, 'Salida definitiva'));

      setAssignedEntryIds(ids);
      setAssignedEntryLocations(locMap);
      setUnavailableEntryIds(unavailableIds);
      setHistoricalExitFingerprints(terminalExitRows);
      setUnavailableEntryLabels(unavailableLabels);
      setFifoNumbersByEntryId(fifoNumbers);
    } catch (error) {
      setAssignedEntriesError(error instanceof Error ? error.message : 'No se pudieron verificar los bloqueos.');
    } finally {
      setAssignmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOperator) {
      fetchRecords();
      fetchAssignedEntries();
    }
  }, [fetchAssignedEntries, fetchRecords, isOperator]);

  // Refrescar asignaciones cuando se cambia a la pestaña de inventario
  const hasLoadedInventoryInitially = React.useRef(false);
  useEffect(() => {
    if (isOperator || visibleMainTab !== 'inventario' || inventorySubTab !== 'registro') return;
    if (!hasLoadedInventoryInitially.current) {
      hasLoadedInventoryInitially.current = true;
      return;
    }
    fetchAssignedEntries();
    fetchRecords();
  }, [isOperator, visibleMainTab, inventorySubTab, fetchAssignedEntries, fetchRecords]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 350);
    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  useEffect(() => {
    if (isOperator || inventorySubTab !== 'historial') return;
    void fetchHistoryPage(historyPage, {
      search: debouncedSearchTerm,
      dateFrom,
      dateTo,
      availableOnly,
    });
    void fetchHistorySummary();
  }, [isOperator, inventorySubTab, historyPage, debouncedSearchTerm, dateFrom, dateTo, availableOnly, fetchHistoryPage, fetchHistorySummary]);

  /* =======================
     FILTER + STATS
  ======================= */
  const normalizeSearchText = (value: string | null | undefined) =>
    (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const getLocalDateKey = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const filterRecords = useCallback(() => {
    if (inventorySubTab === 'historial') {
      setFilteredRecords(historyRecords);
      return;
    }
    const term = normalizeSearchText(searchTerm.trim());
    const inventoryUnavailableIds = new Set([...assignedEntryIds, ...unavailableEntryIds]);
    setFilteredRecords(records.filter((r) => {
      const hasHistoricalExit = historicalExitFingerprints.some(exit => isBlockedByTerminalExit(r, exit));
      const isUnavailable = inventoryUnavailableIds.has(r.id) || hasHistoricalExit;
      if (availableOnly && isUnavailable) return false;

      const recordDate = getLocalDateKey(r.registered_at);
      if (dateFrom && (!recordDate || recordDate < dateFrom)) return false;
      if (dateTo && (!recordDate || recordDate > dateTo)) return false;

      if (!term) return true;
      const searchableFields = [
        r.part_number,
        r.description,
        r.unit_of_measure,
        r.registered_by,
        r.po,
      ];

      return searchableFields.some(field => normalizeSearchText(field).includes(term));
    }));
  }, [inventorySubTab, historyRecords, records, searchTerm, availableOnly, dateFrom, dateTo, assignedEntryIds, unavailableEntryIds, historicalExitFingerprints]);

  const calculateStats = useCallback(() => {
    setStats({
      total: records.length,
      units: records.reduce((s, r) => s + r.total_units, 0),
      boxes: records.reduce((s, r) => s + r.total_boxes, 0),
    });
  }, [records]);

  useEffect(() => {
    filterRecords();
    if (inventorySubTab === 'registro') calculateStats();
  }, [filterRecords, calculateStats, inventorySubTab]);

  const historicalUnavailableIds = new Set(records
      .filter(record => historicalExitFingerprints.some(exit => isBlockedByTerminalExit(record, exit)))
      .map(record => record.id),
  );
  const returnableEntryIds = new Set(records
    .filter(record => historicalExitFingerprints.some(exit => !exit.returned_at && matchesTerminalExit(record, exit)))
    .map(record => record.id));
  const handleReturned = async () => {
    setReturnRecord(null);
    const refreshes: Promise<void>[] = [fetchAssignedEntries()];
    if (inventorySubTab === 'historial') {
      refreshes.push(fetchHistoryPage(historyPage, { search: debouncedSearchTerm, dateFrom, dateTo, availableOnly }));
    }
    await Promise.all(refreshes);
    // Refrescar módulos ya visitados sin crear entradas ni reportes nuevos.
    setInventoryRevision(previous => previous + 1);
  };
  const blockedInventoryIds = assignedEntriesError
    ? new Set(records.map(record => record.id))
    : new Set([...assignedEntryIds, ...unavailableEntryIds, ...historicalUnavailableIds]);
  const blockedInventoryLocations = {
    ...assignedEntryLocations,
    ...Object.fromEntries(
      [...new Set([...unavailableEntryIds, ...historicalUnavailableIds])]
        .map(id => [id, unavailableEntryLabels[id] ?? 'Salida definitiva']),
    ),
  };

  /* =======================
     CREATE / UPDATE
  ======================= */
  const insertEntryWithFifo = async (entry: NewEntry) => {
    const { data: inserted, error: insertError } = await supabase
      .from('entries').insert([entry]).select('*').single();
    if (insertError || !inserted) throw new Error('Error al crear el registro');

    const { data: lastLabel } = await supabase
      .from('fifo_labels').select('fifo_number')
      .eq('part_number', inserted.part_number)
      .order('fifo_number', { ascending: false }).limit(1).maybeSingle();

    const nextFifo = (lastLabel?.fifo_number ?? 0) + 1;

    await supabase.from('fifo_labels').insert([{
      fifo_number: nextFifo,
      entry_id: inserted.id,
      part_number: inserted.part_number,
      description: inserted.description,
      qty: inserted.total_units,
      po: inserted.po,
      registered_at: inserted.registered_at,
    }]);
  };

  const handleCreate = async (data: NewEntry | MultiEntry) => {
    if (editingRecord) {
      const { error } = await supabase.from('entries').update(data as NewEntry).eq('id', editingRecord.id);
      if (error) { alert('Error al actualizar el registro'); return; }
    } else if ('lines' in data) {
      const multi = data as MultiEntry;
      try {
        for (const line of multi.lines) {
          await insertEntryWithFifo({ ...multi.base, total_units: line.total_units, total_boxes: line.total_boxes } as NewEntry);
        }
      } catch (e) { console.error(e); alert('Error al guardar uno o más registros'); return; }
    } else {
      try { await insertEntryWithFifo(data as NewEntry); }
      catch (e) { console.error(e); alert('Error al crear el registro'); return; }
    }
    setShowForm(false);
    setEditingRecord(null);
    await refreshInventoryRecords();
  };

  /* =======================
     EDIT / DELETE
  ======================= */
  const handleEdit = (record: Entry) => { setEditingRecord(record); setShowForm(true); };
  const handleLabel = (record: Entry) => { setLabelRecord(record); };
  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este registro?')) return;
    const { error } = await supabase.from('entries').delete().eq('id', id);
    if (error) { alert('Error al eliminar el registro'); return; }
    await refreshInventoryRecords();
  };

  /* =======================
     SELECCIÓN MÚLTIPLE
  ======================= */
  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = (pageIds: number[]) => {
    const selectablePageIds = pageIds;
    const allSelected = selectablePageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        selectablePageIds.forEach((id) => next.delete(id));
      } else {
        selectablePageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectedRecordCache(new Map());
  };

  const selectedRecords = [...selectedIds]
    .map(id => selectedRecordCache.get(id))
    .filter((record): record is Entry => Boolean(record));

  /* =======================
     EXPORT CSV
  ======================= */
  const handleExportCSV = async () => {
    let exportRecords: Entry[] = filteredRecords;
    if (inventorySubTab === 'historial') {
      setHistoryExporting(true);
      exportRecords = [];
      try {
        const exportPageSize = 1000;
        for (let page = 1; ; page += 1) {
          const result = await fetchInventoryHistoryPage(page, exportPageSize, {
            search: searchTerm,
            dateFrom,
            dateTo,
            availableOnly,
          });
          if (result.error) throw new Error(result.error);
          exportRecords.push(...result.rows);
          if (result.rows.length < exportPageSize) break;
        }
      } catch (error) {
        alert(error instanceof Error ? `No se pudo exportar el historial: ${error.message}` : 'No se pudo exportar el historial.');
        setHistoryExporting(false);
        return;
      }
      setHistoryExporting(false);
    }
    const exportData = exportRecords.map(record => ({
      'Part Number': record.part_number,
      'Descripción': record.description ?? '',
      'PO': record.po ?? '',
      'QTY': record.total_units,
      'Cajas Totales': record.total_boxes,
      'Unidad de Medida': record.unit_of_measure ?? '',
      'Registrado Por': record.registered_by ?? '',
      'Fecha de Registro': new Date(record.registered_at).toLocaleString('es-ES'),
    }));
    const csv = Papa.unparse(exportData);
    saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `inventario_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const closeForm = () => { setShowForm(false); setEditingRecord(null); };

  const changeInventorySubTab = (view: InventorySubTab) => {
    if (view === inventorySubTab) return;
    setInventorySubTab(view);
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setHistoryPage(1);
    setAvailableOnly(false);
    setDateFrom('');
    setDateTo('');
    clearSelection();
  };

  /* =======================
     UI
  ======================= */
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #f0f4ff 0%, #f8fafc 60%, #eef2ff 100%)' }}>
      {/* Header */}
      <header
        style={{ background: 'linear-gradient(90deg, #3730a3 0%, #4f46e5 60%, #6366f1 100%)', boxShadow: '0 4px 24px 0 rgba(79,70,229,0.18)' }}
        className="sticky top-0 z-40"
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center gap-4">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="bg-white/20 backdrop-blur p-2 rounded-xl shadow">
              <Package className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-wide">Sistema de Inventario PXG INTERNO</h1>
              <p className="text-xs text-indigo-200 hidden sm:block">Control de entradas de material</p>
            </div>
          </div>
          <UserManagementDropdown
            currentUserEmail={userProfile?.email ?? ''}
            isAdmin={isAdmin}
            userRol={userRol}
            onSignOut={signOut}
          />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Pestañas principales ── */}
        <div className="flex gap-2 mb-6 bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100 w-fit">
          {canViewDashboardAndReports && (
            <TabBtn
              active={visibleMainTab === 'dashboard'}
              onClick={() => setMainTab('dashboard')}
              icon={<LayoutDashboard className="h-4 w-4" />}
              label="Dashboard"
              color="indigo"
            />
          )}
          {!isOperator && (
            <TabBtn
              active={visibleMainTab === 'inventario'}
              onClick={() => setMainTab('inventario')}
              icon={<ClipboardList className="h-4 w-4" />}
              label="Inventario"
              color="indigo"
            />
          )}
          <TabBtn
            active={visibleMainTab === 'racks'}
            onClick={() => setMainTab('racks')}
            icon={<MapPin className="h-4 w-4" />}
            label="Racks / Locaciones"
            color="emerald"
          />
          <TabBtn
            active={visibleMainTab === 'kitteo'}
            onClick={() => setMainTab('kitteo')}
            icon={<ArrowRightFromLine className="h-4 w-4" />}
            label="Salidas KITTEO"
            color="orange"
          />
          {canViewDashboardAndReports && (
            <TabBtn
              active={visibleMainTab === 'reportes'}
              onClick={() => setMainTab('reportes')}
              icon={<FileText className="h-4 w-4" />}
              label="Reportes"
              color="violet"
            />
          )}
          {isAdmin && (
            <TabBtn
              active={visibleMainTab === 'auditoria'}
              onClick={() => setMainTab('auditoria')}
              icon={<ClipboardCheck className="h-4 w-4" />}
              label="Auditoría Física"
              color="indigo"
            />
          )}
          {isAdmin && (
            <TabBtn
              active={visibleMainTab === 'comparacion'}
              onClick={() => setMainTab('comparacion')}
              icon={<ArrowLeftRight className="h-4 w-4" />}
              label="Comparación"
              color="violet"
            />
          )}
        </div>

        {/* ══════════════════════════════
            PESTAÑA: DASHBOARD
        ══════════════════════════════ */}
        {canViewDashboardAndReports && visitedMainTabs.has('dashboard') && <div hidden={visibleMainTab !== 'dashboard'}><Suspense fallback={<div role="status" className="p-5 text-sm text-gray-500">Cargando dashboard...</div>}><OperationsDashboard key={inventoryRevision} /></Suspense></div>}

        {/* ══════════════════════════════
            PESTAÑA: REPORTES
        ══════════════════════════════ */}
        {canViewDashboardAndReports && visitedMainTabs.has('reportes') && <div hidden={visibleMainTab !== 'reportes'}><Suspense fallback={<div role="status" className="p-5 text-sm text-gray-500">Cargando reportes...</div>}><LocationReports key={inventoryRevision} /></Suspense></div>}

        {isAdmin && visitedMainTabs.has('auditoria') && <div hidden={visibleMainTab !== 'auditoria'}><PhysicalAuditPage /></div>}

        {isAdmin && visitedMainTabs.has('comparacion') && <div hidden={visibleMainTab !== 'comparacion'}><InventoryComparisonPage /></div>}

        {/* ══════════════════════════════
            PESTAÑA: INVENTARIO
        ══════════════════════════════ */}
        {!isOperator && visitedMainTabs.has('inventario') && <div hidden={visibleMainTab !== 'inventario'}>
          <>
            <div className="mb-6 space-y-2">
              <div className="flex w-fit flex-wrap gap-1 rounded-xl border border-gray-100 bg-white p-1 shadow-sm" role="tablist" aria-label="Vistas de inventario">
                <button
                  type="button"
                  role="tab"
                  aria-selected={inventorySubTab === 'registro'}
                  onClick={() => changeInventorySubTab('registro')}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${inventorySubTab === 'registro' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <ClipboardList className="h-4 w-4" />
                  Registro de inventario
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={inventorySubTab === 'historial'}
                  onClick={() => changeInventorySubTab('historial')}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${inventorySubTab === 'historial' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <History className="h-4 w-4" />
                  Historial de entradas
                </button>
              </div>
              <p className="text-xs text-gray-500">
                {inventorySubTab === 'registro'
                  ? `Entradas registradas hoy, ${new Date().toLocaleDateString('es-MX')}. El historial completo se carga al abrir su pestaña.`
                  : 'Historial completo. La búsqueda, las fechas y la paginación se consultan en Supabase.'}
              </p>
            </div>

            {historyError && inventorySubTab === 'historial' && (
              <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                No se pudo consultar el historial: {historyError}
              </div>
            )}

            {assignedEntriesError && (
              <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-800">No se pudieron actualizar todos los bloqueos</p>
                  <p className="mt-1 text-xs text-amber-700">{assignedEntriesError}</p>
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
              <StatCard icon={<ClipboardList className="h-6 w-6" />} label={inventorySubTab === 'registro' ? 'Registros de Hoy' : 'Total Registros'} value={stats.total} color="indigo" />
              <StatCard icon={<Package className="h-6 w-6" />} label={inventorySubTab === 'registro' ? 'Unidades de Hoy' : 'Total Unidades'} value={stats.units} color="blue" />
              <StatCard icon={<LayoutDashboard className="h-6 w-6" />} label={inventorySubTab === 'registro' ? 'Cajas de Hoy' : 'Total Cajas'} value={stats.boxes} color="emerald" />
            </div>

            {/* Actions Bar */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 mb-6 space-y-4">
              <div className="flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
                <div className="relative w-full lg:max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input type="text" placeholder="Buscar por Part Number, descripción, usuario o PO..." value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setHistoryPage(1); }}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all bg-gray-50" />
                </div>
                <div className="flex gap-2.5 flex-wrap justify-start lg:justify-end">
                  <button
                    type="button"
                    onClick={() => { setAvailableOnly(prev => !prev); setHistoryPage(1); }}
                    aria-pressed={availableOnly}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all active:scale-95 border ${
                      availableOnly
                        ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                        : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Disponibles
                  </button>
                  <button type="button" onClick={() => {
                    if (inventorySubTab === 'historial') {
                      void fetchHistoryPage(historyPage, { search: searchTerm, dateFrom, dateTo, availableOnly });
                      void fetchHistorySummary(true);
                    } else {
                      void fetchRecords();
                    }
                    void fetchAssignedEntries();
                  }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 shadow-sm transition-all active:scale-95">
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Actualizar
                  </button>
                  <button type="button" onClick={() => void handleExportCSV()}
                    disabled={inventorySubTab === 'historial' ? historyTotalCount === 0 || historyExporting : !filteredRecords.length}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 shadow-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                    {historyExporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {historyExporting ? 'Exportando…' : 'Descargar CSV'}
                  </button>
                  {inventorySubTab === 'registro' && (
                    <button type="button" onClick={() => setShowForm(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-all active:scale-95"
                      style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', boxShadow: '0 4px 14px 0 rgba(79,70,229,0.35)' }}>
                      <Plus className="h-4 w-4" />
                      Agregar Nuevo
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-end gap-3 pt-3 border-t border-gray-100">
                {inventorySubTab === 'historial' && (
                  <>
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide md:mr-1">
                      <CalendarDays className="h-4 w-4 text-indigo-400" />
                      Fecha de registro
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="text-xs font-semibold text-gray-500">Desde</span>
                      <input
                        type="date"
                        value={dateFrom}
                        max={dateTo || undefined}
                        onChange={(e) => { setDateFrom(e.target.value); setHistoryPage(1); }}
                        aria-label="Fecha inicial de registro"
                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="text-xs font-semibold text-gray-500">Hasta</span>
                      <input
                        type="date"
                        value={dateTo}
                        min={dateFrom || undefined}
                        onChange={(e) => { setDateTo(e.target.value); setHistoryPage(1); }}
                        aria-label="Fecha final de registro"
                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
                      />
                    </label>
                  </>
                )}
                {inventorySubTab === 'registro' && (
                  <button
                    type="button"
                    onClick={() => setShowPartsCatalog(true)}
                    disabled={!isAdmin}
                    title={isAdmin ? undefined : 'Solo usuarios con permisos de administrador pueden agregar números de parte.'}
                    aria-label={isAdmin ? 'Nuevo número de parte' : 'Nuevo número de parte bloqueado: solo admin'}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-wide shadow-sm transition-all md:ml-1 ${isAdmin ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 active:scale-95' : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 opacity-70'}`}
                  >
                    {isAdmin ? <Hash className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
                    Nuevo número de parte
                  </button>
                )}
                {(searchTerm || availableOnly || dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setDebouncedSearchTerm('');
                      setAvailableOnly(false);
                      setDateFrom('');
                      setDateTo('');
                      setHistoryPage(1);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 transition-all md:ml-auto"
                  >
                    <X className="h-3.5 w-3.5" />
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>

            {/* ── Barra de selección múltiple (aparece cuando hay seleccionados) ── */}
            {selectedRecords.length > 0 && (
              <div
                className="mb-4 px-5 py-3 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm"
                style={{ background: 'linear-gradient(90deg, #f5f3ff 0%, #ede9fe 100%)', borderColor: '#c4b5fd' }}
              >
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{selectedRecords.length}</span>
                  </div>
                  <p className="text-sm font-semibold text-violet-800">
                    {selectedRecords.length} registro{selectedRecords.length !== 1 ? 's' : ''} seleccionado{selectedRecords.length !== 1 ? 's' : ''} para reimpresión
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={clearSelection}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-violet-200 bg-white text-violet-700 hover:bg-violet-50 transition-all active:scale-95"
                  >
                    <XCircle className="h-4 w-4" />
                    Limpiar selección
                  </button>
                  <button
                    onClick={() => setShowMultiLabel(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-md transition-all active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', boxShadow: '0 4px 14px 0 rgba(124,58,237,0.35)' }}
                  >
                    <Tags className="h-4 w-4" />
                    Reimprimir {selectedRecords.length} etiqueta{selectedRecords.length !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-indigo-500" />
                  <h2 className="font-semibold text-gray-800 text-sm">{inventorySubTab === 'registro' ? 'Registros de Inventario' : 'Historial de entradas'}</h2>
                </div>
                {(inventorySubTab === 'historial' ? historyTotalCount : filteredRecords.length) > 0 && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
                    {inventorySubTab === 'historial' ? historyTotalCount : filteredRecords.length}{' '}
                    {(inventorySubTab === 'historial' ? historyTotalCount : filteredRecords.length) === 1 ? 'registro' : 'registros'}
                  </span>
                )}
              </div>
              <InventoryTable
                records={filteredRecords}
                loading={loading || (inventorySubTab === 'registro' && assignmentsLoading)}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onLabel={handleLabel}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onToggleSelectAll={handleToggleSelectAll}
                assignedEntryIds={blockedInventoryIds}
                assignedEntryLocations={blockedInventoryLocations}
                fifoNumbersByEntryId={fifoNumbersByEntryId}
                returnableEntryIds={isManager && !assignedEntriesError ? returnableEntryIds : new Set()}
                onReturnToInventory={setReturnRecord}
                rowActionsDisabled={inventorySubTab === 'historial' && assignmentsLoading}
                serverPagination={inventorySubTab === 'historial' ? {
                  page: historyPage,
                  pageSize: HISTORY_PAGE_SIZE,
                  totalRecords: historyTotalCount,
                  onPageChange: setHistoryPage,
                } : undefined}
              />
            </div>
          </>
        </div>}

        {/* ══════════════════════════════
            PESTAÑA: SALIDAS KITTEO
        ══════════════════════════════ */}
        {visitedMainTabs.has('kitteo') && (
          <div hidden={visibleMainTab !== 'kitteo'} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6">
              <KitteoPage key={inventoryRevision} />
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            PESTAÑA: RACKS / LOCACIONES
        ══════════════════════════════ */}
        {visitedMainTabs.has('racks') && (
          <div hidden={visibleMainTab !== 'racks'} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Sub-pestañas */}
            <div className="flex gap-0 border-b border-gray-100">
              {!isOperator && (
                <SubTabBtn
                  active={visibleRackSubTab === 'locaciones'}
                  onClick={() => setRackSubTab('locaciones')}
                  icon={<MapPin className="h-4 w-4" />}
                  label="Racks / Locaciones"
                  color="emerald"
                />
              )}
              <SubTabBtn
                active={visibleRackSubTab === 'salidas'}
                onClick={() => setRackSubTab('salidas')}
                icon={<LogOut className="h-4 w-4" />}
                label="Transferencia Kitteo"
                color="red"
              />
            </div>

            <div className="p-6">
              {visitedRackSubTabs.has('locaciones') && <div hidden={visibleRackSubTab !== 'locaciones'}><RacksPage key={inventoryRevision} onAssignmentsChange={fetchAssignedEntries} /></div>}
              {visitedRackSubTabs.has('salidas') && <div hidden={visibleRackSubTab !== 'salidas'}><ExitsPage key={inventoryRevision} /></div>}
            </div>
          </div>
        )}
      </main>

      {/* Modal Etiqueta FIFO (individual) */}
      {labelRecord && <LabelModal record={labelRecord} onClose={() => setLabelRecord(null)} />}

      {returnRecord && isManager && (
        <ReturnInventoryModal
          entry={returnRecord}
          exits={historicalExitFingerprints.filter(exit => !exit.returned_at && matchesTerminalExit(returnRecord, exit))}
          onClose={() => setReturnRecord(null)}
          onReturned={handleReturned}
        />
      )}

      {/* Modal Etiquetas múltiples */}
      {showMultiLabel && selectedRecords.length > 0 && (
        <MultiLabelModal
          records={selectedRecords}
          onClose={() => setShowMultiLabel(false)}
        />
      )}

      {/* Solo los administradores pueden abrir el modal de alta del catálogo. */}
      {showPartsCatalog && isAdmin && (
        <PartsCatalogModal onClose={() => setShowPartsCatalog(false)} />
      )}

      {/* Modal Nuevo/Editar Registro */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100 animate-in">
            <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl" style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}>
                  {editingRecord ? <RefreshCw className="h-4 w-4 text-white" /> : <Plus className="h-4 w-4 text-white" />}
                </div>
                <h2 className="text-lg font-bold text-gray-900">{editingRecord ? 'Editar Registro' : 'Nuevo Registro'}</h2>
              </div>
              <button onClick={closeForm} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>
            <InventoryForm record={editingRecord} userEmail={userProfile?.nombre_completo || userProfile?.email || ''} onSave={handleCreate} onCancel={closeForm} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Helpers ── */

function TabBtn({ active, onClick, icon, label, color }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; color: string }) {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-600 text-white shadow-sm',
    emerald: 'bg-emerald-600 text-white shadow-sm',
    orange: 'bg-orange-600 text-white shadow-sm',
    violet: 'bg-violet-600 text-white shadow-sm',
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
        active ? colors[color] : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SubTabBtn({ active, onClick, icon, label, color }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'border-emerald-500 text-emerald-700 bg-emerald-50',
    red: 'border-red-500 text-red-700 bg-red-50',
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold transition-all border-b-2 ${
        active ? colors[color] : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const colors: Record<string, { bg: string; iconBg: string; iconColor: string; text: string }> = {
    indigo: { bg: 'bg-indigo-50 border-indigo-100', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', text: 'text-indigo-700' },
    blue:   { bg: 'bg-blue-50 border-blue-100',     iconBg: 'bg-blue-100',   iconColor: 'text-blue-600',   text: 'text-blue-700' },
    emerald:{ bg: 'bg-emerald-50 border-emerald-100',iconBg: 'bg-emerald-100',iconColor: 'text-emerald-600',text: 'text-emerald-700' },
  };
  const c = colors[color];
  return (
    <div className={`${c.bg} border rounded-2xl px-6 py-5 flex items-center gap-4`}>
      <div className={`${c.iconBg} p-3 rounded-xl flex-shrink-0`}>
        <span className={c.iconColor}>{icon}</span>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-black ${c.text}`}>{value.toLocaleString()}</p>
      </div>
    </div>
  );
}
