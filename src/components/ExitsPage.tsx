import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  LogOut, Search, Loader2, Save, X, Hash, Boxes, ClipboardList,
  MapPin, RefreshCw, Calendar, User, Package, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight,
} from 'lucide-react';

interface Exit {
  id: number;
  part_number: string;
  description: string | null;
  qty: number;
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
  po: string | null;
}

interface LocationOption {
  id: number;
  location_code: string;
  rack: string;
}

const PAGE_SIZE = 25;

export function ExitsPage() {
  const { session } = useAuth();
  const userEmail = session?.user?.email ?? '';

  const [exits, setExits] = useState<Exit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Formulario
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
      .from('exits')
      .select('*')
      .order('exited_at', { ascending: false });
    setExits((data as Exit[]) ?? []);
    setLoading(false);
    setTimeout(() => setRefreshing(false), 500);
  };

  const fetchEntries = useCallback(async (term: string) => {
    const { data } = await supabase
      .from('entries')
      .select('id, part_number, description, total_units, po')
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
    await supabase.from('exits').insert([{
      part_number: selectedEntry.part_number,
      description: selectedEntry.description,
      qty,
      po: po || null,
      location_code: selectedLocation?.location_code ?? null,
      location_id: selectedLocation?.id ?? null,
      entry_id: selectedEntry.id,
      destination: 'KITTEO',
      registered_by: userEmail,
    }]);

    // Si había locación asignada, liberarla
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
            Salidas — KITTEO
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Todas las salidas tienen como destino KITTEO</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchExits}
            className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-md transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)' }}>
            <LogOut className="h-4 w-4" />
            Nueva Salida
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Salidas</p>
          <p className="text-3xl font-black text-red-600">{exits.length}</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Destino</p>
          <p className="text-2xl font-black text-orange-600">KITTEO</p>
        </div>
      </div>

      {/* Tabla de salidas */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-10 w-10 text-red-400 animate-spin" /></div>
      ) : exits.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="p-5 bg-red-50 rounded-3xl mb-4"><LogOut className="h-12 w-12 text-red-300" /></div>
          <p className="text-gray-600 font-semibold">Sin salidas registradas</p>
          <p className="text-gray-400 text-sm mt-1">Usa el botón <span className="text-red-500 font-medium">Nueva Salida</span> para registrar</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {[
                    { icon: <Hash className="h-3.5 w-3.5" />, label: 'Part Number' },
                    { icon: <Boxes className="h-3.5 w-3.5" />, label: 'QTY', center: true },
                    { icon: <ClipboardList className="h-3.5 w-3.5" />, label: 'PO' },
                    { icon: <MapPin className="h-3.5 w-3.5" />, label: 'Locación' },
                    { icon: <LogOut className="h-3.5 w-3.5" />, label: 'Destino', center: true },
                    { icon: <User className="h-3.5 w-3.5" />, label: 'Registrado Por' },
                    { icon: <Calendar className="h-3.5 w-3.5" />, label: 'Fecha' },
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
                    <td className="px-5 py-4">
                      <span className="inline-flex px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 font-mono text-sm font-semibold border border-indigo-100">
                        {exit.part_number}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex items-center justify-center min-w-[56px] px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 font-bold text-sm border border-blue-100">
                        {exit.qty.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {exit.po ? (
                        <span className="inline-flex px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 font-mono text-sm font-semibold border border-purple-100">{exit.po}</span>
                      ) : <span className="text-gray-400 italic text-sm">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      {exit.location_code ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-sm font-semibold border border-amber-100">
                          <MapPin className="h-3 w-3" />{exit.location_code}
                        </span>
                      ) : <span className="text-gray-400 italic text-sm">—</span>}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex px-3 py-1.5 rounded-full bg-red-50 text-red-600 text-xs font-bold border border-red-100">
                        {exit.destination}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-red-600 text-xs font-bold uppercase">{(exit.registered_by ?? '?')[0]}</span>
                        </div>
                        <span className="text-sm text-gray-600 truncate max-w-[120px]">{exit.registered_by}</span>
                      </div>
                    </td>
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
                  </tr>
                ))}
              </tbody>
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

      {/* Modal Nueva Salida */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-red-100">
                  <LogOut className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Nueva Salida</h2>
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
                        <span className="text-xs text-blue-600 font-semibold">QTY: {e.total_units}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* QTY */}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                  <Boxes className="h-3.5 w-3.5 inline mr-1 text-blue-400" />QTY <span className="text-red-400">*</span>
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
                  Registrar Salida
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
