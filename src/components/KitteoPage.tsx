import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  MapPin, Package, Search, Loader2, X, Save,
  RefreshCw, LogOut, Hash, Boxes, ClipboardList, Calendar,
  User, Archive, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, CheckCircle2, AlertCircle,
} from 'lucide-react';

/* ── Tipos ── */
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
}

interface EntryOption {
  id: number;
  part_number: string;
  description: string | null;
  total_units: number;
  total_boxes: number;
  po: string | null;
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

export function KitteoPage() {
  const { userProfile } = useAuth();
  const userDisplayName = userProfile?.nombre_completo || userProfile?.email || '';

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

  /* Modal detalle / liberar */
  const [detailModal, setDetailModal] = useState<KitteoLocation | null>(null);
  const [actionSaving, setActionSaving] = useState(false);

  const racks = ['ALL', '1', '2', '3', '4', '5', '6'];

  /* ── Fetch locaciones ── */
  const fetchLocations = useCallback(async () => {
    setRefreshing(true);
    const { data } = await supabase
      .from('kitteo_locations')
      .select('*')
      .order('rack', { ascending: true })
      .order('location_code', { ascending: true });
    setLocations((data as KitteoLocation[]) ?? []);
    setLoading(false);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  /* ── Cerrar dropdown al click afuera ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (entryDropRef.current && !entryDropRef.current.contains(e.target as Node)) setShowEntryDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── Fetch entries para el modal ── */
  const fetchEntries = useCallback(async (term: string) => {
    let query = supabase
      .from('entries')
      .select('id, part_number, description, total_units, total_boxes, po')
      .order('registered_at', { ascending: false });
    if (term.trim()) {
      query = query.or(`part_number.ilike.%${term}%,description.ilike.%${term}%`);
    }
    const { data } = await query.limit(15);
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
    setQty(e.total_units);
    setPo(e.po ?? '');
    setShowEntryDrop(false);
  };

  /* ── Asignar material a locación ── */
  const handleAssign = async () => {
    if (!assignModal || !selectedEntry) return;
    setSaving(true);
    await supabase.from('kitteo_locations').update({
      status: 'ocupado',
      part_number: selectedEntry.part_number,
      description: selectedEntry.description,
      qty,
      boxes: selectedEntry.total_boxes,
      po: po || null,
      entry_id: selectedEntry.id,
      registered_by: userDisplayName || null,
      assigned_at: new Date().toISOString(),
    }).eq('id', assignModal.id);
    setSaving(false);
    setAssignModal(null);
    resetAssignForm();
    fetchLocations();
  };

  const resetAssignForm = () => {
    setSelectedEntry(null);
    setEntrySearch('');
    setQty(0);
    setPo('');
    setEntries([]);
  };

  /* ── Liberar locación ── */
  const handleRelease = async (loc: KitteoLocation) => {
    if (!confirm(`¿Liberar la locación ${loc.location_code}?`)) return;
    setActionSaving(true);
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
    setActionSaving(false);
    setDetailModal(null);
    fetchLocations();
  };

  /* ── Filtrar ── */
  const filtered = locations.filter((loc) => {
    const matchRack = selectedRack === 'ALL' || loc.rack === selectedRack;
    const term = searchTerm.toLowerCase();
    const matchSearch = !term ||
      loc.location_code.toLowerCase().includes(term) ||
      (loc.part_number ?? '').toLowerCase().includes(term) ||
      (loc.po ?? '').toLowerCase().includes(term) ||
      (loc.description ?? '').toLowerCase().includes(term);
    return matchRack && matchSearch;
  });

  /* ── Paginación ── */
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const safePage = Math.min(currentPage, Math.max(1, totalPages));
  const pageLocs = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const goTo = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));

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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <LogOut className="h-5 w-5 text-orange-500" />
            Salidas KITTEO — Locaciones
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {stats.total} locaciones · {stats.ocupado} ocupadas · {stats.disponible} disponibles
          </p>
        </div>
        <button onClick={fetchLocations}
          className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-orange-600 hover:bg-orange-50 transition-all">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

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
                <span className={`ml-1.5 text-xs ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                  ({count})
                </span>
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
                        {/* Part Number */}
                        <td className="px-4 py-3">
                          {loc.part_number ? (
                            <div>
                              <span className="inline-flex px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-mono text-xs font-semibold border border-indigo-100">
                                {loc.part_number}
                              </span>
                              {loc.description && (
                                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[140px]">{loc.description}</p>
                              )}
                            </div>
                          ) : <span className="text-gray-400 italic text-sm">—</span>}
                        </td>
                        {/* QTY */}
                        <td className="px-4 py-3 text-center">
                          {loc.qty != null ? (
                            <span className="inline-flex items-center justify-center min-w-[48px] px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-bold text-sm border border-blue-100">
                              {loc.qty.toLocaleString()}
                            </span>
                          ) : <span className="text-gray-400 italic text-sm">—</span>}
                        </td>
                        {/* Cajas */}
                        <td className="px-4 py-3 text-center">
                          {(loc.boxes ?? 0) > 0 ? (
                            <span className="inline-flex items-center justify-center min-w-[44px] px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-bold text-sm border border-purple-100">
                              {loc.boxes}
                            </span>
                          ) : <span className="text-gray-400 italic text-sm">—</span>}
                        </td>
                        {/* PO */}
                        <td className="px-4 py-3">
                          {loc.po ? (
                            <span className="inline-flex px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 font-mono text-xs font-semibold border border-purple-100">{loc.po}</span>
                          ) : <span className="text-gray-400 italic text-sm">—</span>}
                        </td>
                        {/* Registrado Por */}
                        <td className="px-4 py-3">
                          {loc.registered_by ? (
                            <div className="flex items-center gap-1.5">
                              <div className="h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-orange-600 text-xs font-bold uppercase">{loc.registered_by[0]}</span>
                              </div>
                              <span className="text-xs text-gray-600 truncate max-w-[100px]">{loc.registered_by}</span>
                            </div>
                          ) : <span className="text-gray-400 italic text-sm">—</span>}
                        </td>
                        {/* Asignado */}
                        <td className="px-4 py-3">
                          {loc.assigned_at ? (
                            <div className="flex flex-col">
                              <span className="text-xs text-gray-700 font-medium">
                                {new Date(loc.assigned_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                              <span className="text-xs text-gray-400">
                                {new Date(loc.assigned_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ) : <span className="text-gray-400 italic text-sm">—</span>}
                        </td>
                        {/* Acciones */}
                        <td className="px-4 py-3 text-center">
                          {isOcupado ? (
                            <button onClick={() => setDetailModal(loc)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 transition-all">
                              <LogOut className="h-3 w-3" />Ver / Liberar
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

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2">
              <p className="text-sm text-gray-500">
                Mostrando <strong>{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)}</strong> de <strong>{filtered.length}</strong>
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => goTo(1)} disabled={safePage === 1}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-all">
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button onClick={() => goTo(safePage - 1)} disabled={safePage === 1}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-all">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-3 py-1.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg">
                  {safePage} / {totalPages}
                </span>
                <button onClick={() => goTo(safePage + 1)} disabled={safePage === totalPages}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-all">
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button onClick={() => goTo(totalPages)} disabled={safePage === totalPages}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-all">
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
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
              {/* Buscar entry */}
              <div ref={entryDropRef} className="relative">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                  <Package className="h-3.5 w-3.5 inline mr-1 text-indigo-400" />Part Number <span className="text-red-400">*</span>
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
                        <p className="text-xs text-gray-400">{e.description ?? 'Sin descripción'} · QTY: {e.total_units}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Info del entry seleccionado */}
              {selectedEntry && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase">QTY Total</p>
                    <p className="text-xl font-black text-blue-700">{selectedEntry.total_units.toLocaleString()}</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-2.5">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase">Cajas</p>
                    <p className="text-xl font-black text-purple-700">{selectedEntry.total_boxes.toLocaleString()}</p>
                  </div>
                </div>
              )}

              {/* QTY */}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                  <Boxes className="h-3.5 w-3.5 inline mr-1 text-blue-400" />QTY a asignar <span className="text-red-400">*</span>
                </label>
                <input type="number" value={qty} min={1} onChange={e => setQty(Number(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50" />
              </div>

              {/* PO */}
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

      {/* ── Modal Detalle / Liberar ── */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-orange-100">
                  <MapPin className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">{detailModal.location_code}</h2>
                  <p className="text-xs text-gray-400">Rack {detailModal.rack} · Ocupada</p>
                </div>
              </div>
              <button onClick={() => setDetailModal(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {/* Detalle del material */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-500 font-semibold uppercase mb-1">Part Number</p>
                <p className="text-base font-black text-indigo-700">{detailModal.part_number}</p>
                {detailModal.description && <p className="text-xs text-gray-500 mt-0.5">{detailModal.description}</p>}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-center">
                  <p className="text-[10px] text-gray-500 font-semibold uppercase">QTY</p>
                  <p className="text-xl font-black text-blue-700">{detailModal.qty?.toLocaleString() ?? '—'}</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-xl px-3 py-2.5 text-center">
                  <p className="text-[10px] text-gray-500 font-semibold uppercase">Cajas</p>
                  <p className="text-xl font-black text-purple-700">{detailModal.boxes ?? '—'}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-center">
                  <p className="text-[10px] text-gray-500 font-semibold uppercase">PO</p>
                  <p className="text-sm font-bold text-amber-700 truncate">{detailModal.po ?? '—'}</p>
                </div>
              </div>
              {detailModal.registered_by && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <User className="h-3.5 w-3.5" />
                  <span>Registrado por <strong>{detailModal.registered_by}</strong></span>
                </div>
              )}
              {detailModal.assigned_at && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{new Date(detailModal.assigned_at).toLocaleString('es-MX')}</span>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setDetailModal(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all">
                  Cerrar
                </button>
                <button onClick={() => handleRelease(detailModal)} disabled={actionSaving}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-all disabled:opacity-50">
                  {actionSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                  Liberar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
