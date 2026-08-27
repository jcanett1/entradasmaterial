import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  MapPin, Package, Search, Loader2, X, Save,
  RefreshCw, LogOut, Hash, Boxes, ClipboardList, Calendar,
  User, Archive, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, CheckCircle2, AlertCircle,
  History, ArrowRightFromLine, Trash2,
} from 'lucide-react';

/* ── Tipos ── */
interface KitteoLocationItem {
  id: number;
  location_id: number;
  location_code: string;
  part_number: string;
  qty: number;
  boxes: number | null;
  po: string | null;
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
  part_number: string;
  description: string | null;
  qty: number;
  boxes: number;
  po: string | null;
  exited_at: string;
}

interface KitteoExit {
  id: number;
  rack: string;
  location_code: string;
  part_number: string;
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
  const { userProfile } = useAuth();
  const userDisplayName = userProfile?.nombre_completo || userProfile?.email || '';

  /* ── Vista activa: locaciones | historial ── */
  const [activeView, setActiveView] = useState<'locaciones' | 'historial'>('locaciones');

  /* ── Estado locaciones ── */
  const [locations, setLocations] = useState<KitteoLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRack, setSelectedRack] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  /* Modal asignar */
  const [assignModal, setAssignModal] = useState<KitteoLocation | null>(null);
  const [entries, setEntries] = useState<EntryOption[]>([]);
  const [entrySearch, setEntrySearch] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<EntryOption | null>(null);
  const [showEntryDrop, setShowEntryDrop] = useState(false);
  const [qty, setQty] = useState<number>(0);
  const [po, setPo] = useState('');
  const [saving, setSaving] = useState(false);
  const entryDropRef = useRef<HTMLDivElement>(null);
  const entryDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Modal detalle: lista de partes y acciones individuales */
  const [detailModal, setDetailModal] = useState<KitteoLocation | null>(null);
  const [actionSaving, setActionSaving] = useState(false);

  /* Modal de salida definitiva para un artículo específico */
  const [exitTarget, setExitTarget] = useState<ExitTarget | null>(null);
  const [exitSaving, setExitSaving] = useState(false);
  const [exitSuccess, setExitSuccess] = useState(false);

  /* ── Estado historial ── */
  const [historial, setHistorial] = useState<KitteoExit[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histRefreshing, setHistRefreshing] = useState(false);
  const [histSearch, setHistSearch] = useState('');
  const [histPage, setHistPage] = useState(1);

  const racks = ['ALL', '1', '2', '3', '4', '5', '6'];

  /* ── Fetch locaciones y sus artículos ── */
  const fetchLocations = useCallback(async () => {
    setRefreshing(true);
    const [{ data: locationsData, error: locationsError }, { data: itemsData, error: itemsError }] = await Promise.all([
      supabase
        .from('kitteo_locations')
        .select('*')
        .order('rack', { ascending: true })
        .order('location_code', { ascending: true }),
      supabase
        .from('kitteo_location_items')
        .select('*')
        .order('assigned_at', { ascending: true })
        .order('id', { ascending: true }),
    ]);

    if (locationsError) console.error('Error cargando locaciones KITTEO:', locationsError);
    if (itemsError) console.error('Error cargando artículos KITTEO:', itemsError);

    const itemsByLocationId = new Map<number, KitteoLocationItem[]>();
    ((itemsData as KitteoLocationItem[]) ?? []).forEach(item => {
      const current = itemsByLocationId.get(item.location_id) ?? [];
      current.push(item);
      itemsByLocationId.set(item.location_id, current);
    });

    const hydratedLocations = ((locationsData as KitteoLocation[]) ?? []).map(location => ({
      ...location,
      items: itemsByLocationId.get(location.id) ?? [],
    }));

    setLocations(hydratedLocations);
    setLoading(false);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

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
    let query = supabase
      .from('transferes')
      .select('id, part_number, description, qty, boxes, po, exited_at')
      .order('exited_at', { ascending: false });
    if (term.trim()) {
      query = query.or(`part_number.ilike.%${term}%,description.ilike.%${term}%`);
    }
    const { data } = await query.limit(20);
    setEntries((data as EntryOption[]) ?? []);
    setShowEntryDrop(true);
  }, []);

  const handleEntrySearch = (val: string) => {
    setEntrySearch(val);
    setSelectedEntry(null);
    if (entryDebounce.current) clearTimeout(entryDebounce.current);
    entryDebounce.current = setTimeout(() => fetchEntries(val), 250);
  };

  const handleSelectEntry = (e: EntryOption) => {
    setSelectedEntry(e);
    setEntrySearch(e.part_number);
    setQty(e.qty);
    setPo(e.po ?? '');
    setShowEntryDrop(false);
  };

  /* ── Asignar material a una locación ── */
  const handleAssign = async () => {
    if (!assignModal || !selectedEntry) return;
    setSaving(true);

    const { error: itemError } = await supabase.from('kitteo_location_items').insert([{
      location_id: assignModal.id,
      location_code: assignModal.location_code,
      part_number: selectedEntry.part_number,
      description: selectedEntry.description,
      qty,
      boxes: selectedEntry.boxes,
      po: po || null,
      entry_id: selectedEntry.id,
      registered_by: userDisplayName || null,
      assigned_at: new Date().toISOString(),
    }]);

    if (itemError) {
      console.error('Error asignando artículo KITTEO:', itemError);
      alert(`No se pudo asignar el número de parte: ${itemError.message}`);
      setSaving(false);
      return;
    }

    const { error: locationError } = await supabase
      .from('kitteo_locations')
      .update({ status: 'ocupado' })
      .eq('id', assignModal.id);

    if (locationError) {
      console.error('Error actualizando estado de locación KITTEO:', locationError);
      alert(`El artículo se guardó, pero no se pudo actualizar el estado de la locación: ${locationError.message}`);
    }

    setSaving(false);
    setAssignModal(null);
    resetAssignForm();
    await fetchLocations();
  };

  const resetAssignForm = () => {
    setSelectedEntry(null);
    setEntrySearch('');
    setQty(0);
    setPo('');
    setEntries([]);
  };

  /* ── Liberar un solo artículo (sin historial) ── */
  const handleReleaseItem = async (loc: KitteoLocation, item: KitteoLocationItem) => {
    if (!confirm(`¿Liberar solamente ${item.part_number} de la locación ${loc.location_code}?`)) return;
    setActionSaving(true);

    const { error: deleteError } = await supabase
      .from('kitteo_location_items')
      .delete()
      .eq('id', item.id)
      .eq('location_id', loc.id);

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

    if (!countError && remainingCount === 0) {
      await supabase.from('kitteo_locations').update({
        status: 'disponible',
        part_number: null,
        description: null,
        qty: null,
        boxes: null,
        po: null,
        entry_id: null,
        registered_by: null,
        assigned_at: null,
      }).eq('id', loc.id);
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

    const { error: exitError } = await supabase.from('kitteo_exits').insert([{
      rack: location.rack,
      location_code: location.location_code,
      part_number: item.part_number,
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

    const { error: deleteError } = await supabase
      .from('kitteo_location_items')
      .delete()
      .eq('id', item.id)
      .eq('location_id', location.id);

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

    if (!countError && remainingCount === 0) {
      await supabase.from('kitteo_locations').update({
        status: 'disponible',
        part_number: null,
        description: null,
        qty: null,
        boxes: null,
        po: null,
        entry_id: null,
        registered_by: null,
        assigned_at: null,
      }).eq('id', location.id);
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

  /* ── Filtrar locaciones ── */
  const filtered = locations.filter((loc) => {
    const matchRack = selectedRack === 'ALL' || loc.rack === selectedRack;
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
    return matchRack && matchSearch;
  });

  /* ── Filtrar historial ── */
  const filteredHist = historial.filter(h => {
    const term = histSearch.toLowerCase();
    return !term ||
      h.part_number.toLowerCase().includes(term) ||
      h.location_code.toLowerCase().includes(term) ||
      (h.po ?? '').toLowerCase().includes(term) ||
      (h.description ?? '').toLowerCase().includes(term) ||
      h.rack.toLowerCase().includes(term);
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
        <button
          onClick={() => activeView === 'locaciones' ? fetchLocations() : fetchHistorial()}
          className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-orange-600 hover:bg-orange-50 transition-all">
          <RefreshCw className={`h-4 w-4 ${refreshing || histRefreshing ? 'animate-spin' : ''}`} />
        </button>
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
            <div className="relative ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input type="text" value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                placeholder="Buscar locación, part number, PO..."
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
                          { icon: <ClipboardList className="h-3.5 w-3.5" />, label: 'PO' },
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
                              {isOcupado ? (
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
                              {primaryItem?.qty != null || loc.qty != null ? (
                                <span className="inline-flex items-center justify-center min-w-[48px] px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-bold text-sm border border-blue-100">
                                  {(primaryItem?.qty ?? loc.qty ?? 0).toLocaleString()}
                                </span>
                              ) : <span className="text-gray-400 italic text-sm">—</span>}
                            </td>
                            {/* Cajas */}
                            <td className="px-4 py-3 text-center">
                              {((primaryItem?.boxes ?? loc.boxes) ?? 0) > 0 ? (
                                <span className="inline-flex items-center justify-center min-w-[44px] px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-bold text-sm border border-purple-100">
                                  {primaryItem?.boxes ?? loc.boxes}
                                </span>
                              ) : <span className="text-gray-400 italic text-sm">—</span>}
                            </td>
                            {/* PO */}
                            <td className="px-4 py-3">
                              {(primaryItem?.po ?? loc.po) ? (
                                <span className="inline-flex px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 font-mono text-xs font-semibold border border-purple-100">{primaryItem?.po ?? loc.po}</span>
                              ) : <span className="text-gray-400 italic text-sm">—</span>}
                            </td>
                            {/* Registrado Por */}
                            <td className="px-4 py-3">
                              {(primaryItem?.registered_by ?? loc.registered_by) ? (
                                <div className="flex items-center gap-1.5">
                                  <div className="h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                                    <span className="text-orange-600 text-xs font-bold uppercase">{(primaryItem?.registered_by ?? loc.registered_by)?.[0]}</span>
                                  </div>
                                  <span className="text-xs text-gray-600 truncate max-w-[100px]">{primaryItem?.registered_by ?? loc.registered_by}</span>
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
                              {isOcupado ? (
                                <button onClick={() => setDetailModal(loc)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 transition-all whitespace-nowrap">
                                  <ClipboardList className="h-3 w-3" />Ver partes
                                </button>
                              ) : (
                                <button onClick={() => { setAssignModal(loc); fetchEntries(''); }}
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
              <p className="text-3xl font-black text-red-600">{historial.length}</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">QTY Total</p>
              <p className="text-3xl font-black text-blue-700">{historial.reduce((s, h) => s + (h.qty ?? 0), 0).toLocaleString()}</p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-2xl px-5 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cajas Total</p>
              <p className="text-3xl font-black text-purple-700">{historial.reduce((s, h) => s + (h.boxes ?? 0), 0).toLocaleString()}</p>
            </div>
          </div>

          {/* Buscador historial */}
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input type="text" value={histSearch} onChange={e => { setHistSearch(e.target.value); setHistPage(1); }}
              placeholder="Buscar part number, locación, PO..."
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white w-full" />
          </div>

          {/* Tabla historial */}
          {histLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-10 w-10 text-red-400 animate-spin" /></div>
          ) : filteredHist.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="p-5 bg-red-50 rounded-3xl mb-4"><History className="h-12 w-12 text-red-300" /></div>
              <p className="text-gray-600 font-semibold">Sin salidas definitivas registradas</p>
              <p className="text-gray-400 text-sm mt-1">Las salidas definitivas aparecerán aquí</p>
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
                          { icon: <ClipboardList className="h-3.5 w-3.5" />, label: 'PO' },
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
                            {/* PO */}
                            <td className="px-4 py-3">
                              {h.po ? (
                                <span className="inline-flex px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 font-mono text-xs font-semibold border border-purple-100">{h.po}</span>
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
                          <td colSpan={3} />
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
                  <Package className="h-3.5 w-3.5 inline mr-1 text-indigo-400" />Buscar en Transferencias <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input type="text" value={entrySearch} onChange={e => handleEntrySearch(e.target.value)}
                    onFocus={() => { if (entries.length > 0) setShowEntryDrop(true); else fetchEntries(entrySearch); }}
                    placeholder="Buscar por part number o descripción..."
                    className={`w-full pl-9 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50 ${selectedEntry ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`} />
                </div>
                {showEntryDrop && entries.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                    {entries.map(e => (
                      <button key={e.id} type="button"
                        onMouseDown={(ev) => { ev.preventDefault(); handleSelectEntry(e); }}
                        className="w-full text-left px-4 py-2.5 hover:bg-orange-50 transition-colors border-b border-gray-50 last:border-0">
                        <p className="text-sm font-bold text-indigo-700">{e.part_number}</p>
                        <p className="text-xs text-gray-400">{e.description ?? 'Sin descripción'} · QTY: {e.qty} · {new Date(e.exited_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedEntry && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase">QTY</p>
                    <p className="text-xl font-black text-blue-700">{selectedEntry.qty.toLocaleString()}</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-2.5">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase">Cajas</p>
                    <p className="text-xl font-black text-purple-700">{selectedEntry.boxes.toLocaleString()}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                  <Boxes className="h-3.5 w-3.5 inline mr-1 text-blue-400" />QTY a asignar <span className="text-red-400">*</span>
                </label>
                <input type="number" value={qty} min={1} onChange={e => setQty(Number(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                  <ClipboardList className="h-3.5 w-3.5 inline mr-1 text-purple-400" />PO
                </label>
                <input type="text" value={po} onChange={e => setPo(e.target.value)} placeholder="Opcional"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setAssignModal(null); resetAssignForm(); }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all">
                  <X className="h-4 w-4 inline mr-1" />Cancelar
                </button>
                <button type="button" onClick={handleAssign} disabled={!selectedEntry || qty < 1 || saving}
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
                <span className="inline-flex items-center justify-center min-w-8 h-8 px-2 rounded-full bg-indigo-100 text-indigo-700 text-sm font-black">
                  {detailModal.items?.length ?? 0}
                </span>
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
                        {item.po && (
                          <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold border border-amber-100">
                            PO: {item.po}
                          </span>
                        )}
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

    </div>
  );
}
