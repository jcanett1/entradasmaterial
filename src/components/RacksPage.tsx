import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  MapPin, Package, CheckCircle2, Search, Loader2, X, Save,
  RefreshCw, LogOut, Unlock, Hash, Boxes, ClipboardList, Calendar,
  AlertTriangle, Plus, Layers, Archive,
} from 'lucide-react';

const MAX_ITEMS = 8;

/* ── Tipos ── */
interface LocationItem {
  id: number;
  location_id: number;
  location_code: string;
  entry_id: number | null;
  part_number: string;
  po: string | null;
  qty: number;
  boxes: number;
  fifo_number: number | null;
  assigned_at: string;
}

interface Location {
  id: number;
  rack: string;
  location_code: string;
  description: string | null;
  status: 'disponible' | 'ocupado';
  entry_id: number | null;
  part_number: string | null;
  qty: number | null;
  po: string | null;
  assigned_at: string | null;
  // items cargados en frontend
  items?: LocationItem[];
}

interface EntryOption {
  id: number;
  part_number: string;
  description: string | null;
  total_units: number;
  total_boxes: number;
  po: string | null;
}

const RACK_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  A: { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    badge: 'bg-blue-600' },
  B: { bg: 'bg-indigo-50',  border: 'border-indigo-200',  text: 'text-indigo-700',  badge: 'bg-indigo-600' },
  C: { bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-700',  badge: 'bg-violet-600' },
  D: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-600' },
  E: { bg: 'bg-teal-50',    border: 'border-teal-200',    text: 'text-teal-700',    badge: 'bg-teal-600' },
  F: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   badge: 'bg-amber-500' },
  G: { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    badge: 'bg-rose-600' },
};

/* ════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
════════════════════════════════════════════════════ */
export function RacksPage() {
  const { session } = useAuth();
  const userDisplayName = session?.nombre_completo || session?.email || '';
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRack, setSelectedRack] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal asignar / agregar item
  const [assignModal, setAssignModal] = useState<Location | null>(null);
  const [entries, setEntries] = useState<EntryOption[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<EntryOption | null>(null);
  const [entrySearch, setEntrySearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal detalle
  const [detailModal, setDetailModal] = useState<Location | null>(null);
  const [actionSaving, setActionSaving] = useState(false);

  const racks = ['ALL', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];

  /* ── Fetch ── */
  const fetchLocations = useCallback(async () => {
    setRefreshing(true);
    // 1. Traer locaciones
    const { data: locsData } = await supabase
      .from('locations')
      .select('*')
      .order('rack', { ascending: true })
      .order('location_code', { ascending: true });

    const locs: Location[] = (locsData as Location[]) ?? [];

    // 2. Traer todos los location_items
    const { data: itemsData } = await supabase
      .from('location_items')
      .select('*')
      .order('assigned_at', { ascending: true });

    const rawItems = (itemsData as Omit<LocationItem, 'boxes'>[]) ?? [];

    // 3. Obtener total_boxes de las entries relacionadas
    const entryIds = [...new Set(rawItems.map(i => i.entry_id).filter((id): id is number => id !== null))];
    let boxesMap: Record<number, number> = {};
    if (entryIds.length > 0) {
      const { data: entriesData } = await supabase
        .from('entries')
        .select('id, total_boxes')
        .in('id', entryIds);
      (entriesData ?? []).forEach((e: { id: number; total_boxes: number }) => {
        boxesMap[e.id] = e.total_boxes;
      });
    }

    // 4. Enriquecer items con boxes
    const items: LocationItem[] = rawItems.map(item => ({
      ...item,
      boxes: item.entry_id ? (boxesMap[item.entry_id] ?? 0) : 0,
    }));

    // 5. Unir items a sus locaciones
    const locsWithItems = locs.map(loc => ({
      ...loc,
      items: items.filter(it => it.location_id === loc.id),
    }));

    setLocations(locsWithItems);
    setLoading(false);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  /* ── Fetch entries para el modal (excluye los ya asignados a alguna locación) ── */
  const fetchEntries = useCallback(async (term: string) => {
    // 1. Obtener todos los entry_id que ya están asignados en location_items
    const { data: assignedData } = await supabase
      .from('location_items')
      .select('entry_id');
    const assignedIds: number[] = (assignedData ?? [])
      .map((r: { entry_id: number | null }) => r.entry_id)
      .filter((id): id is number => id !== null);

    // 2. Buscar entries excluyendo los ya asignados
    let query = supabase
      .from('entries')
      .select('id, part_number, description, total_units, total_boxes, po')
      .order('registered_at', { ascending: false });
    if (term.trim()) {
      query = query.or(`part_number.ilike.%${term}%,description.ilike.%${term}%`);
    }
    if (assignedIds.length > 0) {
      query = query.not('id', 'in', `(${assignedIds.join(',')})`);
    }
    const { data } = await query;
    setEntries((data as EntryOption[]) ?? []);
  }, []);

  useEffect(() => {
    if (assignModal) fetchEntries('');
  }, [assignModal, fetchEntries]);

  useEffect(() => {
    const t = setTimeout(() => { if (assignModal) fetchEntries(entrySearch); }, 250);
    return () => clearTimeout(t);
  }, [entrySearch, assignModal, fetchEntries]);

  /* ── Filtrar ── */
  const filtered = locations.filter((loc) => {
    const matchRack = selectedRack === 'ALL' || loc.rack === selectedRack;
    const term = searchTerm.toLowerCase();
    const itemsMatch = (loc.items ?? []).some(it =>
      it.part_number.toLowerCase().includes(term) ||
      (it.po ?? '').toLowerCase().includes(term)
    );
    const matchSearch = !term ||
      loc.location_code.toLowerCase().includes(term) ||
      (loc.part_number ?? '').toLowerCase().includes(term) ||
      (loc.po ?? '').toLowerCase().includes(term) ||
      itemsMatch;
    return matchRack && matchSearch;
  });

  const stats = {
    total: locations.length,
    disponible: locations.filter(l => (l.items?.length ?? 0) === 0).length,
    ocupado: locations.filter(l => (l.items?.length ?? 0) > 0).length,
  };

  /* ── Asignar / Agregar item ── */
  const handleAssign = async () => {
    if (!assignModal || !selectedEntry) return;
    const currentItems = assignModal.items ?? [];
    if (currentItems.length >= MAX_ITEMS) return;

    setSaving(true);

    // Obtener FIFO específico del entry seleccionado (por entry_id)
    const { data: fifoLabel } = await supabase
      .from('fifo_labels')
      .select('fifo_number')
      .eq('entry_id', selectedEntry.id)
      .maybeSingle();
    const fifoNumber = fifoLabel?.fifo_number ?? null;

    // Insertar en location_items
    await supabase.from('location_items').insert([{
      location_id: assignModal.id,
      location_code: assignModal.location_code,
      entry_id: selectedEntry.id,
      part_number: selectedEntry.part_number,
      po: selectedEntry.po,
      qty: selectedEntry.total_units,
      fifo_number: fifoNumber,
      assigned_at: new Date().toISOString(),
    }]);

    // Actualizar la tabla locations para marcar como ocupado (compatibilidad)
    const isFirstItem = currentItems.length === 0;
    if (isFirstItem) {
      await supabase.from('locations').update({
        status: 'ocupado',
        entry_id: selectedEntry.id,
        part_number: selectedEntry.part_number,
        qty: selectedEntry.total_units,
        po: selectedEntry.po,
        assigned_at: new Date().toISOString(),
      }).eq('id', assignModal.id);
    }

    setSaving(false);
    setAssignModal(null);
    setSelectedEntry(null);
    setEntrySearch('');
    fetchLocations();
  };

  /* ── Liberar item individual ── */
  const handleReleaseItem = async (loc: Location, item: LocationItem) => {
    setActionSaving(true);
    await supabase.from('location_items').delete().eq('id', item.id);

    // Si era el último item, liberar la locación
    const remaining = (loc.items ?? []).filter(i => i.id !== item.id);
    if (remaining.length === 0) {
      await supabase.from('locations').update({
        status: 'disponible',
        entry_id: null,
        part_number: null,
        qty: null,
        po: null,
        assigned_at: null,
      }).eq('id', loc.id);
    } else {
      // Actualizar el campo principal con el primer item restante
      const first = remaining[0];
      await supabase.from('locations').update({
        entry_id: first.entry_id,
        part_number: first.part_number,
        qty: first.qty,
        po: first.po,
      }).eq('id', loc.id);
    }

    setActionSaving(false);
    setDetailModal(null);
    fetchLocations();
  };

  /* ── Salida KITTEO item individual ── */
  const handleExitItem = async (loc: Location, item: LocationItem) => {
    setActionSaving(true);

    // Registrar salida con boxes
    await supabase.from('exits').insert([{
      part_number: item.part_number,
      description: null,
      qty: item.qty,
      boxes: item.boxes,
      po: item.po,
      location_code: loc.location_code,
      location_id: loc.id,
      entry_id: item.entry_id,
      destination: 'KITTEO',
      registered_by: userDisplayName || null,
    }]);

    // Eliminar el item
    await supabase.from('location_items').delete().eq('id', item.id);

    // Si era el último, liberar locación
    const remaining = (loc.items ?? []).filter(i => i.id !== item.id);
    if (remaining.length === 0) {
      await supabase.from('locations').update({
        status: 'disponible',
        entry_id: null,
        part_number: null,
        qty: null,
        po: null,
        assigned_at: null,
      }).eq('id', loc.id);
    } else {
      const first = remaining[0];
      await supabase.from('locations').update({
        entry_id: first.entry_id,
        part_number: first.part_number,
        qty: first.qty,
        po: first.po,
      }).eq('id', loc.id);
    }

    setActionSaving(false);
    setDetailModal(null);
    fetchLocations();
  };

  /* ── Liberar toda la locación ── */
  const handleReleaseAll = async (loc: Location) => {
    if (!confirm(`¿Liberar toda la locación ${loc.location_code}? Se eliminarán todos los ${loc.items?.length ?? 0} números de parte asignados.`)) return;
    setActionSaving(true);
    await supabase.from('location_items').delete().eq('location_id', loc.id);
    await supabase.from('locations').update({
      status: 'disponible',
      entry_id: null,
      part_number: null,
      qty: null,
      po: null,
      assigned_at: null,
    }).eq('id', loc.id);
    setActionSaving(false);
    setDetailModal(null);
    fetchLocations();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-12 w-12 text-indigo-500 animate-spin" />
        <p className="text-gray-500 mt-4 font-medium">Cargando locaciones...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Stats globales */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Locaciones', value: stats.total,      color: 'text-gray-700',    bg: 'bg-gray-50',    border: 'border-gray-200' },
          { label: 'Disponibles',      value: stats.disponible, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
          { label: 'Ocupadas',         value: stats.ocupado,    color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200' },
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
            return (
              <button key={r} onClick={() => setSelectedRack(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  isActive
                    ? r === 'ALL' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : `${c!.badge} text-white border-transparent shadow-sm`
                    : r === 'ALL' ? 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300' : `${c!.bg} ${c!.text} ${c!.border} hover:opacity-80`
                }`}>
                {r === 'ALL' ? 'Todos' : `Rack ${r}`}
                {r !== 'ALL' && (
                  <span className={`ml-1.5 text-xs ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                    ({locations.filter(l => l.rack === r).length})
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar locación, part number, PO..."
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 w-64" />
        </div>
        <button onClick={fetchLocations}
          className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Grid de locaciones */}
      {selectedRack === 'ALL' ? (
        <div className="space-y-6">
          {['A','B','C','D','E','F','G'].map(rack => {
            const rackLocs = filtered.filter(l => l.rack === rack);
            if (rackLocs.length === 0) return null;
            const c = RACK_COLORS[rack];
            const occ = rackLocs.filter(l => (l.items?.length ?? 0) > 0).length;
            // Conteo de inventario del rack
            const allItems = rackLocs.flatMap(l => l.items ?? []);
            const totalQty = allItems.reduce((s, i) => s + i.qty, 0);
            const totalBoxes = allItems.reduce((s, i) => s + i.boxes, 0);
            return (
              <div key={rack} className={`${c.bg} ${c.border} border rounded-2xl p-4`}>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span className={`${c.badge} text-white text-sm font-black px-3 py-1 rounded-lg`}>RACK {rack}</span>
                  <span className="text-xs text-gray-500">{rackLocs.length} locaciones · {occ} ocupadas · {rackLocs.length - occ} disponibles</span>
                  {/* Contadores de inventario del rack */}
                  {totalQty > 0 && (
                    <div className="flex items-center gap-2 ml-auto flex-wrap">
                      <div className="flex items-center gap-1.5 bg-blue-100 border border-blue-200 rounded-lg px-3 py-1">
                        <Boxes className="h-3.5 w-3.5 text-blue-600" />
                        <span className="text-xs font-bold text-blue-700">QTY: {totalQty.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-purple-100 border border-purple-200 rounded-lg px-3 py-1">
                        <Archive className="h-3.5 w-3.5 text-purple-600" />
                        <span className="text-xs font-bold text-purple-700">Cajas: {totalBoxes.toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {rackLocs.map(loc => (
                    <LocationCell key={loc.id} loc={loc} colors={c}
                      onAssign={() => setAssignModal(loc)}
                      onDetail={() => setDetailModal(loc)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        (() => {
          const rackLocs = filtered;
          const c = RACK_COLORS[selectedRack];
          const allItems = rackLocs.flatMap(l => l.items ?? []);
          const totalQty = allItems.reduce((s, i) => s + i.qty, 0);
          const totalBoxes = allItems.reduce((s, i) => s + i.boxes, 0);
          return (
            <div className={`${c.bg} ${c.border} border rounded-2xl p-4`}>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className={`${c.badge} text-white text-sm font-black px-3 py-1 rounded-lg`}>RACK {selectedRack}</span>
                <span className="text-xs text-gray-500">
                  {filtered.length} locaciones · {filtered.filter(l => (l.items?.length ?? 0) > 0).length} ocupadas
                </span>
                {/* Contadores de inventario del rack */}
                {totalQty > 0 && (
                  <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <div className="flex items-center gap-1.5 bg-blue-100 border border-blue-200 rounded-lg px-3 py-1">
                      <Boxes className="h-3.5 w-3.5 text-blue-600" />
                      <span className="text-xs font-bold text-blue-700">QTY Total: {totalQty.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-purple-100 border border-purple-200 rounded-lg px-3 py-1">
                      <Archive className="h-3.5 w-3.5 text-purple-600" />
                      <span className="text-xs font-bold text-purple-700">Cajas Total: {totalBoxes.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {filtered.map(loc => (
                  <LocationCell key={loc.id} loc={loc} colors={c}
                    onAssign={() => setAssignModal(loc)}
                    onDetail={() => setDetailModal(loc)} />
                ))}
              </div>
            </div>
          );
        })()
      )}

      {/* ══════════════════════════════════════════════
          MODAL DETALLE
      ══════════════════════════════════════════════ */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${(detailModal.items?.length ?? 0) > 0 ? 'bg-red-100' : 'bg-emerald-100'}`}>
                  <MapPin className={`h-4 w-4 ${(detailModal.items?.length ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">{detailModal.location_code}</h2>
                  <div className="flex items-center gap-2">
                    {(detailModal.items?.length ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />
                        Ocupado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                        Disponible
                      </span>
                    )}
                    <span className="text-xs text-gray-400 font-medium">
                      {detailModal.items?.length ?? 0}/{MAX_ITEMS} números de parte
                    </span>
                  </div>
                </div>
              </div>
              <button onClick={() => setDetailModal(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Resumen de inventario de la locación */}
            {(detailModal.items?.length ?? 0) > 0 && (() => {
              const locItems = detailModal.items ?? [];
              const locQty = locItems.reduce((s, i) => s + i.qty, 0);
              const locBoxes = locItems.reduce((s, i) => s + i.boxes, 0);
              return (
                <div className="px-6 pt-4 flex-shrink-0">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                      <Boxes className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">QTY Total</p>
                        <p className="text-lg font-black text-blue-700">{locQty.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-xl px-4 py-2.5">
                      <Archive className="h-4 w-4 text-purple-500 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Cajas Total</p>
                        <p className="text-lg font-black text-purple-700">{locBoxes.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Barra de capacidad */}
            <div className="px-6 pt-2 flex-shrink-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Capacidad utilizada</span>
                <span className={`text-xs font-bold ${(detailModal.items?.length ?? 0) >= MAX_ITEMS ? 'text-red-600' : 'text-gray-600'}`}>
                  {detailModal.items?.length ?? 0} / {MAX_ITEMS}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    (detailModal.items?.length ?? 0) >= MAX_ITEMS ? 'bg-red-500' :
                    (detailModal.items?.length ?? 0) >= 6 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${((detailModal.items?.length ?? 0) / MAX_ITEMS) * 100}%` }}
                />
              </div>
              {(detailModal.items?.length ?? 0) >= MAX_ITEMS && (
                <div className="flex items-center gap-1.5 mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                  <p className="text-xs font-semibold text-red-600">Locación llena — máximo {MAX_ITEMS} números de parte</p>
                </div>
              )}
            </div>

            {/* Lista de items */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {(detailModal.items?.length ?? 0) === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-300" />
                  <p className="text-sm font-medium">Locación disponible</p>
                </div>
              ) : (
                detailModal.items?.map((item, idx) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    index={idx}
                    loc={detailModal}
                    actionSaving={actionSaving}
                    onRelease={() => handleReleaseItem(detailModal, item)}
                    onExit={() => handleExitItem(detailModal, item)}
                  />
                ))
              )}
            </div>

            {/* Footer acciones */}
            <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 space-y-2">
              {/* Agregar otro número de parte */}
              {(detailModal.items?.length ?? 0) < MAX_ITEMS && (
                <button
                  onClick={() => { setAssignModal(detailModal); setDetailModal(null); }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}>
                  <Plus className="h-4 w-4" />
                  Agregar número de parte ({(detailModal.items?.length ?? 0)}/{MAX_ITEMS})
                </button>
              )}
              {/* Liberar toda la locación */}
              {(detailModal.items?.length ?? 0) > 0 && (
                <button
                  onClick={() => handleReleaseAll(detailModal)}
                  disabled={actionSaving}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 transition-all disabled:opacity-50">
                  {actionSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                  Liberar toda la locación
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          MODAL ASIGNAR
      ══════════════════════════════════════════════ */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-100">
                  <MapPin className="h-4 w-4 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">
                    {(assignModal.items?.length ?? 0) === 0 ? 'Asignar a' : 'Agregar a'} {assignModal.location_code}
                  </h2>
                  <p className="text-xs text-gray-400">
                    {(assignModal.items?.length ?? 0)}/{MAX_ITEMS} números de parte asignados
                  </p>
                </div>
              </div>
              <button onClick={() => { setAssignModal(null); setSelectedEntry(null); setEntrySearch(''); }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Advertencia si está llena */}
            {(assignModal.items?.length ?? 0) >= MAX_ITEMS ? (
              <div className="p-6">
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-4">
                  <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-700">Locación llena</p>
                    <p className="text-xs text-red-600 mt-1">
                      Esta locación ya tiene el máximo de {MAX_ITEMS} números de parte.
                      Debes dar salida o liberar alguno antes de agregar otro.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setAssignModal(null); setSelectedEntry(null); setEntrySearch(''); }}
                  className="mt-4 w-full px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all">
                  Cerrar
                </button>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                {/* Advertencia cerca del límite */}
                {(assignModal.items?.length ?? 0) >= 6 && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    <p className="text-xs font-semibold text-amber-700">
                      Quedan {MAX_ITEMS - (assignModal.items?.length ?? 0)} espacio(s) disponibles en esta locación
                    </p>
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                    Buscar registro de inventario
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <input type="text" value={entrySearch} onChange={e => setEntrySearch(e.target.value)}
                      placeholder="Part Number o descripción..."
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50" />
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {entries.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-6">Sin resultados</p>
                  ) : entries.map(entry => (
                    <button key={entry.id} type="button"
                      onClick={() => setSelectedEntry(entry)}
                      className={`w-full text-left px-4 py-3 transition-colors hover:bg-indigo-50 ${selectedEntry?.id === entry.id ? 'bg-indigo-50 border-l-2 border-indigo-500' : ''}`}>
                      <p className="text-sm font-bold text-indigo-700 font-mono">{entry.part_number}</p>
                      <p className="text-xs text-gray-500 truncate">{entry.description}</p>
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs text-blue-600 font-semibold">QTY: {entry.total_units}</span>
                        <span className="text-xs text-purple-600 font-semibold">Cajas: {entry.total_boxes}</span>
                        {entry.po && <span className="text-xs text-gray-500 font-semibold">PO: {entry.po}</span>}
                      </div>
                    </button>
                  ))}
                </div>

                {selectedEntry && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-indigo-500 font-semibold mb-1">Seleccionado:</p>
                    <p className="text-sm font-bold text-indigo-800 font-mono">{selectedEntry.part_number}</p>
                    <p className="text-xs text-indigo-600">{selectedEntry.description}</p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-blue-600 font-semibold">QTY: {selectedEntry.total_units}</span>
                      <span className="text-xs text-purple-600 font-semibold">Cajas: {selectedEntry.total_boxes}</span>
                      {selectedEntry.po && <span className="text-xs text-gray-500 font-semibold">PO: {selectedEntry.po}</span>}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button type="button"
                    onClick={() => { setAssignModal(null); setSelectedEntry(null); setEntrySearch(''); }}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all">
                    Cancelar
                  </button>
                  <button type="button" onClick={handleAssign} disabled={!selectedEntry || saving}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {(assignModal.items?.length ?? 0) === 0 ? 'Asignar' : 'Agregar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   CELDA DE LOCACIÓN — muestra sub-cuadros internos
════════════════════════════════════════════════════ */
function LocationCell({
  loc, colors, onAssign, onDetail,
}: {
  loc: Location;
  colors: { bg: string; border: string; text: string; badge: string };
  onAssign: () => void;
  onDetail: () => void;
}) {
  const items = loc.items ?? [];
  const isOccupied = items.length > 0;
  const isFull = items.length >= MAX_ITEMS;
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const totalBoxes = items.reduce((s, i) => s + i.boxes, 0);

  return (
    <div
      className={`relative rounded-xl border-2 p-2 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 select-none ${
        isFull
          ? 'bg-red-50 border-red-400 hover:bg-red-100'
          : isOccupied
          ? 'bg-orange-50 border-orange-300 hover:bg-orange-100'
          : 'bg-white border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
      }`}
      onClick={isOccupied ? onDetail : onAssign}
      title={isOccupied
        ? `${loc.location_code} — ${items.length}/${MAX_ITEMS} · QTY: ${totalQty} · Cajas: ${totalBoxes}`
        : `${loc.location_code} — Disponible · Clic para asignar`}
    >
      {/* Indicador de estado */}
      <div className={`absolute top-1 right-1 h-2 w-2 rounded-full ${
        isFull ? 'bg-red-500' : isOccupied ? 'bg-orange-400' : 'bg-emerald-400'
      }`} />

      {/* Código de locación */}
      <p className={`text-xs font-bold leading-tight ${
        isFull ? 'text-red-700' : isOccupied ? 'text-orange-700' : 'text-gray-600'
      }`}>
        {loc.location_code}
      </p>

      {/* Contenido */}
      {!isOccupied ? (
        <div className="mt-1 flex justify-center">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        </div>
      ) : (
        <div className="mt-1.5 space-y-1">
          {/* Sub-cuadros por cada número de parte */}
          {items.map((item, idx) => (
            <div
              key={item.id}
              className={`rounded px-1 py-0.5 ${
                idx % 2 === 0
                  ? 'bg-indigo-100 border border-indigo-200'
                  : 'bg-purple-100 border border-purple-200'
              }`}
            >
              <p className={`text-[8px] font-mono font-bold truncate leading-tight ${
                idx % 2 === 0 ? 'text-indigo-700' : 'text-purple-700'
              }`}>
                {item.part_number.length > 10 ? item.part_number.slice(0, 10) + '…' : item.part_number}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[7px] text-gray-500 font-semibold">
                  {item.qty} uds
                </span>
                {item.boxes > 0 && (
                  <span className="text-[7px] text-purple-600 font-semibold">
                    {item.boxes}cj
                  </span>
                )}
                {item.fifo_number && (
                  <span className="text-[7px] text-amber-600 font-bold">
                    F{item.fifo_number}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Espacios vacíos restantes */}
          {items.length < MAX_ITEMS && (
            <div className="flex items-center gap-0.5 mt-0.5">
              {Array.from({ length: MAX_ITEMS - items.length }).map((_, i) => (
                <div key={i} className="h-1.5 flex-1 rounded-sm bg-gray-200 opacity-60" />
              ))}
            </div>
          )}

          {/* Contador + totales */}
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-0.5">
              <Layers className="h-2.5 w-2.5 text-gray-400" />
              <span className="text-[8px] text-gray-500 font-semibold">{items.length}/{MAX_ITEMS}</span>
            </div>
            {isFull && (
              <span className="text-[7px] font-bold text-red-500 uppercase">LLENO</span>
            )}
          </div>
          {/* Totales QTY y Cajas en la celda */}
          <div className="flex gap-1 mt-0.5">
            <span className="text-[7px] font-bold text-blue-600 bg-blue-50 rounded px-1">Q:{totalQty}</span>
            {totalBoxes > 0 && (
              <span className="text-[7px] font-bold text-purple-600 bg-purple-50 rounded px-1">C:{totalBoxes}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   TARJETA DE ITEM dentro del modal de detalle
════════════════════════════════════════════════════ */
function ItemCard({
  item, index, loc, actionSaving, onRelease, onExit,
}: {
  item: LocationItem;
  index: number;
  loc: Location;
  actionSaving: boolean;
  onRelease: () => void;
  onExit: () => void;
}) {
  const colors = [
    { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-800', badge: 'bg-indigo-600' },
    { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', badge: 'bg-purple-600' },
    { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-800',   badge: 'bg-blue-600' },
    { bg: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-800',   badge: 'bg-teal-600' },
    { bg: 'bg-emerald-50',border: 'border-emerald-200',text: 'text-emerald-800',badge: 'bg-emerald-600' },
    { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-800',  badge: 'bg-amber-600' },
    { bg: 'bg-rose-50',   border: 'border-rose-200',   text: 'text-rose-800',   badge: 'bg-rose-600' },
    { bg: 'bg-cyan-50',   border: 'border-cyan-200',   text: 'text-cyan-800',   badge: 'bg-cyan-600' },
  ];
  const c = colors[index % colors.length];

  return (
    <div className={`${c.bg} ${c.border} border rounded-xl p-3`}>
      {/* Encabezado del item */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className={`${c.badge} text-white text-[10px] font-black px-1.5 py-0.5 rounded`}>
            #{index + 1}
          </span>
          <p className={`text-sm font-black font-mono ${c.text}`}>{item.part_number}</p>
        </div>
      </div>

      {/* Datos en grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* QTY */}
        <div className="bg-white/70 rounded-lg px-2 py-1.5">
          <div className="flex items-center gap-1 mb-0.5">
            <Boxes className="h-3 w-3 text-gray-400" />
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">QTY</p>
          </div>
          <p className="text-sm font-black text-gray-800">{item.qty.toLocaleString()}</p>
        </div>

        {/* Cajas */}
        <div className="bg-white/70 rounded-lg px-2 py-1.5">
          <div className="flex items-center gap-1 mb-0.5">
            <Archive className="h-3 w-3 text-gray-400" />
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Cajas</p>
          </div>
          <p className="text-sm font-black text-purple-700">{item.boxes > 0 ? item.boxes.toLocaleString() : '—'}</p>
        </div>

        {/* FIFO */}
        <div className="bg-white/70 rounded-lg px-2 py-1.5">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-amber-500 font-black text-xs">#</span>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">FIFO</p>
          </div>
          <p className="text-sm font-black text-amber-700">
            {item.fifo_number !== null ? `FIFO ${item.fifo_number}` : '—'}
          </p>
        </div>

        {/* PO */}
        <div className="bg-white/70 rounded-lg px-2 py-1.5">
          <div className="flex items-center gap-1 mb-0.5">
            <ClipboardList className="h-3 w-3 text-gray-400" />
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">PO</p>
          </div>
          <p className="text-sm font-bold text-gray-800 font-mono">{item.po ?? '—'}</p>
        </div>

        {/* Fecha */}
        <div className="bg-white/70 rounded-lg px-2 py-1.5 col-span-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Calendar className="h-3 w-3 text-gray-400" />
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Fecha de entrada</p>
          </div>
          <p className="text-xs font-semibold text-gray-700">
            {new Date(item.assigned_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
          </p>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="flex gap-2">
        <button
          onClick={onRelease}
          disabled={actionSaving}
          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all disabled:opacity-50">
          {actionSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />}
          Liberar
        </button>
        <button
          onClick={onExit}
          disabled={actionSaving}
          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)' }}>
          {actionSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
          Salida KITTEO
        </button>
      </div>
    </div>
  );
}
