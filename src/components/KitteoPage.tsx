import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  MapPin, Package, Search, Loader2, X, Save,
  RefreshCw, LogOut, Hash, Boxes, ClipboardList, Calendar,
  User, Archive, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, CheckCircle2, AlertCircle,
  History, ArrowRightFromLine, Trash2, ListChecks, ClipboardCheck,
} from 'lucide-react';

/* ── Tipos ── */
interface KitteoLocationItem {
  id: number;
  source_transfer_id: number | null;
  location_id: number;
  location_code: string;
  part_number: string;
  qty: number;
  boxes: number | null;
  po: string | null;
  fifo_number: number | null;
  entry_id: number | null;
  description: string | null;
  registered_by: string | null;
  assigned_at: string;
}

interface KitteoLocation {
  id: number;
  rack: string;
  location_code: string;
  status: 'disponible' | 'ocupado';
  part_number: string | null;
  qty: number | null;
  boxes: number | null;
  po: string | null;
  entry_id: number | null;
  description: string | null;
  registered_by: string | null;
  assigned_at: string | null;
  items?: KitteoLocationItem[];
}

interface EntryOption {
  id: number;
  entry_id: number | null;
  part_number: string;
  description: string | null;
  qty: number;
  boxes: number;
  po: string | null;
  fifo_number: number | null;
  exited_at: string;
}

interface KitteoExit {
  id: number;
  rack: string;
  location_code: string;
  part_number: string;
  entry_id: number | null;
  description: string | null;
  qty: number;
  boxes: number | null;
  po: string | null;
  registered_by: string | null;
  exited_at: string;
}

interface ExitTarget {
  location: KitteoLocation;
  item: KitteoLocationItem;
}

type KitteoPrecountStatus = 'borrador' | 'finalizado';
type KitteoAdjustmentStatus = 'pendiente' | 'aplicado' | 'sin_diferencia' | 'rechazado';

interface KitteoPrecountRow {
  id?: number;
  location_item_id: number | null;
  part_number: string;
  description: string | null;
  po: string | null;
  fifo_number: number | null;
  system_qty: number;
  system_boxes: number | null;
  counted_qty: number | null;
  counted_boxes: number | null;
}

interface KitteoAdjustmentRecord {
  id: number;
  location_id: number;
  location_code: string;
  rack: string;
  status: KitteoPrecountStatus;
  adjustment_status: KitteoAdjustmentStatus;
  completed_by: string | null;
  completed_at: string | null;
  notes: string | null;
}

interface KitteoPrecountRecord {
  id: number;
  location_id: number;
  location_code: string;
  rack: string;
  status: KitteoPrecountStatus;
  started_by: string | null;
  started_at: string;
  completed_by: string | null;
  completed_at: string | null;
  notes: string | null;
}

type NewKitteoExit = Omit<KitteoExit, 'id'>;

const insertKitteoExits = async (rows: NewKitteoExit[]) => {
  let { error } = await supabase.from('kitteo_exits').insert(rows);
  if (error && /entry_id|column .* does not exist/i.test(error.message)) {
    const legacyRows = rows.map(({ entry_id: _entryId, ...row }) => row);
    ({ error } = await supabase.from('kitteo_exits').insert(legacyRows));
  }
  return error;
};

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeLocationCode = (value: unknown): string => String(value ?? '').trim().toUpperCase();

/* ── Colores por rack ── */
const RACK_COLORS: Record<string, { bg: string; border: string; text: string; badge: string; badgeBg: string }> = {
  '1': { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    badge: 'bg-blue-600',    badgeBg: 'bg-blue-100' },
  '2': { bg: 'bg-indigo-50',  border: 'border-indigo-200',  text: 'text-indigo-700',  badge: 'bg-indigo-600',  badgeBg: 'bg-indigo-100' },
  '3': { bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-700',  badge: 'bg-violet-600',  badgeBg: 'bg-violet-100' },
  '4': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-600', badgeBg: 'bg-emerald-100' },
  '5': { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   badge: 'bg-amber-500',   badgeBg: 'bg-amber-100' },
  '6': { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    badge: 'bg-rose-600',    badgeBg: 'bg-rose-100' },
};

const PAGE_SIZE = 30;
const HIST_PAGE_SIZE = 25;

export function KitteoPage() {
  const { userProfile, userRol } = useAuth();
  const userDisplayName = userProfile?.nombre_completo || userProfile?.email || '';
  const canManageKitteoLocationStatus = userRol === 'admin' || userRol === 'supervisor';

  /* ── Vista activa: locaciones | historial ── */
  const [activeView, setActiveView] = useState<'locaciones' | 'historial'>('locaciones');

  /* ── Estado locaciones ── */
  const [locations, setLocations] = useState<KitteoLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationsLoadError, setLocationsLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [statusSavingLocationId, setStatusSavingLocationId] = useState<number | null>(null);
  const [selectedRack, setSelectedRack] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'disponible' | 'ocupado'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  /* Modal asignar */
  const [assignModal, setAssignModal] = useState<KitteoLocation | null>(null);
  const [entries, setEntries] = useState<EntryOption[]>([]);
  const [entrySearch, setEntrySearch] = useState('');
  const [selectedEntries, setSelectedEntries] = useState<EntryOption[]>([]);
  const [showEntryDrop, setShowEntryDrop] = useState(false);
  const [saving, setSaving] = useState(false);
  const entryDropRef = useRef<HTMLDivElement>(null);
  const entryDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Modal detalle: lista de partes y acciones individuales */
  const [detailModal, setDetailModal] = useState<KitteoLocation | null>(null);
  const [actionSaving, setActionSaving] = useState(false);

  /* Modal preconteo: etapa 1, sin ajustes automáticos */
  const [precountLocation, setPrecountLocation] = useState<KitteoLocation | null>(null);
  const [precountId, setPrecountId] = useState<number | null>(null);
  const [precountStatus, setPrecountStatus] = useState<KitteoPrecountStatus>('borrador');
  const [precountRows, setPrecountRows] = useState<KitteoPrecountRow[]>([]);
  const [precountNotes, setPrecountNotes] = useState('');
  const [precountLoading, setPrecountLoading] = useState(false);
  const [precountSaving, setPrecountSaving] = useState(false);
  const [precountError, setPrecountError] = useState<string | null>(null);

  /* Modal de revisión y ajuste autorizado */
  const [adjustmentLocation, setAdjustmentLocation] = useState<KitteoLocation | null>(null);
  const [adjustmentPrecount, setAdjustmentPrecount] = useState<KitteoAdjustmentRecord | null>(null);
  const [adjustmentRows, setAdjustmentRows] = useState<KitteoPrecountRow[]>([]);
  const [adjustmentLoading, setAdjustmentLoading] = useState(false);
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);

  /* Modal de salida definitiva para un artículo específico */
  const [exitTarget, setExitTarget] = useState<ExitTarget | null>(null);
  const [exitSaving, setExitSaving] = useState(false);
  const [exitSuccess, setExitSuccess] = useState(false);

  /* Modal de salidas masivas */
  const [bulkExitOpen, setBulkExitOpen] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<number[]>([]);
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  /* ── Estado historial ── */
  const [historial, setHistorial] = useState<KitteoExit[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histRefreshing, setHistRefreshing] = useState(false);
  const [histSearch, setHistSearch] = useState('');
  const [histFromDate, setHistFromDate] = useState('');
  const [histToDate, setHistToDate] = useState('');
  const [histPage, setHistPage] = useState(1);

  const racks = ['ALL', '1', '2', '3', '4', '5', '6'];

  /* ── Fetch locaciones y todos sus artículos ── */
  const fetchLocations = useCallback(async () => {
    setRefreshing(true);
    setLocationsLoadError(null);

    const [locationsResponse, itemsResponse] = await Promise.all([
      supabase
        .from('kitteo_locations')
        .select('*')
        .order('rack', { ascending: true })
        .order('location_code', { ascending: true }),
      (async () => {
        const pageSize = 1000;
        let from = 0;
        const allItems: KitteoLocationItem[] = [];
        let itemsError: { message: string } | null = null;

        while (true) {
          const { data, error } = await supabase
            .from('kitteo_location_items')
            .select('*')
            .order('assigned_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1);

          if (error) {
            itemsError = error;
            break;
          }

          const page = (data as KitteoLocationItem[]) ?? [];
          allItems.push(...page);
          if (page.length < pageSize) break;
          from += pageSize;
        }

        return { data: allItems, error: itemsError };
      })(),
    ]);

    const { data: locationsData, error: locationsError } = locationsResponse;
    const { data: itemsData, error: itemsError } = itemsResponse;

    if (locationsError) {
      console.error('Error cargando locaciones KITTEO:', locationsError);
      setLocationsLoadError(`No se pudieron cargar las locaciones: ${locationsError.message}`);
    }
    if (itemsError) {
      console.error('Error cargando artículos KITTEO:', itemsError);
      setLocationsLoadError(`No se pudieron cargar los números de parte: ${itemsError.message}`);
    }

    const normalizedLocations = ((locationsData as KitteoLocation[]) ?? []).map(location => ({
      ...location,
      id: toNumberOrNull(location.id) ?? location.id,
    }));
    const normalizedItems = itemsError
      ? []
      : ((itemsData as KitteoLocationItem[]) ?? []).map(item => ({
          ...item,
          id: toNumberOrNull(item.id) ?? item.id,
          location_id: toNumberOrNull(item.location_id) ?? item.location_id,
          entry_id: toNumberOrNull(item.entry_id),
          qty: toNumberOrNull(item.qty) ?? 0,
          boxes: toNumberOrNull(item.boxes),
          fifo_number: toNumberOrNull(item.fifo_number),
        }));

    // Compatibilidad con asignaciones anteriores a la columna fifo_number.
    // El FIFO original se conserva en fifo_labels usando entry_id.
    const fifoEntryIds = [...new Set([
      ...normalizedItems.map(item => item.entry_id),
      ...((locationsData as KitteoLocation[]) ?? []).map(location => toNumberOrNull(location.entry_id)),
    ].filter((id): id is number => id !== null))];
    const fifoByEntryId = new Map<number, number | null>();
    if (fifoEntryIds.length > 0) {
      const { data: fifoData, error: fifoError } = await supabase
        .from('fifo_labels')
        .select('entry_id, fifo_number')
        .in('entry_id', fifoEntryIds);
      if (fifoError) {
        console.warn('No se pudieron cargar los FIFO de KITTEO:', fifoError);
      } else {
        ((fifoData ?? []) as { entry_id: unknown; fifo_number: unknown }[]).forEach(row => {
          const entryId = toNumberOrNull(row.entry_id);
          if (entryId !== null && !fifoByEntryId.has(entryId)) {
            fifoByEntryId.set(entryId, toNumberOrNull(row.fifo_number));
          }
        });
      }
    }
    const hydratedItems = normalizedItems.map(item => ({
      ...item,
      fifo_number: item.fifo_number ?? (item.entry_id !== null ? (fifoByEntryId.get(item.entry_id) ?? null) : null),
    }));

    const itemsByLocationId = new Map<number, KitteoLocationItem[]>();
    const itemsByLocationCode = new Map<string, KitteoLocationItem[]>();
    hydratedItems.forEach(item => {
      const normalizedLocationId = toNumberOrNull(item.location_id);
      if (normalizedLocationId !== null) {
        const current = itemsByLocationId.get(normalizedLocationId) ?? [];
        current.push(item);
        itemsByLocationId.set(normalizedLocationId, current);
      }

      const normalizedCode = normalizeLocationCode(item.location_code);
      if (normalizedCode) {
        const current = itemsByLocationCode.get(normalizedCode) ?? [];
        current.push(item);
        itemsByLocationCode.set(normalizedCode, current);
      }
    });

    const hydratedLocations = normalizedLocations.map(location => {
      const normalizedLocationId = toNumberOrNull(location.id);
      const normalizedCode = normalizeLocationCode(location.location_code);
      const relatedItems = normalizedLocationId !== null
        ? (itemsByLocationId.get(normalizedLocationId) ?? itemsByLocationCode.get(normalizedCode) ?? [])
        : (itemsByLocationCode.get(normalizedCode) ?? []);

      // Compatibilidad con locaciones ocupadas antes de que existiera la tabla hija.
      // La fila virtual permite consultar y dar salida al artículo mientras se ejecuta
      // la migración de respaldo; las asignaciones nuevas sí se guardan en la tabla hija.
      if (relatedItems.length > 0 || !location.part_number) {
        return { ...location, items: relatedItems };
      }

      return {
        ...location,
        items: [{
          id: -(normalizedLocationId ?? 0),
          source_transfer_id: null,
          location_id: normalizedLocationId ?? 0,
          location_code: location.location_code,
          part_number: location.part_number,
          description: location.description,
          qty: location.qty ?? 0,
          boxes: location.boxes,
          po: location.po,
          fifo_number: toNumberOrNull(location.entry_id) !== null
            ? (fifoByEntryId.get(toNumberOrNull(location.entry_id)!) ?? null)
            : null,
          entry_id: toNumberOrNull(location.entry_id),
          registered_by: location.registered_by,
          assigned_at: location.assigned_at ?? new Date(0).toISOString(),
        }],
      };
    });

    setLocations(hydratedLocations);
    setLoading(false);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const touchKitteoLocation = async (locationId: number, updates: Record<string, unknown> = {}) => {
    const modifier = userDisplayName || 'Usuario autenticado';
    const [{ error: locationError }, { error: itemsError }] = await Promise.all([
      supabase
        .from('kitteo_locations')
        .update({ ...updates, registered_by: modifier })
        .eq('id', locationId),
      supabase
        .from('kitteo_location_items')
        .update({ registered_by: modifier })
        .eq('location_id', locationId),
    ]);
    return locationError ?? itemsError;
  };

  const openPrecountModal = async (location: KitteoLocation) => {
    if (!canManageKitteoLocationStatus) return;
    setPrecountLocation(location);
    setPrecountId(null);
    setPrecountStatus('borrador');
    setPrecountRows([]);
    setPrecountNotes('');
    setPrecountError(null);
    setPrecountLoading(true);

    const { data: draft, error: draftError } = await supabase
      .from('kitteo_precounts')
      .select('id, status, notes')
      .eq('location_id', location.id)
      .eq('status', 'borrador')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (draftError) {
      console.error('Error cargando el borrador de preconteo:', draftError);
      setPrecountError(`No se pudo cargar el preconteo. Ejecuta primero el SQL de preconteos: ${draftError.message}`);
      setPrecountLoading(false);
      return;
    }

    if (draft) {
      const draftId = Number(draft.id);
      const { data: draftItems, error: draftItemsError } = await supabase
        .from('kitteo_precount_items')
        .select('*')
        .eq('precount_id', draftId)
        .order('id', { ascending: true });

      if (draftItemsError) {
        console.error('Error cargando artículos del preconteo:', draftItemsError);
        setPrecountError(`No se pudieron cargar los artículos del borrador: ${draftItemsError.message}`);
      } else {
        setPrecountId(draftId);
        setPrecountStatus('borrador');
        setPrecountNotes(draft.notes ?? '');
        setPrecountRows((draftItems as KitteoPrecountRow[]) ?? []);
      }
    } else {
      setPrecountRows((location.items ?? []).map(item => ({
        location_item_id: item.id > 0 ? item.id : null,
        part_number: item.part_number,
        description: item.description,
        po: item.po,
        fifo_number: item.fifo_number,
        system_qty: item.qty ?? 0,
        system_boxes: item.boxes,
        counted_qty: null,
        counted_boxes: null,
      })));
    }

    setPrecountLoading(false);
  };

  const updatePrecountRow = (rowIndex: number, field: 'counted_qty' | 'counted_boxes', value: string) => {
    const parsedValue = value === '' ? null : Math.max(0, Number(value));
    setPrecountRows(current => current.map((row, index) => index === rowIndex
      ? { ...row, [field]: Number.isFinite(parsedValue) ? parsedValue : null }
      : row
    ));
  };

  const savePrecount = async (finalize: boolean) => {
    if (!canManageKitteoLocationStatus || !precountLocation || precountRows.length === 0 || precountSaving) return;
    if (finalize && precountRows.some(row => row.counted_qty === null)) {
      setPrecountError('Para finalizar debes capturar la cantidad física de todos los números de parte.');
      return;
    }

    setPrecountSaving(true);
    setPrecountError(null);
    const now = new Date().toISOString();
    const modifier = userDisplayName || 'Usuario autenticado';
    const header = {
      location_id: precountLocation.id,
      location_code: precountLocation.location_code,
      rack: precountLocation.rack,
      status: finalize ? 'finalizado' : 'borrador',
      started_by: modifier,
      completed_by: finalize ? modifier : null,
      completed_at: finalize ? now : null,
      notes: precountNotes.trim() || null,
    };

    let currentPrecountId = precountId;
    let headerError: { message: string } | null = null;
    if (currentPrecountId) {
      const { error } = await supabase
        .from('kitteo_precounts')
        .update(header)
        .eq('id', currentPrecountId);
      headerError = error;
      if (!headerError) {
        const { error: deleteError } = await supabase
          .from('kitteo_precount_items')
          .delete()
          .eq('precount_id', currentPrecountId);
        headerError = deleteError;
      }
    } else {
      const { data, error } = await supabase
        .from('kitteo_precounts')
        .insert({ ...header, started_at: now })
        .select('id')
        .single();
      headerError = error;
      currentPrecountId = data ? Number(data.id) : null;
    }

    if (!headerError && currentPrecountId) {
      const itemPayloads = precountRows.map(row => ({
        precount_id: currentPrecountId,
        location_item_id: row.location_item_id,
        part_number: row.part_number,
        description: row.description,
        po: row.po,
        fifo_number: row.fifo_number,
        system_qty: row.system_qty,
        system_boxes: row.system_boxes,
        counted_qty: row.counted_qty,
        counted_boxes: row.counted_boxes,
      }));
      const { error: itemsError } = await supabase.from('kitteo_precount_items').insert(itemPayloads);
      headerError = itemsError;
    }

    if (headerError) {
      console.error('Error guardando preconteo KITTEO:', headerError);
      setPrecountError(`No se pudo guardar el preconteo: ${headerError.message}`);
      setPrecountSaving(false);
      return;
    }

    setPrecountId(currentPrecountId);
    setPrecountStatus(finalize ? 'finalizado' : 'borrador');
    setPrecountSaving(false);
    if (finalize) {
      setPrecountLocation(null);
    }
  };

  const openAdjustmentModal = async (location: KitteoLocation) => {
    if (!canManageKitteoLocationStatus) return;
    setAdjustmentLocation(location);
    setAdjustmentPrecount(null);
    setAdjustmentRows([]);
    setAdjustmentError(null);
    setAdjustmentLoading(true);

    const { data: precount, error: precountError } = await supabase
      .from('kitteo_precounts')
      .select('id, location_id, location_code, rack, status, adjustment_status, completed_by, completed_at, notes')
      .eq('location_id', location.id)
      .eq('status', 'finalizado')
      .eq('adjustment_status', 'pendiente')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (precountError) {
      console.error('Error cargando preconteo pendiente:', precountError);
      setAdjustmentError(`No se pudo cargar la revisión. Ejecuta el SQL de Etapa 2: ${precountError.message}`);
      setAdjustmentLoading(false);
      return;
    }

    if (!precount) {
      setAdjustmentError('No hay un preconteo finalizado pendiente de aprobación para esta locación.');
      setAdjustmentLoading(false);
      return;
    }

    const { data: rows, error: rowsError } = await supabase
      .from('kitteo_precount_items')
      .select('*')
      .eq('precount_id', precount.id)
      .order('id', { ascending: true });

    if (rowsError) {
      console.error('Error cargando detalle del ajuste:', rowsError);
      setAdjustmentError(`No se pudo cargar el detalle del ajuste: ${rowsError.message}`);
    } else {
      setAdjustmentPrecount(precount as KitteoAdjustmentRecord);
      setAdjustmentRows((rows as KitteoPrecountRow[]) ?? []);
    }
    setAdjustmentLoading(false);
  };

  const reviewPrecountAdjustment = async (action: 'aplicar' | 'rechazar') => {
    if (!canManageKitteoLocationStatus || !adjustmentPrecount || adjustmentSaving) return;
    const actionText = action === 'aplicar'
      ? '¿Aplicar las cantidades contadas al inventario de KITTEO? Esta acción quedará registrada y no se puede deshacer desde aquí.'
      : '¿Rechazar este preconteo? No se cambiarán las cantidades de KITTEO.';
    if (!confirm(actionText)) return;

    setAdjustmentSaving(true);
    setAdjustmentError(null);
    const { error } = await supabase.rpc('review_kitteo_precount', {
      p_precount_id: adjustmentPrecount.id,
      p_action: action,
      p_reviewer: userDisplayName || null,
      p_notes: adjustmentPrecount.notes || null,
    });

    if (error) {
      console.error('Error revisando ajuste de preconteo:', error);
      setAdjustmentError(`No se pudo completar la revisión: ${error.message}`);
      setAdjustmentSaving(false);
      return;
    }

    setAdjustmentSaving(false);
    setAdjustmentLocation(null);
    setAdjustmentPrecount(null);
    setAdjustmentRows([]);
    await fetchLocations();
  };

  /* ── Cambio manual de estado: solo admin y supervisor ── */
  const handleLocationStatusChange = async (
    location: KitteoLocation,
    nextStatus: KitteoLocation['status'],
  ) => {
    if (!canManageKitteoLocationStatus || location.status === nextStatus) return;

    setStatusSavingLocationId(location.id);
    const error = await touchKitteoLocation(location.id, { status: nextStatus });

    if (error) {
      console.error('Error cambiando el estado de la locación KITTEO:', error);
      alert(`No se pudo cambiar el estado de ${location.location_code}: ${error.message}`);
    } else {
      setLocations(current => current.map(currentLocation =>
        currentLocation.id === location.id
          ? { ...currentLocation, status: nextStatus }
          : currentLocation
      ));
      setDetailModal(current => current?.id === location.id
        ? { ...current, status: nextStatus }
        : current
      );
    }

    setStatusSavingLocationId(null);
  };

  /* ── Fetch historial ── */
  const fetchHistorial = useCallback(async () => {
    setHistRefreshing(true);
    setHistLoading(true);
    const { data } = await supabase
      .from('kitteo_exits')
      .select('*')
      .order('exited_at', { ascending: false });
    setHistorial((data as KitteoExit[]) ?? []);
    setHistLoading(false);
    setTimeout(() => setHistRefreshing(false), 500);
  }, []);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  useEffect(() => {
    if (activeView === 'historial') fetchHistorial();
  }, [activeView, fetchHistorial]);

  /* ── Cerrar dropdown al click afuera ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (entryDropRef.current && !entryDropRef.current.contains(e.target as Node)) setShowEntryDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── Fetch transferencias para el modal ── */
  const fetchEntries = useCallback(async (term: string) => {
    const selectTransfers = () => {
      let query = supabase
        .from('transferes')
        .select('*')
        .order('exited_at', { ascending: false });
      if (term.trim()) {
        query = query.or(`part_number.ilike.%${term}%,description.ilike.%${term}%`);
      }
      return query.limit(20);
    };

    const { data, error } = await selectTransfers();
    if (error) {
      console.warn('No se pudieron cargar las transferencias KITTEO:', error);
      setEntries([]);
      setShowEntryDrop(true);
      return;
    }

    const transfers = ((data ?? []) as unknown as (Omit<EntryOption, 'fifo_number'> & { fifo_number?: number | null })[]);
    const missingFifoEntryIds = [...new Set(
      transfers
        .filter(transfer => transfer.fifo_number == null && transfer.entry_id !== null)
        .map(transfer => transfer.entry_id as number)
    )];
    const fifoByEntryId = new Map<number, number | null>();
    if (missingFifoEntryIds.length > 0) {
      const { data: fifoData } = await supabase
        .from('fifo_labels')
        .select('entry_id, fifo_number')
        .in('entry_id', missingFifoEntryIds);
      ((fifoData ?? []) as { entry_id: unknown; fifo_number: unknown }[]).forEach(row => {
        const entryId = Number(row.entry_id);
        if (Number.isFinite(entryId) && !fifoByEntryId.has(entryId)) {
          const fifoNumber = Number(row.fifo_number);
          fifoByEntryId.set(entryId, Number.isFinite(fifoNumber) ? fifoNumber : null);
        }
      });
    }
    setEntries(transfers.map(transfer => ({
      ...transfer,
      fifo_number: transfer.fifo_number ?? (transfer.entry_id !== null ? (fifoByEntryId.get(transfer.entry_id) ?? null) : null),
    })));
    setShowEntryDrop(true);
  }, []);

  const handleEntrySearch = (val: string) => {
    setEntrySearch(val);
    if (entryDebounce.current) clearTimeout(entryDebounce.current);
    entryDebounce.current = setTimeout(() => fetchEntries(val), 250);
  };

  const openAssignModal = (location: KitteoLocation) => {
    setDetailModal(null);
    setAssignModal(location);
    resetAssignForm();
    void fetchEntries('');
  };

  const handleSelectEntry = (e: EntryOption) => {
    setSelectedEntries(current => current.some(entry => entry.id === e.id)
      ? current.filter(entry => entry.id !== e.id)
      : [...current, e]);
    setEntrySearch('');
    setShowEntryDrop(true);
  };

  /* ── Asignar material a una locación ── */
  const handleAssign = async () => {
    if (!assignModal || selectedEntries.length === 0) return;
    setSaving(true);

    const assignedAt = new Date().toISOString();
    const itemPayloads = selectedEntries.map(entry => ({
      location_id: assignModal.id,
      location_code: assignModal.location_code,
      source_transfer_id: entry.id,
      part_number: entry.part_number,
      description: entry.description,
      qty: entry.qty,
      boxes: entry.boxes,
      po: entry.po,
      fifo_number: entry.fifo_number ?? null,
      entry_id: entry.entry_id ?? null,
      registered_by: userDisplayName || null,
      assigned_at: assignedAt,
    }));
    let { error: itemError } = await supabase.from('kitteo_location_items').insert(itemPayloads);
    if (itemError && /fifo_number|column .* does not exist/i.test(itemError.message)) {
      const legacyPayloads = itemPayloads.map(({ fifo_number: _fifoNumber, ...item }) => item);
      ({ error: itemError } = await supabase.from('kitteo_location_items').insert(legacyPayloads));
    }

    if (itemError) {
      console.error('Error asignando artículo KITTEO:', itemError);
      alert(`No se pudo asignar el número de parte: ${itemError.message}`);
      setSaving(false);
      return;
    }

    const locationError = await touchKitteoLocation(assignModal.id, { status: 'ocupado' });

    if (locationError) {
      console.error('Error actualizando estado de locación KITTEO:', locationError);
      alert(`El artículo se guardó, pero no se pudo actualizar el estado de la locación: ${locationError.message}`);
    }

    const { error: transferError } = await supabase
      .from('transferes')
      .delete()
      .in('id', selectedEntries.map(entry => entry.id));

    if (transferError) {
      console.error('Error retirando transferencia después de asignar a KITTEO:', transferError);
      alert(`Los artículos se asignaron a KITTEO, pero no se pudieron retirar de Transferencias KITTEO: ${transferError.message}`);
    }

    setSaving(false);
    setAssignModal(null);
    resetAssignForm();
    await fetchLocations();
  };

  const resetAssignForm = () => {
    setSelectedEntries([]);
    setEntrySearch('');
    setEntries([]);
  };

  /* ── Liberar un solo artículo (sin historial) ── */
  const handleReleaseItem = async (loc: KitteoLocation, item: KitteoLocationItem) => {
    if (!confirm(`¿Liberar solamente ${item.part_number} de la locación ${loc.location_code}?`)) return;
    setActionSaving(true);

    const { error: deleteError } = item.id > 0
      ? await supabase
          .from('kitteo_location_items')
          .delete()
          .eq('id', item.id)
          .eq('location_id', loc.id)
      : { error: null };

    if (deleteError) {
      console.error('Error liberando artículo KITTEO:', deleteError);
      alert(`No se pudo liberar el número de parte: ${deleteError.message}`);
      setActionSaving(false);
      return;
    }

    const { count: remainingCount, error: countError } = await supabase
      .from('kitteo_location_items')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', loc.id);

    if (!countError) {
      const locationError = await touchKitteoLocation(loc.id, remainingCount === 0 ? {
        status: 'disponible',
        part_number: null,
        description: null,
        qty: null,
        boxes: null,
        po: null,
        entry_id: null,
        assigned_at: null,
      } : {});
      if (locationError) {
        console.error('Error registrando el usuario que liberó el artículo:', locationError);
      }
    }

    setActionSaving(false);
    setDetailModal(null);
    await fetchLocations();
  };

  /* ══════════════════════════════════════════
     SALIDA DEFINITIVA DE UN SOLO ARTÍCULO
  ══════════════════════════════════════════ */
  const handleExitDefinitivo = async () => {
    if (!exitTarget) return;
    const { location, item } = exitTarget;
    setExitSaving(true);

    const exitError = await insertKitteoExits([{
      rack: location.rack,
      location_code: location.location_code,
      part_number: item.part_number,
      entry_id: item.entry_id,
      description: item.description,
      qty: item.qty,
      boxes: item.boxes,
      po: item.po,
      registered_by: userDisplayName || null,
      exited_at: new Date().toISOString(),
    }]);

    if (exitError) {
      console.error('Error registrando salida KITTEO:', exitError);
      alert(`No se pudo registrar la salida: ${exitError.message}`);
      setExitSaving(false);
      return;
    }

    const { error: deleteError } = item.id > 0
      ? await supabase
          .from('kitteo_location_items')
          .delete()
          .eq('id', item.id)
          .eq('location_id', location.id)
      : { error: null };

    if (deleteError) {
      console.error('Error retirando artículo después de registrar salida:', deleteError);
      alert(`La salida quedó registrada, pero no se pudo retirar el artículo de la locación: ${deleteError.message}`);
      setExitSaving(false);
      return;
    }

    const { count: remainingCount, error: countError } = await supabase
      .from('kitteo_location_items')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', location.id);

    if (!countError) {
      const locationError = await touchKitteoLocation(location.id, remainingCount === 0 ? {
        status: 'disponible',
        part_number: null,
        description: null,
        qty: null,
        boxes: null,
        po: null,
        entry_id: null,
        assigned_at: null,
      } : {});
      if (locationError) {
        console.error('Error registrando el usuario que realizó la salida:', locationError);
      }
    }

    setExitSaving(false);
    setExitSuccess(true);

    setTimeout(() => {
      setExitTarget(null);
      setExitSuccess(false);
      setDetailModal(null);
      fetchLocations();
    }, 1500);
  };

  const bulkItems = locations.flatMap(location =>
    (location.items ?? []).map(item => ({ location, item }))
  );
  const filteredBulkItems = bulkItems.filter(({ location, item }) => {
    const term = bulkSearch.trim().toLowerCase();
    return !term || [item.part_number, item.description ?? '', item.po ?? '', location.location_code, location.rack]
      .join(' ').toLowerCase().includes(term);
  });

  const toggleBulkItem = (itemId: number) => {
    setBulkSelectedIds(current => current.includes(itemId)
      ? current.filter(id => id !== itemId)
      : [...current, itemId]);
  };

  const handleBulkExit = async () => {
    const selectedItems = bulkItems.filter(({ item }) => bulkSelectedIds.includes(item.id));
    if (selectedItems.length === 0) return;
    if (!confirm(`¿Registrar salida definitiva de ${selectedItems.length} número(s) de parte?`)) return;

    setBulkSaving(true);
    const now = new Date().toISOString();
    const insertError = await insertKitteoExits(
      selectedItems.map(({ location, item }) => ({
        rack: location.rack, location_code: location.location_code,
        part_number: item.part_number, entry_id: item.entry_id, description: item.description,
        qty: item.qty, boxes: item.boxes, po: item.po,
        registered_by: userDisplayName || null, exited_at: now,
      }))
    );

    if (insertError) {
      console.error('Error registrando salidas masivas KITTEO:', insertError);
      alert(`No se pudieron registrar las salidas: ${insertError.message}`);
      setBulkSaving(false);
      return;
    }

    const deleteResults = await Promise.all(selectedItems.map(({ location, item }) =>
      item.id > 0
        ? supabase.from('kitteo_location_items').delete().eq('id', item.id).eq('location_id', location.id)
        : Promise.resolve({ error: null })
    ));
    const deleteError = deleteResults.find(result => result.error)?.error;
    if (deleteError) {
      console.error('Error retirando artículos después de salidas masivas:', deleteError);
      alert(`Las salidas quedaron registradas, pero algunos artículos no se pudieron retirar: ${deleteError.message}`);
      setBulkSaving(false);
      await fetchLocations();
      return;
    }

    const affectedLocationIds = [...new Set(selectedItems.map(({ location }) => location.id))];
    await Promise.all(affectedLocationIds.map(async locationId => {
      const { count } = await supabase.from('kitteo_location_items')
        .select('id', { count: 'exact', head: true }).eq('location_id', locationId);
      await touchKitteoLocation(locationId, count === 0 ? {
        status: 'disponible', part_number: null, description: null, qty: null,
        boxes: null, po: null, entry_id: null, assigned_at: null,
      } : {});
    }));

    setBulkSaving(false);
    setBulkExitOpen(false);
    setBulkSelectedIds([]);
    setBulkSearch('');
    await fetchLocations();
  };

  /* ── Filtrar locaciones ── */
  const filtered = locations.filter((loc) => {
    const matchRack = selectedRack === 'ALL' || loc.rack === selectedRack;
    const matchStatus = selectedStatus === 'ALL' || loc.status === selectedStatus;
    const term = searchTerm.toLowerCase();
    const itemSearchText = (loc.items ?? [])
      .flatMap(item => [item.part_number, item.po ?? '', item.description ?? ''])
      .join(' ')
      .toLowerCase();
    const matchSearch = !term ||
      loc.location_code.toLowerCase().includes(term) ||
      (loc.part_number ?? '').toLowerCase().includes(term) ||
      (loc.po ?? '').toLowerCase().includes(term) ||
      (loc.description ?? '').toLowerCase().includes(term) ||
      itemSearchText.includes(term);
    return matchRack && matchStatus && matchSearch;
  });

  /* ── Filtrar historial ── */
  const histDateRangeValid = !histFromDate || !histToDate || histFromDate <= histToDate;
  const histFromTimestamp = histFromDate ? new Date(`${histFromDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const histToTimestamp = histToDate ? new Date(`${histToDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
  const filteredHist = historial.filter(h => {
    const term = histSearch.toLowerCase();
    const exitedTimestamp = new Date(h.exited_at).getTime();
    const matchDate = histDateRangeValid
      && exitedTimestamp >= histFromTimestamp
      && exitedTimestamp <= histToTimestamp;
    const matchText = !term ||
      h.part_number.toLowerCase().includes(term) ||
      h.location_code.toLowerCase().includes(term) ||
      (h.po ?? '').toLowerCase().includes(term) ||
      (h.description ?? '').toLowerCase().includes(term) ||
      h.rack.toLowerCase().includes(term);
    return matchDate && matchText;
  });

  /* ── Paginación locaciones ── */
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const safePage = Math.min(currentPage, Math.max(1, totalPages));
  const pageLocs = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const goTo = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));

  /* ── Paginación historial ── */
  const histTotalPages = Math.ceil(filteredHist.length / HIST_PAGE_SIZE);
  const histSafePage = Math.min(histPage, Math.max(1, histTotalPages));
  const pageHist = filteredHist.slice((histSafePage - 1) * HIST_PAGE_SIZE, histSafePage * HIST_PAGE_SIZE);
  const goToHist = (p: number) => setHistPage(Math.max(1, Math.min(p, histTotalPages)));

  /* ── Stats ── */
  const stats = {
    total: locations.length,
    disponible: locations.filter(l => l.status === 'disponible').length,
    ocupado: locations.filter(l => l.status === 'ocupado').length,
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-12 w-12 text-orange-500 animate-spin" />
        <p className="text-gray-500 mt-4 font-medium">Cargando locaciones KITTEO...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {locationsLoadError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">No se pudieron cargar los números de parte de Kitteo</p>
            <p className="mt-0.5 text-xs">{locationsLoadError}. Verifica las políticas RLS de `kitteo_location_items` y actualiza la pantalla.</p>
          </div>
        </div>
      )}

      {/* Header con tabs */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <LogOut className="h-5 w-5 text-orange-500" />
            Salidas KITTEO
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {stats.total} locaciones · {stats.ocupado} ocupadas · {stats.disponible} disponibles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setBulkExitOpen(true); setBulkSelectedIds([]); setBulkSearch(''); }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-red-600 text-white text-sm font-bold shadow-sm hover:bg-red-700 transition-all">
            <ListChecks className="h-4 w-4" />
            Salidas en masa
          </button>
          <button
            onClick={() => activeView === 'locaciones' ? fetchLocations() : fetchHistorial()}
            className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-orange-600 hover:bg-orange-50 transition-all">
            <RefreshCw className={`h-4 w-4 ${refreshing || histRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs: Locaciones | Historial */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveView('locaciones')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeView === 'locaciones'
              ? 'bg-white text-orange-600 shadow-sm border border-orange-100'
              : 'text-gray-500 hover:text-gray-700'
          }`}>
          <MapPin className="h-4 w-4" />
          Locaciones
        </button>
        <button
          onClick={() => setActiveView('historial')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeView === 'historial'
              ? 'bg-white text-orange-600 shadow-sm border border-orange-100'
              : 'text-gray-500 hover:text-gray-700'
          }`}>
          <History className="h-4 w-4" />
          Historial de Salidas
          {historial.length > 0 && (
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold">
              {historial.length}
            </span>
          )}
        </button>
      </div>

      {/* ══════════════════════════════════════════
          VISTA: LOCACIONES
      ══════════════════════════════════════════ */}
      {activeView === 'locaciones' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Locaciones', value: stats.total,      color: 'text-gray-700',    bg: 'bg-gray-50',    border: 'border-gray-200' },
              { label: 'Disponibles',      value: stats.disponible, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
              { label: 'Ocupadas',         value: stats.ocupado,    color: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-200' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} ${s.border} border rounded-2xl px-5 py-4 flex flex-col gap-1`}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{s.label}</p>
                <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex gap-1 flex-wrap">
              {racks.map(r => {
                const c = r !== 'ALL' ? RACK_COLORS[r] : null;
                const isActive = selectedRack === r;
                const count = r !== 'ALL' ? locations.filter(l => l.rack === r).length : locations.length;
                return (
                  <button key={r} onClick={() => { setSelectedRack(r); setCurrentPage(1); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      isActive
                        ? r === 'ALL' ? 'bg-orange-600 text-white border-orange-600 shadow-sm' : `${c!.badge} text-white border-transparent shadow-sm`
                        : r === 'ALL' ? 'bg-white text-gray-600 border-gray-200 hover:border-orange-300' : `${c!.bg} ${c!.text} ${c!.border} hover:opacity-80`
                    }`}>
                    {r === 'ALL' ? 'Todos' : `Rack ${r}`}
                    <span className={`ml-1.5 text-xs ${isActive ? 'text-white/80' : 'text-gray-400'}`}>({count})</span>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-1 flex-wrap">
              {[
                { value: 'ALL' as const, label: 'Todos', count: locations.length },
                { value: 'disponible' as const, label: 'Disponibles', count: stats.disponible },
                { value: 'ocupado' as const, label: 'Ocupadas', count: stats.ocupado },
              ].map(statusFilter => {
                const isActive = selectedStatus === statusFilter.value;
                return (
                  <button
                    key={statusFilter.value}
                    onClick={() => { setSelectedStatus(statusFilter.value); setCurrentPage(1); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      isActive
                        ? statusFilter.value === 'disponible'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : statusFilter.value === 'ocupado'
                            ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                            : 'bg-gray-700 text-white border-gray-700 shadow-sm'
                        : statusFilter.value === 'disponible'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : statusFilter.value === 'ocupado'
                            ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {statusFilter.label}
                    <span className={`ml-1.5 text-xs ${isActive ? 'text-white/80' : 'text-gray-400'}`}>({statusFilter.count})</span>
                  </button>
                );
              })}
            </div>

            <div className="relative ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input type="text" value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                placeholder="Buscar locación o part number..."
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white w-64" />
            </div>
          </div>

          {/* Tabla de locaciones */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="p-5 bg-orange-50 rounded-3xl mb-4"><MapPin className="h-12 w-12 text-orange-300" /></div>
              <p className="text-gray-600 font-semibold">Sin locaciones encontradas</p>
              <p className="text-gray-400 text-sm mt-1">Intenta cambiar el filtro o el término de búsqueda</p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {[
                          { icon: <MapPin className="h-3.5 w-3.5" />, label: 'Locación' },
                          { icon: <Hash className="h-3.5 w-3.5" />, label: 'Rack' },
                          { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'Estado', center: true },
                          { icon: <Package className="h-3.5 w-3.5" />, label: 'Part Number' },
                          { icon: <Boxes className="h-3.5 w-3.5" />, label: 'QTY', center: true },
                          { icon: <Archive className="h-3.5 w-3.5" />, label: 'Cajas', center: true },
                          { icon: <User className="h-3.5 w-3.5" />, label: 'Registrado Por' },
                          { icon: <Calendar className="h-3.5 w-3.5" />, label: 'Asignado' },
                          { icon: null, label: 'Acciones', center: true },
                        ].map(h => (
                          <th key={h.label} className={`px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider ${h.center ? 'text-center' : 'text-left'}`}>
                            <div className={`flex items-center gap-1.5 ${h.center ? 'justify-center' : ''}`}>
                              {h.icon && <span className="text-orange-400">{h.icon}</span>}{h.label}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageLocs.map((loc, idx) => {
                        const c = RACK_COLORS[loc.rack] ?? RACK_COLORS['1'];
                        const isOcupado = loc.status === 'ocupado';
                        const hasAssignedItems = (loc.items?.length ?? 0) > 0 || Boolean(loc.part_number);
                        const primaryItem = loc.items?.[0];
                        return (
                          <tr key={loc.id} className="border-b border-gray-100 last:border-0 hover:bg-orange-50/30 transition-colors"
                            style={{ background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                            {/* Locación */}
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg ${c.bg} ${c.text} text-sm font-bold border ${c.border}`}>
                                <MapPin className="h-3 w-3" />{loc.location_code}
                              </span>
                            </td>
                            {/* Rack */}
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-white text-xs font-bold ${c.badge}`}>
                                {loc.rack}
                              </span>
                            </td>
                            {/* Estado */}
                            <td className="px-4 py-3 text-center">
                              {canManageKitteoLocationStatus ? (
                                <label className="inline-flex items-center gap-1.5">
                                  <select
                                    value={loc.status}
                                    onChange={event => void handleLocationStatusChange(loc, event.target.value as KitteoLocation['status'])}
                                    disabled={statusSavingLocationId === loc.id}
                                    aria-label={`Cambiar estado de ${loc.location_code}`}
                                    className={`rounded-full border px-2.5 py-1 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:cursor-wait disabled:opacity-60 ${
                                      isOcupado
                                        ? 'border-orange-200 bg-orange-100 text-orange-700'
                                        : 'border-emerald-200 bg-emerald-100 text-emerald-700'
                                    }`}
                                  >
                                    <option value="disponible">Disponible</option>
                                    <option value="ocupado">Ocupada</option>
                                  </select>
                                  {statusSavingLocationId === loc.id && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
                                </label>
                              ) : isOcupado ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-bold border border-orange-200">
                                  <AlertCircle className="h-3 w-3" />Ocupada
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200">
                                  <CheckCircle2 className="h-3 w-3" />Disponible
                                </span>
                              )}
                            </td>
                            {/* Partes asignados */}
                            <td className="px-4 py-3">
                              {loc.items && loc.items.length > 0 ? (
                                <div>
                                  <span className="inline-flex max-w-[190px] truncate px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-mono text-xs font-semibold border border-indigo-100">
                                    {loc.items[0].part_number}
                                  </span>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {loc.items.length === 1 ? '1 número de parte' : `${loc.items.length} números de parte`}
                                  </p>
                                </div>
                              ) : loc.part_number ? (
                                <span className="inline-flex max-w-[190px] truncate px-2.5 py-1 rounded-lg bg-gray-50 text-gray-500 font-mono text-xs font-semibold border border-gray-200">
                                  {loc.part_number}
                                </span>
                              ) : <span className="text-gray-400 italic text-sm">—</span>}
                            </td>
                            {/* QTY */}
                            <td className="px-4 py-3 text-center">
                              {(loc.items?.length ?? 0) > 0 || loc.qty != null ? (
                                <span className="inline-flex items-center justify-center min-w-[48px] px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-bold text-sm border border-blue-100">
                                  {(loc.items && loc.items.length > 0
                                    ? loc.items.reduce((sum, item) => sum + (item.qty ?? 0), 0)
                                    : (loc.qty ?? 0)).toLocaleString()}
                                </span>
                              ) : <span className="text-gray-400 italic text-sm">—</span>}
                            </td>
                            {/* Cajas */}
                            <td className="px-4 py-3 text-center">
                              {((loc.items && loc.items.length > 0
                                ? loc.items.reduce((sum, item) => sum + (item.boxes ?? 0), 0)
                                : (loc.boxes ?? 0)) > 0) ? (
                                <span className="inline-flex items-center justify-center min-w-[44px] px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-bold text-sm border border-purple-100">
                                  {loc.items && loc.items.length > 0
                                    ? loc.items.reduce((sum, item) => sum + (item.boxes ?? 0), 0)
                                    : loc.boxes}
                                </span>
                              ) : <span className="text-gray-400 italic text-sm">—</span>}
                            </td>
                            {/* Registrado Por */}
                            <td className="px-4 py-3">
                              {(loc.registered_by ?? primaryItem?.registered_by) ? (
                                <div className="flex items-center gap-1.5">
                                  <div className="h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                                    <span className="text-orange-600 text-xs font-bold uppercase">{(loc.registered_by ?? primaryItem?.registered_by)?.[0]}</span>
                                  </div>
                                  <span className="text-xs text-gray-600 truncate max-w-[100px]">{loc.registered_by ?? primaryItem?.registered_by}</span>
                                </div>
                              ) : <span className="text-gray-400 italic text-sm">—</span>}
                            </td>
                            {/* Asignado */}
                            <td className="px-4 py-3">
                              {(primaryItem?.assigned_at ?? loc.assigned_at) ? (
                                <div className="flex flex-col">
                                  <span className="text-xs text-gray-700 font-medium">
                                    {new Date(primaryItem?.assigned_at ?? loc.assigned_at ?? '').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    {new Date(primaryItem?.assigned_at ?? loc.assigned_at ?? '').toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              ) : <span className="text-gray-400 italic text-sm">—</span>}
                            </td>
                            {/* ── ACCIONES ── */}
                            <td className="px-4 py-3">
                              {isOcupado || hasAssignedItems ? (
                                <div className="flex flex-wrap items-center justify-center gap-1.5">
                                  <button onClick={() => setDetailModal(loc)}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 transition-all whitespace-nowrap">
                                    <ClipboardList className="h-3 w-3" />Ver partes
                                  </button>
                                  {canManageKitteoLocationStatus && (
                                    <>
                                      <button onClick={() => void openPrecountModal(loc)}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all whitespace-nowrap">
                                        <ClipboardCheck className="h-3 w-3" />Preconteo
                                      </button>
                                      <button onClick={() => void openAdjustmentModal(loc)}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-all whitespace-nowrap">
                                        <CheckCircle2 className="h-3 w-3" />Revisar ajuste
                                      </button>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <button onClick={() => openAssignModal(loc)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all">
                                  <Package className="h-3 w-3" />Asignar
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Paginación locaciones */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-2">
                  <p className="text-sm text-gray-500">
                    Mostrando <strong>{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)}</strong> de <strong>{filtered.length}</strong>
                  </p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => goTo(1)} disabled={safePage === 1} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-all"><ChevronsLeft className="h-4 w-4" /></button>
                    <button onClick={() => goTo(safePage - 1)} disabled={safePage === 1} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-all"><ChevronLeft className="h-4 w-4" /></button>
                    <span className="px-3 py-1.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg">{safePage} / {totalPages}</span>
                    <button onClick={() => goTo(safePage + 1)} disabled={safePage === totalPages} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-all"><ChevronRight className="h-4 w-4" /></button>
                    <button onClick={() => goTo(totalPages)} disabled={safePage === totalPages} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-all"><ChevronsRight className="h-4 w-4" /></button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════
          VISTA: HISTORIAL DE SALIDAS
      ══════════════════════════════════════════ */}
      {activeView === 'historial' && (
        <>
          {/* Stats historial */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Salidas</p>
              <p className="text-3xl font-black text-red-600">{filteredHist.length}</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">QTY Total</p>
              <p className="text-3xl font-black text-blue-700">{filteredHist.reduce((s, h) => s + (h.qty ?? 0), 0).toLocaleString()}</p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-2xl px-5 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cajas Total</p>
              <p className="text-3xl font-black text-purple-700">{filteredHist.reduce((s, h) => s + (h.boxes ?? 0), 0).toLocaleString()}</p>
            </div>
          </div>

          {/* Buscador y rango de fechas del historial */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input type="text" value={histSearch} onChange={e => { setHistSearch(e.target.value); setHistPage(1); }}
                placeholder="Buscar part number o locación..."
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white w-full" />
            </div>
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
              Fecha inicial
              <input
                type="date"
                value={histFromDate}
                max={histToDate || undefined}
                onChange={event => { setHistFromDate(event.target.value); setHistPage(1); }}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
              Fecha final
              <input
                type="date"
                value={histToDate}
                min={histFromDate || undefined}
                onChange={event => { setHistToDate(event.target.value); setHistPage(1); }}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </label>
            {(histFromDate || histToDate) && (
              <button
                type="button"
                onClick={() => { setHistFromDate(''); setHistToDate(''); setHistPage(1); }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                <X className="h-3.5 w-3.5" />Limpiar fechas
              </button>
            )}
          </div>
          {!histDateRangeValid && (
            <p className="text-xs font-semibold text-red-600">La fecha inicial no puede ser posterior a la fecha final.</p>
          )}

          {/* Tabla historial */}
          {histLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-10 w-10 text-red-400 animate-spin" /></div>
          ) : filteredHist.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="p-5 bg-red-50 rounded-3xl mb-4"><History className="h-12 w-12 text-red-300" /></div>
              <p className="text-gray-600 font-semibold">{historial.length > 0 ? 'No hay salidas con estos filtros' : 'Sin salidas definitivas registradas'}</p>
              <p className="text-gray-400 text-sm mt-1">{historial.length > 0 ? 'Prueba con otro rango de fechas o término de búsqueda' : 'Las salidas definitivas aparecerán aquí'}</p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {[
                          { icon: <Hash className="h-3.5 w-3.5" />, label: 'Part Number' },
                          { icon: <MapPin className="h-3.5 w-3.5" />, label: 'Locación' },
                          { icon: <Hash className="h-3.5 w-3.5" />, label: 'Rack', center: true },
                          { icon: <Boxes className="h-3.5 w-3.5" />, label: 'QTY', center: true },
                          { icon: <Archive className="h-3.5 w-3.5" />, label: 'Cajas', center: true },
                          { icon: <User className="h-3.5 w-3.5" />, label: 'Registrado Por' },
                          { icon: <Calendar className="h-3.5 w-3.5" />, label: 'Fecha Salida' },
                        ].map(h => (
                          <th key={h.label} className={`px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider ${h.center ? 'text-center' : 'text-left'}`}>
                            <div className={`flex items-center gap-1.5 ${h.center ? 'justify-center' : ''}`}>
                              <span className="text-red-400">{h.icon}</span>{h.label}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageHist.map((h, idx) => {
                        const c = RACK_COLORS[h.rack] ?? RACK_COLORS['1'];
                        return (
                          <tr key={h.id} className="border-b border-gray-100 last:border-0 hover:bg-red-50/20 transition-colors"
                            style={{ background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                            {/* Part Number */}
                            <td className="px-4 py-3">
                              <span className="inline-flex px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-mono text-xs font-semibold border border-indigo-100">
                                {h.part_number}
                              </span>
                              {h.description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[150px]">{h.description}</p>}
                            </td>
                            {/* Locación */}
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg ${c.bg} ${c.text} text-xs font-bold border ${c.border}`}>
                                <MapPin className="h-3 w-3" />{h.location_code}
                              </span>
                            </td>
                            {/* Rack */}
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-white text-xs font-bold ${c.badge}`}>
                                {h.rack}
                              </span>
                            </td>
                            {/* QTY */}
                            <td className="px-4 py-3 text-center">
                              <span className="inline-flex items-center justify-center min-w-[48px] px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-bold text-sm border border-blue-100">
                                {(h.qty ?? 0).toLocaleString()}
                              </span>
                            </td>
                            {/* Cajas */}
                            <td className="px-4 py-3 text-center">
                              {(h.boxes ?? 0) > 0 ? (
                                <span className="inline-flex items-center justify-center min-w-[44px] px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-bold text-sm border border-purple-100">
                                  {h.boxes}
                                </span>
                              ) : <span className="text-gray-400 italic text-sm">—</span>}
                            </td>
                            {/* Registrado Por */}
                            <td className="px-4 py-3">
                              {h.registered_by ? (
                                <div className="flex items-center gap-1.5">
                                  <div className="h-6 w-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                                    <span className="text-red-600 text-xs font-bold uppercase">{h.registered_by[0]}</span>
                                  </div>
                                  <span className="text-xs text-gray-600 truncate max-w-[100px]">{h.registered_by}</span>
                                </div>
                              ) : <span className="text-gray-400 italic text-sm">—</span>}
                            </td>
                            {/* Fecha */}
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className="text-xs text-gray-700 font-medium">
                                  {new Date(h.exited_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {new Date(h.exited_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* Totales */}
                    {pageHist.length > 0 && (
                      <tfoot>
                        <tr className="bg-gray-50 border-t-2 border-gray-200">
                          <td colSpan={3} className="px-4 py-3">
                            <span className="text-xs font-bold text-gray-500 uppercase">Subtotal página</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-black text-sm border border-blue-200">
                              {pageHist.reduce((s, h) => s + (h.qty ?? 0), 0).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-purple-100 text-purple-800 font-black text-sm border border-purple-200">
                              {pageHist.reduce((s, h) => s + (h.boxes ?? 0), 0).toLocaleString()}
                            </span>
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* Paginación historial */}
              {histTotalPages > 1 && (
                <div className="flex items-center justify-between px-2">
                  <p className="text-sm text-gray-500">
                    Mostrando <strong>{(histSafePage - 1) * HIST_PAGE_SIZE + 1}–{Math.min(histSafePage * HIST_PAGE_SIZE, filteredHist.length)}</strong> de <strong>{filteredHist.length}</strong>
                  </p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => goToHist(1)} disabled={histSafePage === 1} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-all"><ChevronsLeft className="h-4 w-4" /></button>
                    <button onClick={() => goToHist(histSafePage - 1)} disabled={histSafePage === 1} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-all"><ChevronLeft className="h-4 w-4" /></button>
                    <span className="px-3 py-1.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg">{histSafePage} / {histTotalPages}</span>
                    <button onClick={() => goToHist(histSafePage + 1)} disabled={histSafePage === histTotalPages} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-all"><ChevronRight className="h-4 w-4" /></button>
                    <button onClick={() => goToHist(histTotalPages)} disabled={histSafePage === histTotalPages} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-all"><ChevronsRight className="h-4 w-4" /></button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════
          MODAL: REVISIÓN Y AJUSTE AUTORIZADO — ETAPA 2
      ══════════════════════════════════════════ */}
      {adjustmentLocation && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-100">
                  <CheckCircle2 className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Revisión y ajuste autorizado</h2>
                  <p className="text-xs text-gray-400">
                    Locación: <span className="font-bold text-purple-600">{adjustmentLocation.location_code}</span>
                    {' · '}Rack <span className="font-bold">{adjustmentLocation.rack}</span>
                  </p>
                </div>
              </div>
              <button onClick={() => setAdjustmentLocation(null)} disabled={adjustmentSaving}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all disabled:opacity-40"
                aria-label="Cerrar revisión de ajuste">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[calc(92vh-76px)]">
              <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
                <p className="text-sm font-bold text-purple-800">Aprobación requerida</p>
                <p className="mt-0.5 text-xs text-purple-700">
                  El botón Aplicar ajuste actualizará QTY y cajas de la tabla de artículos. Esta operación queda registrada con tu usuario.
                </p>
              </div>

              {adjustmentError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {adjustmentError}
                </div>
              )}

              {adjustmentLoading ? (
                <div className="flex justify-center py-14"><Loader2 className="h-9 w-9 animate-spin text-purple-500" /></div>
              ) : adjustmentRows.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center">
                  <p className="text-sm font-semibold text-amber-800">No hay un preconteo pendiente para esta locación.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {adjustmentRows.map((row, rowIndex) => {
                      const qtyDifference = (row.counted_qty ?? 0) - row.system_qty;
                      const boxesDifference = row.counted_boxes === null
                        ? null
                        : row.counted_boxes - (row.system_boxes ?? 0);
                      const hasDifference = qtyDifference !== 0 || (boxesDifference !== null && boxesDifference !== 0);
                      return (
                        <div key={`${row.location_item_id ?? row.part_number}-${rowIndex}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="inline-flex max-w-full truncate rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 font-mono text-xs font-bold text-indigo-700">
                                {row.part_number}
                              </span>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <span className="text-[11px] font-semibold text-orange-700">FIFO: {row.fifo_number !== null ? `#${row.fifo_number}` : '—'}</span>
                                <span className="text-[11px] font-semibold text-amber-700">PO: {row.po || '—'}</span>
                              </div>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${hasDifference ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {hasDifference ? 'Con diferencia' : 'Sin diferencia'}
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                              <p className="text-[10px] font-bold uppercase text-gray-500">QTY sistema</p>
                              <p className="text-lg font-black text-blue-700">{row.system_qty.toLocaleString()}</p>
                            </div>
                            <div className="rounded-lg border border-purple-100 bg-purple-50 px-3 py-2">
                              <p className="text-[10px] font-bold uppercase text-gray-500">QTY contado</p>
                              <p className="text-lg font-black text-purple-700">{(row.counted_qty ?? 0).toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
                            <span className="font-semibold text-gray-500">Diferencia QTY</span>
                            <span className={`font-black ${qtyDifference === 0 ? 'text-emerald-700' : 'text-red-700'}`}>{qtyDifference > 0 ? '+' : ''}{qtyDifference.toLocaleString()}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
                            <span className="font-semibold text-gray-500">Cajas sistema / contadas</span>
                            <span className="font-black text-gray-700">{row.system_boxes ?? '—'} / {row.counted_boxes ?? '—'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase text-gray-500">QTY sistema</p>
                      <p className="text-xl font-black text-blue-700">{adjustmentRows.reduce((sum, row) => sum + row.system_qty, 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase text-gray-500">QTY contado</p>
                      <p className="text-xl font-black text-purple-700">{adjustmentRows.reduce((sum, row) => sum + (row.counted_qty ?? 0), 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase text-gray-500">Diferencia total</p>
                      <p className="text-xl font-black text-red-700">{(() => { const difference = adjustmentRows.reduce((sum, row) => sum + ((row.counted_qty ?? 0) - row.system_qty), 0); return `${difference > 0 ? '+' : ''}${difference.toLocaleString()}`; })()}</p>
                    </div>
                  </div>
                </>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button onClick={() => setAdjustmentLocation(null)} disabled={adjustmentSaving}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cerrar</button>
                {!adjustmentLoading && adjustmentRows.length > 0 && adjustmentPrecount && (
                  <>
                    <button onClick={() => void reviewPrecountAdjustment('rechazar')} disabled={adjustmentSaving}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-50">
                      {adjustmentSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      Rechazar
                    </button>
                    <button onClick={() => void reviewPrecountAdjustment('aplicar')} disabled={adjustmentSaving}
                      className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50">
                      {adjustmentSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Aplicar ajuste
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MODAL: PRECONTEO DE MATERIAL — ETAPA 1
      ══════════════════════════════════════════ */}
      {precountLocation && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-100">
                  <ClipboardCheck className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Preconteo de material</h2>
                  <p className="text-xs text-gray-400">
                    Locación: <span className="font-bold text-blue-600">{precountLocation.location_code}</span>
                    {' · '}Rack <span className="font-bold">{precountLocation.rack}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPrecountLocation(null)}
                disabled={precountSaving}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all disabled:opacity-40"
                aria-label="Cerrar preconteo"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[calc(92vh-76px)]">
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-blue-800">Verificación física — {precountStatus === 'borrador' ? 'Borrador' : 'Finalizado'}</p>
                  <p className="mt-0.5 text-xs text-blue-700">Captura lo encontrado físicamente y compara contra el sistema.</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-200">
                  <AlertCircle className="h-3.5 w-3.5" />No modifica inventario
                </span>
              </div>

              {precountError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {precountError}
                </div>
              )}

              {precountLoading ? (
                <div className="flex justify-center py-14"><Loader2 className="h-9 w-9 animate-spin text-blue-500" /></div>
              ) : precountRows.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center">
                  <p className="text-sm font-semibold text-amber-800">No hay artículos para contar en esta locación.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {precountRows.map((row, rowIndex) => {
                      const difference = row.counted_qty === null ? null : row.counted_qty - row.system_qty;
                      const differenceClass = difference === null
                        ? 'bg-gray-50 border-gray-200 text-gray-500'
                        : difference === 0
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-red-50 border-red-200 text-red-700';
                      return (
                        <div key={`${row.location_item_id ?? row.part_number}-${rowIndex}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="inline-flex max-w-full truncate rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 font-mono text-xs font-bold text-indigo-700">
                                {row.part_number}
                              </span>
                              {row.description && <p className="mt-1 truncate text-xs text-gray-500">{row.description}</p>}
                            </div>
                            <span className="text-[10px] font-bold uppercase text-gray-400">Artículo {rowIndex + 1}</span>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <span className="rounded-lg border border-orange-100 bg-orange-50 px-2 py-1 text-[11px] font-bold text-orange-700">FIFO: {row.fifo_number !== null ? `#${row.fifo_number}` : '—'}</span>
                            <span className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">PO: {row.po || '—'}</span>
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-2">
                              <p className="text-[10px] font-bold uppercase text-gray-500">Sistema</p>
                              <p className="mt-0.5 text-lg font-black text-blue-700">{row.system_qty.toLocaleString()}</p>
                            </div>
                            <label className="rounded-lg border border-purple-100 bg-purple-50 px-2 py-2">
                              <span className="block text-[10px] font-bold uppercase text-gray-500">Físico</span>
                              <input
                                type="number"
                                min="0"
                                value={row.counted_qty ?? ''}
                                onChange={event => updatePrecountRow(rowIndex, 'counted_qty', event.target.value)}
                                placeholder="—"
                                className="mt-0.5 w-full rounded-md border border-purple-200 bg-white px-1 py-0.5 text-center text-lg font-black text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-400"
                              />
                            </label>
                            <div className={`rounded-lg border px-2 py-2 ${differenceClass}`}>
                              <p className="text-[10px] font-bold uppercase">Diferencia</p>
                              <p className="mt-0.5 text-lg font-black">{difference === null ? '—' : `${difference > 0 ? '+' : ''}${difference.toLocaleString()}`}</p>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                              <p className="text-[10px] font-bold uppercase text-gray-500">Cajas sistema</p>
                              <p className="text-sm font-bold text-gray-700">{row.system_boxes ?? '—'}</p>
                            </div>
                            <label className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                              <span className="block text-[10px] font-bold uppercase text-gray-500">Cajas físicas</span>
                              <input
                                type="number"
                                min="0"
                                value={row.counted_boxes ?? ''}
                                onChange={event => updatePrecountRow(rowIndex, 'counted_boxes', event.target.value)}
                                placeholder="Opcional"
                                className="mt-0.5 w-full border-0 p-0 text-sm font-bold text-gray-700 focus:outline-none focus:ring-0"
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase text-gray-500">QTY sistema</p>
                      <p className="text-xl font-black text-blue-700">{precountRows.reduce((sum, row) => sum + row.system_qty, 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase text-gray-500">QTY físico</p>
                      <p className="text-xl font-black text-purple-700">{precountRows.reduce((sum, row) => sum + (row.counted_qty ?? 0), 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase text-gray-500">Diferencia total</p>
                      <p className={`text-xl font-black ${precountRows.every(row => row.counted_qty !== null) ? (precountRows.reduce((sum, row) => sum + ((row.counted_qty ?? 0) - row.system_qty), 0) === 0 ? 'text-emerald-700' : 'text-red-700') : 'text-gray-500'}`}>
                        {precountRows.every(row => row.counted_qty !== null)
                          ? `${precountRows.reduce((sum, row) => sum + ((row.counted_qty ?? 0) - row.system_qty), 0) > 0 ? '+' : ''}${precountRows.reduce((sum, row) => sum + ((row.counted_qty ?? 0) - row.system_qty), 0).toLocaleString()}`
                          : '—'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Observaciones</label>
                    <textarea
                      value={precountNotes}
                      onChange={event => setPrecountNotes(event.target.value)}
                      rows={2}
                      placeholder="Opcional: daños, material pendiente o comentarios del conteo..."
                      className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                </>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button onClick={() => setPrecountLocation(null)} disabled={precountSaving}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  Cerrar
                </button>
                {!precountLoading && precountRows.length > 0 && (
                  <>
                    <button onClick={() => void savePrecount(false)} disabled={precountSaving}
                      className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                      {precountSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Guardar borrador
                    </button>
                    <button onClick={() => void savePrecount(true)} disabled={precountSaving}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                      {precountSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                      Finalizar preconteo
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MODAL: SALIDA DEFINITIVA DE UN PARTE
      ══════════════════════════════════════════ */}
      {exitTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-red-100">
                  <ArrowRightFromLine className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Salida de un número de parte</h2>
                  <p className="text-xs text-gray-400">
                    Locación: <span className="font-bold text-red-600">{exitTarget.location.location_code}</span>
                    {' · '}Rack <span className="font-bold">{exitTarget.location.rack}</span>
                  </p>
                </div>
              </div>
              {!exitSuccess && (
                <button onClick={() => setExitTarget(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            <div className="px-6 py-5 space-y-4">
              {exitSuccess ? (
                <div className="flex flex-col items-center justify-center py-6 gap-3">
                  <div className="p-4 bg-emerald-100 rounded-full">
                    <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                  </div>
                  <p className="text-lg font-bold text-emerald-700">¡Salida registrada!</p>
                  <p className="text-sm text-gray-500 text-center">
                    <strong>{exitTarget.item.part_number}</strong> salió de la locación{' '}
                    <strong className="text-red-600">{exitTarget.location.location_code}</strong>.<br />
                    {exitTarget.location.items && exitTarget.location.items.length > 1 ? (
                      <>La locación conserva otros artículos asignados.</>
                    ) : (
                      <>La locación quedó <strong className="text-emerald-600">disponible</strong>.</>
                    )}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-red-700">Esta acción es definitiva</p>
                      <p className="text-xs text-red-500 mt-0.5">Solo saldrá el número de parte seleccionado. Se guardará en el historial de salidas.</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Material seleccionado</p>
                    <div>
                      <span className="inline-flex px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-mono text-sm font-bold border border-indigo-100">
                        {exitTarget.item.part_number}
                      </span>
                      {exitTarget.item.description && (
                        <p className="text-xs text-gray-500 mt-1">{exitTarget.item.description}</p>
                      )}
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-center">
                        <p className="text-[10px] text-gray-500 font-semibold uppercase">QTY</p>
                        <p className="text-base font-black text-blue-700">{(exitTarget.item.qty ?? 0).toLocaleString()}</p>
                      </div>
                      {(exitTarget.item.boxes ?? 0) > 0 && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5 text-center">
                          <p className="text-[10px] text-gray-500 font-semibold uppercase">Cajas</p>
                          <p className="text-base font-black text-purple-700">{exitTarget.item.boxes}</p>
                        </div>
                      )}
                      {exitTarget.item.po && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-center">
                          <p className="text-[10px] text-gray-500 font-semibold uppercase">PO</p>
                          <p className="text-sm font-bold text-amber-700">{exitTarget.item.po}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button onClick={() => setExitTarget(null)}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all">
                      <X className="h-4 w-4 inline mr-1" />Cancelar
                    </button>
                    <button onClick={handleExitDefinitivo} disabled={exitSaving}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)' }}>
                      {exitSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightFromLine className="h-4 w-4" />}
                      Confirmar Salida
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Asignar Material ── */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-orange-100">
                  <Package className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Asignar Material</h2>
                  <p className="text-xs text-gray-400">
                    Locación: <span className="font-bold text-orange-600">{assignModal.location_code}</span>
                    {' · '}Rack <span className="font-bold">{assignModal.rack}</span>
                  </p>
                </div>
              </div>
              <button onClick={() => { setAssignModal(null); resetAssignForm(); }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div ref={entryDropRef} className="relative">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                  <Package className="h-3.5 w-3.5 inline mr-1 text-indigo-400" />Buscar en Transferencias (puedes elegir varias) <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input type="text" value={entrySearch} onChange={e => handleEntrySearch(e.target.value)}
                    onFocus={() => { if (entries.length > 0) setShowEntryDrop(true); else fetchEntries(entrySearch); }}
                    placeholder="Buscar por part number o descripción..."
                    className={`w-full pl-9 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50 ${selectedEntries.length > 0 ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`} />
                </div>
                {showEntryDrop && entries.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                    {entries.map(e => (
                      <button key={e.id} type="button"
                        onMouseDown={(ev) => { ev.preventDefault(); handleSelectEntry(e); }}
                        className={`w-full text-left px-4 py-2.5 transition-colors border-b border-gray-50 last:border-0 ${selectedEntries.some(entry => entry.id === e.id) ? 'bg-orange-50 ring-1 ring-inset ring-orange-200' : 'hover:bg-orange-50'}`}>
                        <div className="flex items-start gap-2">
                          <span className={`mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px] font-black ${selectedEntries.some(entry => entry.id === e.id) ? 'border-orange-500 bg-orange-500 text-white' : 'border-gray-300 text-transparent'}`}>✓</span>
                          <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-indigo-700">{e.part_number}</p>
                        <p className="text-xs text-gray-400">{e.description ?? 'Sin descripción'} · QTY: {e.qty} · {new Date(e.exited_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <span className="text-xs font-semibold text-amber-600">PO: {e.po || '—'}</span>
                          <span className="text-xs font-semibold text-orange-600">FIFO: {e.fifo_number !== null ? `#${e.fifo_number}` : '—'}</span>
                        </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedEntries.length > 0 && (
                <>
                <div className="rounded-xl border border-orange-200 bg-orange-50/60 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-orange-700">{selectedEntries.length} número(s) seleccionado(s)</p>
                  <div className="mt-1.5 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
                    {selectedEntries.map(entry => (
                      <button key={entry.id} type="button" onClick={() => handleSelectEntry(entry)}
                        className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-white px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-orange-100">
                        {entry.part_number}<span className="text-orange-500">×</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase">QTY total</p>
                    <p className="text-xl font-black text-blue-700">{selectedEntries.reduce((sum, entry) => sum + (entry.qty ?? 0), 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-2.5">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase">Cajas totales</p>
                    <p className="text-xl font-black text-purple-700">{selectedEntries.reduce((sum, entry) => sum + (entry.boxes ?? 0), 0).toLocaleString()}</p>
                  </div>
                </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setAssignModal(null); resetAssignForm(); }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all">
                  <X className="h-4 w-4 inline mr-1" />Cancelar
                </button>
                <button type="button" onClick={handleAssign} disabled={selectedEntries.length === 0 || saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #ea580c, #f97316)' }}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Asignar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Detalle: artículos de la locación ── */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-orange-100">
                  <MapPin className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">{detailModal.location_code}</h2>
                  <p className="text-xs text-gray-400">
                    Rack {detailModal.rack} · {detailModal.items?.length ?? 0} artículos asignados
                  </p>
                </div>
              </div>
              <button onClick={() => setDetailModal(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Números de parte en la locación</p>
                  <p className="text-sm text-gray-400 mt-0.5">Selecciona una acción para un artículo específico.</p>
                </div>
                <div className="flex items-center gap-2">
                  {canManageKitteoLocationStatus ? (
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                      Estado
                      <select
                        value={detailModal.status}
                        onChange={event => void handleLocationStatusChange(detailModal, event.target.value as KitteoLocation['status'])}
                        disabled={statusSavingLocationId === detailModal.id}
                        aria-label={`Cambiar estado de ${detailModal.location_code}`}
                        className={`rounded-full border px-2.5 py-1 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:cursor-wait disabled:opacity-60 ${
                          detailModal.status === 'ocupado'
                            ? 'border-orange-200 bg-orange-100 text-orange-700'
                            : 'border-emerald-200 bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        <option value="disponible">Disponible</option>
                        <option value="ocupado">Ocupada</option>
                      </select>
                      {statusSavingLocationId === detailModal.id && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
                    </label>
                  ) : (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                      detailModal.status === 'ocupado'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {detailModal.status === 'ocupado' ? <AlertCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                      {detailModal.status === 'ocupado' ? 'Ocupada' : 'Disponible'}
                    </span>
                  )}
                  <span className="inline-flex items-center justify-center min-w-8 h-8 px-2 rounded-full bg-indigo-100 text-indigo-700 text-sm font-black">
                    {detailModal.items?.length ?? 0}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/70 px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-emerald-800">Agregar números de parte</p>
                    <p className="mt-0.5 text-xs text-emerald-700">
                      Selecciona una transferencia disponible y asígnala a esta locación.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openAssignModal(detailModal)}
                    disabled={detailModal.status !== 'disponible'}
                    title={detailModal.status === 'disponible' ? 'Agregar un número de parte desde Transferencias KITTEO' : 'Cambia el estado a Disponible para agregar números de parte'}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-700 transition-all hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    <Package className="h-3.5 w-3.5" />
                    {detailModal.status === 'disponible' ? 'Agregar desde Transferencias' : 'Disponible requerido'}
                  </button>
                </div>
              </div>

              {detailModal.items && detailModal.items.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[26rem] overflow-y-auto pr-1">
                  {detailModal.items.map(item => (
                    <div key={item.id} className="border border-gray-200 rounded-xl p-3 bg-gray-50 hover:border-orange-200 hover:bg-orange-50/30 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="inline-flex max-w-full truncate px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-mono text-xs font-bold border border-indigo-100">
                            {item.part_number}
                          </span>
                          {item.description && <p className="text-xs text-gray-500 mt-1 truncate">{item.description}</p>}
                        </div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Artículo</span>
                      </div>

                      <div className="flex gap-2 mt-3 flex-wrap">
                        <span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100">
                          QTY: {(item.qty ?? 0).toLocaleString()}
                        </span>
                        {(item.boxes ?? 0) > 0 && (
                          <span className="px-2 py-1 rounded-lg bg-purple-50 text-purple-700 text-xs font-bold border border-purple-100">
                            Cajas: {item.boxes}
                          </span>
                        )}
                        <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold border border-amber-100">
                          PO: {item.po || '—'}
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-orange-50 text-orange-700 text-xs font-bold border border-orange-100">
                          FIFO: {item.fifo_number !== null ? `#${item.fifo_number}` : '—'}
                        </span>
                      </div>

                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleReleaseItem(detailModal, item)}
                          disabled={actionSaving || exitSaving}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg text-xs font-semibold border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 transition-all disabled:opacity-50"
                        >
                          {actionSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                          Liberar
                        </button>
                        <button
                          onClick={() => { setExitTarget({ location: detailModal, item }); setExitSuccess(false); }}
                          disabled={actionSaving || exitSaving}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg text-xs font-bold border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-all disabled:opacity-50"
                        >
                          <ArrowRightFromLine className="h-3.5 w-3.5" />Dar salida
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-center">
                  <p className="text-sm font-semibold text-amber-800">No hay artículos cargados en la tabla hija.</p>
                  <p className="text-xs text-amber-700 mt-1">Revisa que la importación se haya ejecutado en `kitteo_location_items`.</p>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button onClick={() => setDetailModal(null)}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {bulkExitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                  <ListChecks className="h-5 w-5 text-red-600" /> Salidas en masa
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">Selecciona los números de parte que saldrán definitivamente de KITTEO.</p>
              </div>
              <button onClick={() => setBulkExitOpen(false)} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[240px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input value={bulkSearch} onChange={e => setBulkSearch(e.target.value)}
                    placeholder="Buscar número de parte, locación o PO..."
                    className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                </div>
                <span className="rounded-full bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                  {bulkSelectedIds.length} seleccionados
                </span>
              </div>

              <div className="max-h-[52vh] overflow-y-auto rounded-xl border border-gray-200">
                {filteredBulkItems.length === 0 ? (
                  <div className="px-6 py-12 text-center text-sm text-gray-500">No hay números de parte disponibles para salida.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {filteredBulkItems.map(({ location, item }) => {
                      const checked = bulkSelectedIds.includes(item.id);
                      return (
                        <label key={item.id} className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors ${checked ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleBulkItem(item.id)}
                            className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 font-mono text-xs font-bold text-indigo-700">{item.part_number}</span>
                              <span className="text-xs font-semibold text-gray-500">{location.location_code}</span>
                              <span className="text-xs text-gray-400">Rack {location.rack}</span>
                            </div>
                            <p className="mt-1 truncate text-xs text-gray-500">QTY: {(item.qty ?? 0).toLocaleString()} {item.po ? `· PO: ${item.po}` : ''}{item.description ? ` · ${item.description}` : ''}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => setBulkExitOpen(false)} disabled={bulkSaving}
                  className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
                <button onClick={handleBulkExit} disabled={bulkSaving || bulkSelectedIds.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightFromLine className="h-4 w-4" />}
                  Dar salida a {bulkSelectedIds.length || ''} seleccionado(s)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
