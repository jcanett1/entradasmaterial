import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { MapPin, Package, CheckCircle2, XCircle, Search, Loader2, X, Save, RefreshCw } from 'lucide-react';

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
}

interface EntryOption {
  id: number;
  part_number: string;
  description: string | null;
  total_units: number;
  po: string | null;
}

const RACK_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  A: { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   badge: 'bg-blue-600' },
  B: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', badge: 'bg-indigo-600' },
  C: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', badge: 'bg-violet-600' },
  D: { bg: 'bg-emerald-50',border: 'border-emerald-200',text: 'text-emerald-700',badge: 'bg-emerald-600' },
  E: { bg: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-700',   badge: 'bg-teal-600' },
  F: { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  badge: 'bg-amber-500' },
  G: { bg: 'bg-rose-50',   border: 'border-rose-200',   text: 'text-rose-700',   badge: 'bg-rose-600' },
};

export function RacksPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRack, setSelectedRack] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [assignModal, setAssignModal] = useState<Location | null>(null);
  const [entries, setEntries] = useState<EntryOption[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<EntryOption | null>(null);
  const [entrySearch, setEntrySearch] = useState('');
  const [saving, setSaving] = useState(false);

  const racks = ['ALL', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];

  useEffect(() => { fetchLocations(); }, []);

  const fetchLocations = async () => {
    setRefreshing(true);
    const { data } = await supabase
      .from('locations')
      .select('*')
      .order('rack', { ascending: true })
      .order('location_code', { ascending: true });
    setLocations((data as Location[]) ?? []);
    setLoading(false);
    setTimeout(() => setRefreshing(false), 500);
  };

  const fetchEntries = async (term: string) => {
    const { data } = await supabase
      .from('entries')
      .select('id, part_number, description, total_units, po')
      .or(`part_number.ilike.%${term}%,description.ilike.%${term}%`)
      .order('registered_at', { ascending: false })
      .limit(20);
    setEntries((data as EntryOption[]) ?? []);
  };

  useEffect(() => {
    if (assignModal) fetchEntries('');
  }, [assignModal]);

  useEffect(() => {
    const t = setTimeout(() => { if (assignModal) fetchEntries(entrySearch); }, 250);
    return () => clearTimeout(t);
  }, [entrySearch]);

  // Filtrar locaciones
  const filtered = locations.filter((loc) => {
    const matchRack = selectedRack === 'ALL' || loc.rack === selectedRack;
    const term = searchTerm.toLowerCase();
    const matchSearch = !term ||
      loc.location_code.toLowerCase().includes(term) ||
      (loc.part_number ?? '').toLowerCase().includes(term) ||
      (loc.po ?? '').toLowerCase().includes(term);
    return matchRack && matchSearch;
  });

  // Estadísticas
  const stats = {
    total: locations.length,
    disponible: locations.filter(l => l.status === 'disponible').length,
    ocupado: locations.filter(l => l.status === 'ocupado').length,
  };

  const handleAssign = async () => {
    if (!assignModal || !selectedEntry) return;
    setSaving(true);
    await supabase.from('locations').update({
      status: 'ocupado',
      entry_id: selectedEntry.id,
      part_number: selectedEntry.part_number,
      qty: selectedEntry.total_units,
      po: selectedEntry.po,
      assigned_at: new Date().toISOString(),
    }).eq('id', assignModal.id);
    setSaving(false);
    setAssignModal(null);
    setSelectedEntry(null);
    setEntrySearch('');
    fetchLocations();
  };

  const handleRelease = async (loc: Location) => {
    if (!confirm(`¿Liberar la locación ${loc.location_code}?`)) return;
    await supabase.from('locations').update({
      status: 'disponible',
      entry_id: null,
      part_number: null,
      qty: null,
      po: null,
      assigned_at: null,
    }).eq('id', loc.id);
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
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Locaciones', value: stats.total, color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200' },
          { label: 'Disponibles', value: stats.disponible, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
          { label: 'Ocupadas', value: stats.ocupado, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} ${s.border} border rounded-2xl px-5 py-4 flex flex-col gap-1`}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Tabs de rack */}
        <div className="flex gap-1 flex-wrap">
          {racks.map(r => {
            const c = r !== 'ALL' ? RACK_COLORS[r] : null;
            const isActive = selectedRack === r;
            return (
              <button key={r} onClick={() => setSelectedRack(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  isActive
                    ? r === 'ALL'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : `${c!.badge} text-white border-transparent shadow-sm`
                    : r === 'ALL'
                      ? 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                      : `${c!.bg} ${c!.text} ${c!.border} hover:opacity-80`
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

        {/* Buscador */}
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar locación, part number, PO..."
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 w-64" />
        </div>

        {/* Refresh */}
        <button onClick={fetchLocations}
          className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Grid de locaciones */}
      {selectedRack === 'ALL' ? (
        // Vista agrupada por rack
        <div className="space-y-6">
          {['A','B','C','D','E','F','G'].map(rack => {
            const rackLocs = filtered.filter(l => l.rack === rack);
            if (rackLocs.length === 0) return null;
            const c = RACK_COLORS[rack];
            const occ = rackLocs.filter(l => l.status === 'ocupado').length;
            return (
              <div key={rack} className={`${c.bg} ${c.border} border rounded-2xl p-4`}>
                <div className="flex items-center gap-3 mb-3">
                  <span className={`${c.badge} text-white text-sm font-black px-3 py-1 rounded-lg`}>RACK {rack}</span>
                  <span className="text-xs text-gray-500">{rackLocs.length} locaciones · {occ} ocupadas · {rackLocs.length - occ} disponibles</span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
                  {rackLocs.map(loc => <LocationCell key={loc.id} loc={loc} colors={c} onAssign={() => setAssignModal(loc)} onRelease={() => handleRelease(loc)} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Vista de un solo rack
        <div className={`${RACK_COLORS[selectedRack].bg} ${RACK_COLORS[selectedRack].border} border rounded-2xl p-4`}>
          <div className="flex items-center gap-3 mb-3">
            <span className={`${RACK_COLORS[selectedRack].badge} text-white text-sm font-black px-3 py-1 rounded-lg`}>RACK {selectedRack}</span>
            <span className="text-xs text-gray-500">
              {filtered.length} locaciones · {filtered.filter(l => l.status === 'ocupado').length} ocupadas
            </span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
            {filtered.map(loc => (
              <LocationCell key={loc.id} loc={loc} colors={RACK_COLORS[selectedRack]}
                onAssign={() => setAssignModal(loc)} onRelease={() => handleRelease(loc)} />
            ))}
          </div>
        </div>
      )}

      {/* Modal de asignación */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-100">
                  <MapPin className="h-4 w-4 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Asignar a {assignModal.location_code}</h2>
                  <p className="text-xs text-gray-400">Selecciona el registro de inventario</p>
                </div>
              </div>
              <button onClick={() => { setAssignModal(null); setSelectedEntry(null); setEntrySearch(''); }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Buscador de entradas */}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">Buscar registro de inventario</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input type="text" value={entrySearch} onChange={e => setEntrySearch(e.target.value)}
                    placeholder="Part Number o descripción..."
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50" />
                </div>
              </div>

              {/* Lista de entradas */}
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
                      {entry.po && <span className="text-xs text-purple-600 font-semibold">PO: {entry.po}</span>}
                    </div>
                  </button>
                ))}
              </div>

              {/* Selección actual */}
              {selectedEntry && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
                  <p className="text-xs text-indigo-500 font-semibold mb-1">Seleccionado:</p>
                  <p className="text-sm font-bold text-indigo-800 font-mono">{selectedEntry.part_number}</p>
                  <p className="text-xs text-indigo-600">{selectedEntry.description}</p>
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
                  Asignar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Celda de locación ── */
function LocationCell({
  loc, colors, onAssign, onRelease,
}: {
  loc: Location;
  colors: { bg: string; border: string; text: string; badge: string };
  onAssign: () => void;
  onRelease: () => void;
}) {
  const isOccupied = loc.status === 'ocupado';
  return (
    <div
      title={isOccupied ? `${loc.part_number} | QTY: ${loc.qty}${loc.po ? ' | PO: ' + loc.po : ''}` : `${loc.location_code} — Disponible`}
      className={`relative rounded-xl border-2 p-2 text-center cursor-pointer transition-all hover:scale-105 active:scale-95 select-none ${
        isOccupied
          ? 'bg-red-50 border-red-300 hover:bg-red-100'
          : 'bg-white border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
      }`}
      onClick={isOccupied ? onRelease : onAssign}
    >
      {/* Indicador de estado */}
      <div className={`absolute top-1 right-1 h-2 w-2 rounded-full ${isOccupied ? 'bg-red-500' : 'bg-emerald-400'}`} />

      {/* Código */}
      <p className={`text-xs font-bold leading-tight ${isOccupied ? 'text-red-700' : 'text-gray-600'}`}>
        {loc.location_code}
      </p>

      {/* Ícono */}
      <div className="mt-1 flex justify-center">
        {isOccupied
          ? <Package className="h-3.5 w-3.5 text-red-400" />
          : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        }
      </div>

      {/* Part Number truncado */}
      {isOccupied && loc.part_number && (
        <p className="text-[9px] text-red-600 font-mono truncate mt-0.5 max-w-full leading-tight">
          {loc.part_number.slice(0, 8)}…
        </p>
      )}
    </div>
  );
}
