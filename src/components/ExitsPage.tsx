import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  LogOut, Search, Loader2, Save, X, Hash, Boxes, ClipboardList,
  MapPin, RefreshCw, Calendar, User, Package, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Archive, ArrowRightFromLine, CheckCircle2, ListChecks,
} from 'lucide-react';

interface Exit {
  id: number;
  part_number: string;
  description: string | null;
  qty: number;
  boxes: number;
  po: string | null;
  location_code: string | null;
  destination: string;
  registered_by: string | null;
  exited_at: string;
}

interface EntryOption {
  id: number;
  part_number: string;
  description: string | null;
  total_units: number;
  total_boxes: number;
  po: string | null;
}

interface LocationOption {
  id: number;
  location_code: string;
  rack: string;
}

/* ── Tipo para locaciones KITTEO ── */
interface KitteoLocation {
  id: number;
  rack: string;
  location_code: string;
  status: 'disponible' | 'ocupado';
}

/* ── Colores por rack KITTEO ── */
const RACK_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  '1': { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    badge: 'bg-blue-600' },
  '2': { bg: 'bg-indigo-50',  border: 'border-indigo-200',  text: 'text-indigo-700',  badge: 'bg-indigo-600' },
  '3': { bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-700',  badge: 'bg-violet-600' },
  '4': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-600' },
  '5': { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   badge: 'bg-amber-500' },
  '6': { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    badge: 'bg-rose-600' },
};

const PAGE_SIZE = 25;

export function ExitsPage() {
  const { userProfile } = useAuth();
  const userDisplayName = userProfile?.nombre_completo || userProfile?.email || '';

  const [exits, setExits] = useState<Exit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Formulario nueva transferencia
  const [selectedEntry, setSelectedEntry] = useState<EntryOption | null>(null);
  const [entrySearch, setEntrySearch] = useState('');
  const [entrySuggestions, setEntrySuggestions] = useState<EntryOption[]>([]);
  const [showEntryDrop, setShowEntryDrop] = useState(false);
  const [qty, setQty] = useState<number>(0);
  const [po, setPo] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<LocationOption[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationOption | null>(null);
  const [showLocDrop, setShowLocDrop] = useState(false);

  const entryDropRef = useRef<HTMLDivElement>(null);
  const locDropRef = useRef<HTMLDivElement>(null);
  const entryDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Estado del modal "Salida a KITTEO" ── */
  const [kitteoModal, setKitteoModal] = useState<Exit | null>(null);
  const [kitteoSaving, setKitteoSaving] = useState(false);
  const [kitteoSuccess, setKitteoSuccess] = useState(false);
  // Racks y locaciones KITTEO
  const [kitteoRacks, setKitteoRacks] = useState<string[]>([]);
  const [selectedKitteoRack, setSelectedKitteoRack] = useState<string>('');
  const [kitteoLocations, setKitteoLocations] = useState<KitteoLocation[]>([]);
  const [filteredKitteoLocs, setFilteredKitteoLocs] = useState<KitteoLocation[]>([]);
  const [selectedKitteoLoc, setSelectedKitteoLoc] = useState<KitteoLocation | null>(null);
  const [kitteoLocSearch, setKitteoLocSearch] = useState('');
  const [loadingKitteoLocs, setLoadingKitteoLocs] = useState(false);

  /* ── Salidas masivas a locaciones KITTEO ── */
  const [bulkKitteoOpen, setBulkKitteoOpen] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<number[]>([]);
  const [bulkLocationIds, setBulkLocationIds] = useState<Record<number, number>>({});
  const [bulkKitteoSaving, setBulkKitteoSaving] = useState(false);
  const [bulkKitteoLocations, setBulkKitteoLocations] = useState<KitteoLocation[]>([]);

  useEffect(() => { fetchExits(); }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (entryDropRef.current && !entryDropRef.current.contains(e.target as Node)) setShowEntryDrop(false);
      if (locDropRef.current && !locDropRef.current.contains(e.target as Node)) setShowLocDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchExits = async () => {
    setRefreshing(true);
    const { data } = await supabase
      .from('transferes')
      .select('*')
      .order('exited_at', { ascending: false });
    setExits((data as Exit[]) ?? []);
    setLoading(false);
    setTimeout(() => setRefreshing(false), 500);
  };

  const fetchEntries = useCallback(async (term: string) => {
    const { data } = await supabase
      .from('entries')
      .select('id, part_number, description, total_units, total_boxes, po')
      .or(`part_number.ilike.%${term}%,description.ilike.%${term}%`)
      .order('registered_at', { ascending: false })
      .limit(15);
    setEntrySuggestions((data as EntryOption[]) ?? []);
    setShowEntryDrop(true);
  }, []);

  const fetchLocations = useCallback(async (term: string) => {
    const { data } = await supabase
      .from('locations')
      .select('id, location_code, rack')
      .eq('status', 'ocupado')
      .ilike('location_code', `%${term}%`)
      .order('location_code', { ascending: true })
      .limit(15);
    setLocationSuggestions((data as LocationOption[]) ?? []);
    setShowLocDrop(true);
  }, []);

  const handleEntrySearch = (val: string) => {
    setEntrySearch(val);
    setSelectedEntry(null);
    if (entryDebounce.current) clearTimeout(entryDebounce.current);
    entryDebounce.current = setTimeout(() => fetchEntries(val), 250);
  };

  const handleLocSearch = (val: string) => {
    setLocationSearch(val);
    setSelectedLocation(null);
    if (locDebounce.current) clearTimeout(locDebounce.current);
    locDebounce.current = setTimeout(() => fetchLocations(val), 250);
  };

  const handleSelectEntry = (e: EntryOption) => {
    setSelectedEntry(e);
    setEntrySearch(e.part_number);
    setQty(e.total_units);
    setPo(e.po ?? '');
    setShowEntryDrop(false);
  };

  const handleSelectLocation = (l: LocationOption) => {
    setSelectedLocation(l);
    setLocationSearch(l.location_code);
    setShowLocDrop(false);
  };

  const handleSave = async () => {
    if (!selectedEntry) return;
    setSaving(true);
    await supabase.from('transferes').insert([{
      part_number: selectedEntry.part_number,
      description: selectedEntry.description,
      qty,
      boxes: selectedEntry.total_boxes,
      po: po || null,
      location_code: selectedLocation?.location_code ?? null,
      location_id: selectedLocation?.id ?? null,
      entry_id: selectedEntry.id,
      destination: 'KITTEO',
      registered_by: userDisplayName,
    }]);

    if (selectedLocation) {
      await supabase.from('locations').update({
        status: 'disponible',
        entry_id: null,
        part_number: null,
        qty: null,
        po: null,
        assigned_at: null,
      }).eq('id', selectedLocation.id);
    }

    setSaving(false);
    resetForm();
    fetchExits();
  };

  const resetForm = () => {
    setShowForm(false);
    setSelectedEntry(null);
    setEntrySearch('');
    setQty(0);
    setPo('');
    setSelectedLocation(null);
    setLocationSearch('');
  };

  /* ══════════════════════════════════════════
     LÓGICA MODAL "SALIDA A KITTEO"
  ══════════════════════════════════════════ */

  /* Cargar racks disponibles de kitteo_locations */
  const openKitteoModal = async (exit: Exit) => {
    setKitteoModal(exit);
    setKitteoSuccess(false);
    setSelectedKitteoRack('');
    setSelectedKitteoLoc(null);
    setKitteoLocSearch('');
    setLoadingKitteoLocs(true);

    const { data } = await supabase
      .from('kitteo_locations')
      .select('id, rack, location_code, status')
      .eq('status', 'disponible')
      .order('rack', { ascending: true })
      .order('location_code', { ascending: true });

    const locs = (data as KitteoLocation[]) ?? [];
    setKitteoLocations(locs);

    // Extraer racks únicos
    const uniqueRacks = [...new Set(locs.map(l => l.rack))].sort((a, b) =>
      parseInt(a) - parseInt(b)
    );
    setKitteoRacks(uniqueRacks);
    setLoadingKitteoLocs(false);
  };

  /* Cuando cambia el rack seleccionado, filtrar locaciones */
  useEffect(() => {
    if (!selectedKitteoRack) {
      setFilteredKitteoLocs([]);
      setSelectedKitteoLoc(null);
      setKitteoLocSearch('');
      return;
    }
    const locs = kitteoLocations.filter(l => l.rack === selectedKitteoRack);
    const term = kitteoLocSearch.toLowerCase();
    setFilteredKitteoLocs(
      term ? locs.filter(l => l.location_code.toLowerCase().includes(term)) : locs
    );
    setSelectedKitteoLoc(null);
  }, [selectedKitteoRack, kitteoLocations, kitteoLocSearch]);

  /* Confirmar salida a KITTEO */
  const handleKitteoSave = async () => {
    if (!kitteoModal || !selectedKitteoLoc) return;
    setKitteoSaving(true);

    // 1. Asignar el material a la locación KITTEO seleccionada
    await supabase.from('kitteo_locations').update({
      status: 'ocupado',
      part_number: kitteoModal.part_number,
      description: kitteoModal.description,
      qty: kitteoModal.qty,
      boxes: kitteoModal.boxes,
      po: kitteoModal.po,
      entry_id: null,
      registered_by: userDisplayName || null,
      assigned_at: new Date().toISOString(),
    }).eq('id', selectedKitteoLoc.id);

    setKitteoSaving(false);
    setKitteoSuccess(true);

    // Cerrar modal después de 1.5 segundos
    setTimeout(() => {
      setKitteoModal(null);
      setKitteoSuccess(false);
      setSelectedKitteoRack('');
      setSelectedKitteoLoc(null);
    }, 1500);
  };

  const closeKitteoModal = () => {
    setKitteoModal(null);
    setKitteoSuccess(false);
    setSelectedKitteoRack('');
    setSelectedKitteoLoc(null);
    setKitteoLocSearch('');
  };

  const openBulkKitteo = async () => {
    setBulkSelectedIds([]);
    setBulkLocationIds({});
    setBulkKitteoOpen(true);
    setLoadingKitteoLocs(true);
    const { data } = await supabase.from('kitteo_locations')
      .select('id, rack, location_code, status').eq('status', 'disponible')
      .order('rack', { ascending: true }).order('location_code', { ascending: true });
    setBulkKitteoLocations((data as KitteoLocation[]) ?? []);
    setLoadingKitteoLocs(false);
  };

  const handleBulkKitteoSave = async () => {
    const selected = exits.filter(exit => bulkSelectedIds.includes(exit.id));
    if (selected.length === 0 || selected.some(exit => !bulkLocationIds[exit.id])) return;
    const locationIds = selected.map(exit => bulkLocationIds[exit.id]);
    if (new Set(locationIds).size !== locationIds.length) {
      alert('Cada número de parte debe tener una locación KITTEO diferente.');
      return;
    }
    if (!confirm(`¿Enviar ${selected.length} transferencia(s) a KITTEO?`)) return;
    setBulkKitteoSaving(true);
    const now = new Date().toISOString();
    const results = await Promise.all(selected.map(exit => {
      const location = bulkKitteoLocations.find(loc => loc.id === bulkLocationIds[exit.id]);
      return location ? supabase.from('kitteo_locations').update({
        status: 'ocupado', part_number: exit.part_number, description: exit.description,
        qty: exit.qty, boxes: exit.boxes, po: exit.po, entry_id: null,
        registered_by: userDisplayName || null, assigned_at: now,
      }).eq('id', location.id) : Promise.resolve({ error: { message: 'Locación no encontrada' } });
    }));
    const error = results.find(result => result.error)?.error;
    if (error) {
      alert(`No se pudieron completar todas las salidas: ${error.message}`);
      setBulkKitteoSaving(false);
      return;
    }
    setBulkKitteoSaving(false);
    setBulkKitteoOpen(false);
    setBulkSelectedIds([]);
    setBulkLocationIds({});
    await fetchExits();
  };

  // Totales calculados
  const totalQtyAll = exits.reduce((s, e) => s + e.qty, 0);
  const totalBoxesAll = exits.reduce((s, e) => s + (e.boxes ?? 0), 0);

  // Paginación
  const totalPages = Math.ceil(exits.length / PAGE_SIZE);
  const safePage = Math.min(currentPage, Math.max(1, totalPages));
  const pageExits = exits.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const goTo = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <LogOut className="h-5 w-5 text-red-500" />
            Transferencia Kitteo
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Todas las transferencias tienen como destino KITTEO</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchExits}
            className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openBulkKitteo}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-white bg-red-600 shadow-md hover:bg-red-700 transition-all active:scale-95">
            <ListChecks className="h-4 w-4" />
            Salidas en masa
          </button>
          <button onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-md transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)' }}>
            <LogOut className="h-4 w-4" />
            Nueva Transferencia
          </button>
        </div>
      </div>

      {/* Stats — 4 tarjetas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Transferencias</p>
          <p className="text-3xl font-black text-red-600">{exits.length}</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Destino</p>
          <p className="text-2xl font-black text-orange-600">KITTEO</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Boxes className="h-3.5 w-3.5 text-blue-500" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">QTY Total Transferencia</p>
          </div>
          <p className="text-3xl font-black text-blue-700">{totalQtyAll.toLocaleString()}</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Archive className="h-3.5 w-3.5 text-purple-500" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cajas Total Transferencia</p>
          </div>
          <p className="text-3xl font-black text-purple-700">{totalBoxesAll.toLocaleString()}</p>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-10 w-10 text-red-400 animate-spin" /></div>
      ) : exits.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="p-5 bg-red-50 rounded-3xl mb-4"><LogOut className="h-12 w-12 text-red-300" /></div>
          <p className="text-gray-600 font-semibold">Sin transferencias registradas</p>
          <p className="text-gray-400 text-sm mt-1">Usa el botón <span className="text-red-500 font-medium">Nueva Transferencia</span> para registrar</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {[
                    { icon: <ListChecks className="h-3.5 w-3.5" />, label: 'Sel.' },
                    { icon: <Hash className="h-3.5 w-3.5" />, label: 'Part Number' },
                    { icon: <Boxes className="h-3.5 w-3.5" />, label: 'QTY', center: true },
                    { icon: <Archive className="h-3.5 w-3.5" />, label: 'Cajas', center: true },
                    { icon: <ClipboardList className="h-3.5 w-3.5" />, label: 'PO' },
                    { icon: <MapPin className="h-3.5 w-3.5" />, label: 'Locación' },
                    { icon: <LogOut className="h-3.5 w-3.5" />, label: 'Destino', center: true },
                    { icon: <User className="h-3.5 w-3.5" />, label: 'Registrado Por' },
                    { icon: <Calendar className="h-3.5 w-3.5" />, label: 'Fecha' },
                    { icon: <ArrowRightFromLine className="h-3.5 w-3.5" />, label: 'Acciones', center: true },
                  ].map(h => (
                    <th key={h.label} className={`px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider ${h.center ? 'text-center' : 'text-left'}`}>
                      <div className={`flex items-center gap-1.5 ${h.center ? 'justify-center' : ''}`}>
                        <span className="text-red-400">{h.icon}</span>{h.label}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                  {pageExits.map((exit, idx) => (
                    <tr key={exit.id} className="border-b border-gray-100 last:border-0 hover:bg-red-50/30 transition-colors"
                    style={{ background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                    <td className="px-3 py-4 text-center">
                      <input type="checkbox" checked={bulkSelectedIds.includes(exit.id)}
                        onChange={() => setBulkSelectedIds(current => current.includes(exit.id) ? current.filter(id => id !== exit.id) : [...current, exit.id])}
                        className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
                    </td>
                    {/* Part Number */}
                    <td className="px-5 py-4">
                      <div>
                        <span className="inline-flex px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 font-mono text-sm font-semibold border border-indigo-100">
                          {exit.part_number}
                        </span>
                        {exit.description && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[160px]">{exit.description}</p>
                        )}
                      </div>
                    </td>
                    {/* QTY */}
                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex items-center justify-center min-w-[56px] px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 font-bold text-sm border border-blue-100">
                        {exit.qty.toLocaleString()}
                      </span>
                    </td>
                    {/* Cajas */}
                    <td className="px-5 py-4 text-center">
                      {(exit.boxes ?? 0) > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[44px] px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 font-bold text-sm border border-purple-100">
                          {(exit.boxes ?? 0).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic text-sm">—</span>
                      )}
                    </td>
                    {/* PO */}
                    <td className="px-5 py-4">
                      {exit.po ? (
                        <span className="inline-flex px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 font-mono text-sm font-semibold border border-purple-100">{exit.po}</span>
                      ) : <span className="text-gray-400 italic text-sm">—</span>}
                    </td>
                    {/* Locación */}
                    <td className="px-5 py-4">
                      {exit.location_code ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-sm font-semibold border border-amber-100">
                          <MapPin className="h-3 w-3" />{exit.location_code}
                        </span>
                      ) : <span className="text-gray-400 italic text-sm">—</span>}
                    </td>
                    {/* Destino */}
                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex px-3 py-1.5 rounded-full bg-red-50 text-red-600 text-xs font-bold border border-red-100">
                        {exit.destination}
                      </span>
                    </td>
                    {/* Registrado Por */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-red-600 text-xs font-bold uppercase">{exit.registered_by ? exit.registered_by[0] : '?'}</span>
                        </div>
                        <span className="text-sm text-gray-600 truncate max-w-[120px]">{exit.registered_by ?? <span className="italic text-gray-400">Sin registro</span>}</span>
                      </div>
                    </td>
                    {/* Fecha */}
                    <td className="px-5 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-700 font-medium">
                          {new Date(exit.exited_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="text-xs text-gray-400 mt-0.5">
                          {new Date(exit.exited_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </td>
                    {/* ── ACCIONES ── */}
                    <td className="px-5 py-4 text-center">
                      <button
                        onClick={() => openKitteoModal(exit)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:border-orange-300 transition-all active:scale-95 whitespace-nowrap shadow-sm"
                      >
                        <ArrowRightFromLine className="h-3.5 w-3.5" />
                        Salida a KITTEO
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Fila de totales */}
              {pageExits.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td className="px-5 py-3">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Subtotal página</span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-black text-sm border border-blue-200">
                        {pageExits.reduce((s, e) => s + e.qty, 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-purple-100 text-purple-800 font-black text-sm border border-purple-200">
                        {pageExits.reduce((s, e) => s + (e.boxes ?? 0), 0).toLocaleString()}
                      </span>
                    </td>
                    <td colSpan={6} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/60">
              <p className="text-xs text-gray-500">
                Mostrando <strong>{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, exits.length)}</strong> de <strong>{exits.length}</strong>
              </p>
              <div className="flex items-center gap-1">
                {[
                  { icon: <ChevronsLeft className="h-4 w-4" />, action: () => goTo(1), disabled: safePage === 1 },
                  { icon: <ChevronLeft className="h-4 w-4" />, action: () => goTo(safePage - 1), disabled: safePage === 1 },
                  { icon: <ChevronRight className="h-4 w-4" />, action: () => goTo(safePage + 1), disabled: safePage === totalPages },
                  { icon: <ChevronsRight className="h-4 w-4" />, action: () => goTo(totalPages), disabled: safePage === totalPages },
                ].map((btn, i) => (
                  <button key={i} onClick={btn.action} disabled={btn.disabled}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    {btn.icon}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {bulkKitteoOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl border border-gray-100 max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><ListChecks className="h-5 w-5 text-red-600" /> Salidas en masa a KITTEO</h2>
                <p className="text-xs text-gray-500 mt-1">Selecciona transferencias y asigna una locación disponible a cada una.</p>
              </div>
              <button onClick={() => setBulkKitteoOpen(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {loadingKitteoLocs ? <div className="py-10 flex justify-center"><Loader2 className="h-8 w-8 text-red-500 animate-spin" /></div> : (
                <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {exits.map(exit => {
                    const selected = bulkSelectedIds.includes(exit.id);
                    return <div key={exit.id} className={`flex items-center gap-3 px-4 py-3 ${selected ? 'bg-red-50' : ''}`}>
                      <input type="checkbox" checked={selected} onChange={() => setBulkSelectedIds(current => current.includes(exit.id) ? current.filter(id => id !== exit.id) : [...current, exit.id])} className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
                      <span className="flex-1 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 font-mono text-xs font-bold text-indigo-700">{exit.part_number}</span>
                      <span className="text-xs text-gray-500">QTY: {exit.qty.toLocaleString()}</span>
                      <select value={bulkLocationIds[exit.id] ?? ''} disabled={!selected} onChange={e => setBulkLocationIds(current => ({ ...current, [exit.id]: Number(e.target.value) }))} className="w-44 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm disabled:bg-gray-100">
                        <option value="">Locación KITTEO...</option>
                        {bulkKitteoLocations.map(loc => <option key={loc.id} value={loc.id}>Rack {loc.rack} · {loc.location_code}</option>)}
                      </select>
                    </div>;
                  })}
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-gray-600">{bulkSelectedIds.length} seleccionada(s)</span>
                <div className="flex gap-2">
                  <button onClick={() => setBulkKitteoOpen(false)} disabled={bulkKitteoSaving} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancelar</button>
                  <button onClick={handleBulkKitteoSave} disabled={bulkKitteoSaving || bulkSelectedIds.length === 0 || bulkSelectedIds.some(id => !bulkLocationIds[id])} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    {bulkKitteoSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightFromLine className="h-4 w-4" />} Enviar a KITTEO
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MODAL: SALIDA A KITTEO
      ══════════════════════════════════════════ */}
      {kitteoModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100">

            {/* Header del modal */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-orange-100">
                  <ArrowRightFromLine className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Salida a KITTEO</h2>
                  <p className="text-xs text-gray-400">Selecciona la locación destino en KITTEO</p>
                </div>
              </div>
              <button onClick={closeKitteoModal}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* ── Éxito ── */}
              {kitteoSuccess ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="p-4 bg-emerald-100 rounded-full">
                    <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                  </div>
                  <p className="text-lg font-bold text-emerald-700">¡Salida registrada!</p>
                  <p className="text-sm text-gray-500 text-center">
                    <strong>{kitteoModal.part_number}</strong> asignado a la locación{' '}
                    <strong className="text-orange-600">{selectedKitteoLoc?.location_code}</strong> en KITTEO.
                  </p>
                </div>
              ) : (
                <>
                  {/* ── Info del material ── */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Material a transferir</p>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="inline-flex px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-mono text-sm font-bold border border-indigo-100">
                          {kitteoModal.part_number}
                        </span>
                        {kitteoModal.description && (
                          <p className="text-xs text-gray-500 mt-1">{kitteoModal.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-center">
                          <p className="text-[10px] text-gray-500 font-semibold uppercase">QTY</p>
                          <p className="text-base font-black text-blue-700">{kitteoModal.qty.toLocaleString()}</p>
                        </div>
                        {(kitteoModal.boxes ?? 0) > 0 && (
                          <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5 text-center">
                            <p className="text-[10px] text-gray-500 font-semibold uppercase">Cajas</p>
                            <p className="text-base font-black text-purple-700">{kitteoModal.boxes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Paso 1: Seleccionar Rack ── */}
                  <div>
                    <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-600 text-white text-[10px] font-black">1</span>
                      Selecciona el Rack KITTEO
                    </p>
                    {loadingKitteoLocs ? (
                      <div className="flex items-center gap-2 py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                        <span className="text-sm text-gray-400">Cargando racks disponibles...</span>
                      </div>
                    ) : kitteoRacks.length === 0 ? (
                      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">
                        No hay locaciones disponibles en KITTEO en este momento.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {kitteoRacks.map(rack => {
                          const c = RACK_COLORS[rack] ?? RACK_COLORS['1'];
                          const isActive = selectedKitteoRack === rack;
                          const count = kitteoLocations.filter(l => l.rack === rack).length;
                          return (
                            <button key={rack}
                              onClick={() => setSelectedKitteoRack(rack)}
                              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                                isActive
                                  ? `${c.badge} text-white border-transparent shadow-md scale-105`
                                  : `${c.bg} ${c.text} ${c.border} hover:opacity-80`
                              }`}>
                              <MapPin className="h-3.5 w-3.5" />
                              Rack {rack}
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-white/60 text-gray-600'}`}>
                                {count}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ── Paso 2: Seleccionar Locación ── */}
                  {selectedKitteoRack && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-600 text-white text-[10px] font-black">2</span>
                          Selecciona la Locación — Rack {selectedKitteoRack}
                        </p>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                          <input
                            type="text"
                            value={kitteoLocSearch}
                            onChange={e => setKitteoLocSearch(e.target.value)}
                            placeholder="Filtrar..."
                            className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50 w-32"
                          />
                        </div>
                      </div>

                      {filteredKitteoLocs.length === 0 ? (
                        <p className="text-sm text-gray-400 italic py-2">Sin locaciones disponibles para este rack.</p>
                      ) : (
                        <div className="grid grid-cols-4 gap-1.5 max-h-52 overflow-y-auto pr-1">
                          {filteredKitteoLocs.map(loc => {
                            const c = RACK_COLORS[loc.rack] ?? RACK_COLORS['1'];
                            const isSelected = selectedKitteoLoc?.id === loc.id;
                            return (
                              <button key={loc.id}
                                onClick={() => setSelectedKitteoLoc(loc)}
                                className={`px-2 py-2 rounded-lg text-xs font-bold border transition-all text-center ${
                                  isSelected
                                    ? `${c.badge} text-white border-transparent shadow-md`
                                    : `${c.bg} ${c.text} ${c.border} hover:opacity-80`
                                }`}>
                                {loc.location_code}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Resumen selección ── */}
                  {selectedKitteoLoc && (
                    <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                      <CheckCircle2 className="h-5 w-5 text-orange-500 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 font-semibold">Locación destino seleccionada</p>
                        <p className="text-base font-black text-orange-700">
                          {selectedKitteoLoc.location_code}
                          <span className="text-sm font-semibold text-gray-500 ml-2">· Rack {selectedKitteoLoc.rack}</span>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ── Botones ── */}
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={closeKitteoModal}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all">
                      <X className="h-4 w-4 inline mr-1" />Cancelar
                    </button>
                    <button type="button" onClick={handleKitteoSave}
                      disabled={!selectedKitteoLoc || kitteoSaving}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #ea580c, #f97316)' }}>
                      {kitteoSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightFromLine className="h-4 w-4" />}
                      Confirmar Salida
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MODAL: NUEVA TRANSFERENCIA
      ══════════════════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-red-100">
                  <LogOut className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Nueva Transferencia</h2>
                  <p className="text-xs text-gray-400">Destino: <span className="font-bold text-red-500">KITTEO</span></p>
                </div>
              </div>
              <button onClick={resetForm} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Buscar Part Number */}
              <div ref={entryDropRef} className="relative">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                  <Hash className="h-3.5 w-3.5 inline mr-1 text-indigo-400" />Part Number <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input type="text" value={entrySearch} onChange={e => handleEntrySearch(e.target.value)}
                    onFocus={() => { if (entrySuggestions.length > 0) setShowEntryDrop(true); }}
                    placeholder="Buscar en inventario..."
                    className={`w-full pl-9 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 ${selectedEntry ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200'}`} />
                </div>
                {showEntryDrop && entrySuggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                    {entrySuggestions.map(e => (
                      <button key={e.id} type="button"
                        onMouseDown={(ev) => { ev.preventDefault(); handleSelectEntry(e); }}
                        className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors border-b border-gray-50 last:border-0">
                        <p className="text-sm font-bold text-indigo-700 font-mono">{e.part_number}</p>
                        <p className="text-xs text-gray-500 truncate">{e.description}</p>
                        <div className="flex gap-3 mt-0.5">
                          <span className="text-xs text-blue-600 font-semibold">QTY: {e.total_units}</span>
                          <span className="text-xs text-purple-600 font-semibold">Cajas: {e.total_boxes}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Resumen del entry seleccionado */}
              {selectedEntry && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Boxes className="h-3.5 w-3.5 text-blue-500" />
                      <p className="text-[10px] font-semibold text-gray-500 uppercase">QTY</p>
                    </div>
                    <p className="text-xl font-black text-blue-700">{selectedEntry.total_units.toLocaleString()}</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-2.5">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Archive className="h-3.5 w-3.5 text-purple-500" />
                      <p className="text-[10px] font-semibold text-gray-500 uppercase">Cajas</p>
                    </div>
                    <p className="text-xl font-black text-purple-700">{selectedEntry.total_boxes.toLocaleString()}</p>
                  </div>
                </div>
              )}

              {/* QTY */}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                  <Boxes className="h-3.5 w-3.5 inline mr-1 text-blue-400" />QTY de transferencia <span className="text-red-400">*</span>
                </label>
                <input type="number" value={qty} min={1} onChange={e => setQty(Number(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50" />
              </div>

              {/* PO */}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                  <ClipboardList className="h-3.5 w-3.5 inline mr-1 text-purple-400" />PO
                </label>
                <input type="text" value={po} onChange={e => setPo(e.target.value)} placeholder="Opcional"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50" />
              </div>

              {/* Locación (opcional) */}
              <div ref={locDropRef} className="relative">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                  <MapPin className="h-3.5 w-3.5 inline mr-1 text-amber-400" />Locación de origen (opcional)
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input type="text" value={locationSearch} onChange={e => handleLocSearch(e.target.value)}
                    onFocus={() => { if (locationSuggestions.length > 0) setShowLocDrop(true); }}
                    placeholder="Ej. A-05 (solo ocupadas)"
                    className={`w-full pl-9 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-gray-50 ${selectedLocation ? 'border-amber-400 bg-amber-50' : 'border-gray-200'}`} />
                </div>
                {showLocDrop && locationSuggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                    {locationSuggestions.map(l => (
                      <button key={l.id} type="button"
                        onMouseDown={(ev) => { ev.preventDefault(); handleSelectLocation(l); }}
                        className="w-full text-left px-4 py-2.5 hover:bg-amber-50 transition-colors border-b border-gray-50 last:border-0">
                        <p className="text-sm font-bold text-amber-700">{l.location_code}</p>
                        <p className="text-xs text-gray-400">Rack {l.rack}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Destino fijo */}
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <LogOut className="h-5 w-5 text-red-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500 font-semibold">Destino fijo</p>
                  <p className="text-base font-black text-red-600">KITTEO</p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={resetForm}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all">
                  <X className="h-4 w-4 inline mr-1" />Cancelar
                </button>
                <button type="button" onClick={handleSave} disabled={!selectedEntry || qty < 1 || saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)' }}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Registrar Transferencia
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
