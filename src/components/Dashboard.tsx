import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Entry, NewEntry } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { InventoryForm } from './InventoryForm';
import type { MultiEntry } from './InventoryForm';
import { InventoryTable } from './InventoryTable';
import { LabelModal } from './LabelModal';
import { MultiLabelModal } from './MultiLabelModal';
import { UserManagementDropdown } from './UserManagementDropdown';
import { RacksPage } from './RacksPage';
import { ExitsPage } from './ExitsPage';
import { KitteoPage } from './KitteoPage';
import {
  Package, Plus, X, RefreshCw, Download,
  LayoutDashboard, ClipboardList, Search,
  MapPin, LogOut, Tags, XCircle, ArrowRightFromLine, AlertTriangle,
} from 'lucide-react';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';

type MainTab = 'inventario' | 'racks' | 'kitteo';
type RackSubTab = 'locaciones' | 'salidas';

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
  const { userProfile, signOut, isAdmin, userRol } = useAuth();

  // ── Tabs ──
  const [mainTab, setMainTab] = useState<MainTab>('inventario');
  const [rackSubTab, setRackSubTab] = useState<RackSubTab>('locaciones');

  // ── Inventario ──
  const [records, setRecords] = useState<Entry[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Entry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({ total: 0, units: 0, boxes: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [labelRecord, setLabelRecord] = useState<Entry | null>(null);

  // ── IDs de entries ya asignados a una locación (para bloqueo en tabla) ──
  const [assignedEntryIds, setAssignedEntryIds] = useState<Set<number>>(new Set());
  // Mapa de entry_id → location_code para mostrar la leyenda
  const [assignedEntryLocations, setAssignedEntryLocations] = useState<Record<number, string>>({});
  const [assignedEntriesError, setAssignedEntriesError] = useState<string | null>(null);

  // ── Selección múltiple ──
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showMultiLabel, setShowMultiLabel] = useState(false);

  /* =======================
     FETCH
  ======================= */
  const fetchRecords = async () => {
    setRefreshing(true);
    setLoading(true);
    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .order('registered_at', { ascending: false });
    if (error) console.error('Error fetching records:', error);
    else {
      const normalizedRecords = (data ?? []).map(record => ({
        ...record,
        id: toEntryId(record.id) ?? record.id,
      })) as Entry[];
      setRecords(normalizedRecords);
    }
    setLoading(false);
    setTimeout(() => setRefreshing(false), 600);
  };

  /* Fetch de entries asignados a locaciones */
  const fetchAssignedEntries = useCallback(async () => {
    setAssignedEntriesError(null);

    const [itemsResult, locationsResult, fifoResult] = await Promise.all([
      supabase.from('location_items').select('entry_id, location_code, part_number, po, fifo_number'),
      supabase.from('locations').select('entry_id, location_code').not('entry_id', 'is', null),
      supabase.from('fifo_labels').select('entry_id, part_number, po, fifo_number'),
    ]);

    if (itemsResult.error && locationsResult.error && fifoResult.error) {
      console.error('Error consultando materiales asignados:', itemsResult.error, locationsResult.error, fifoResult.error);
      setAssignedEntriesError(`No se pudieron actualizar los bloqueos: ${itemsResult.error.message}`);
      return;
    }

    if (itemsResult.error) {
      console.warn('No se pudo leer location_items; se usarán los datos de locations:', itemsResult.error);
      setAssignedEntriesError(`No se pudo leer location_items: ${itemsResult.error.message}`);
    }
    if (locationsResult.error) {
      console.warn('No se pudo leer locations para actualizar bloqueos:', locationsResult.error);
    }
    if (fifoResult.error) {
      console.warn('No se pudo leer fifo_labels para resolver registros heredados:', fifoResult.error);
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
    const fifoToEntryId = new Map<string, number>();
    fifoRows.forEach(row => {
      const entryId = toEntryId(row.entry_id);
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

    setAssignedEntryIds(ids);
    setAssignedEntryLocations(locMap);
    setSelectedIds(prev => new Set([...prev].filter(id => !ids.has(id))));
  }, []);

  useEffect(() => {
    fetchRecords();
    fetchAssignedEntries();
  }, [fetchAssignedEntries]);

  // Refrescar asignaciones cuando se cambia a la pestaña de inventario
  useEffect(() => {
    if (mainTab === 'inventario') {
      fetchAssignedEntries();
    }
  }, [mainTab, fetchAssignedEntries]);

  /* =======================
     FILTER + STATS
  ======================= */
  useEffect(() => {
    filterRecords();
    calculateStats();
  }, [records, searchTerm]);

  const normalizeSearchText = (value: string | null | undefined) =>
    (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const filterRecords = () => {
    const term = normalizeSearchText(searchTerm.trim());
    if (!term) { setFilteredRecords(records); return; }

    setFilteredRecords(records.filter((r) => {
      const searchableFields = [
        r.part_number,
        r.description,
        r.unit_of_measure,
        r.registered_by,
        r.po,
      ];

      return searchableFields.some(field => normalizeSearchText(field).includes(term));
    }));
  };

  const calculateStats = () => {
    setStats({
      total: records.length,
      units: records.reduce((s, r) => s + r.total_units, 0),
      boxes: records.reduce((s, r) => s + r.total_boxes, 0),
    });
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
    fetchRecords();
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
    fetchRecords();
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
    const allSelected = pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedRecords = filteredRecords.filter((r) => selectedIds.has(r.id));

  /* =======================
     EXPORT CSV
  ======================= */
  const handleExportCSV = () => {
    const exportData = filteredRecords.map((r) => ({
      'Part Number': r.part_number,
      'Descripción': r.description ?? '',
      'PO': r.po ?? '',
      'QTY': r.total_units,
      'Cajas Totales': r.total_boxes,
      'Unidad de Medida': r.unit_of_measure ?? '',
      'Registrado Por': r.registered_by ?? '',
      'Fecha de Registro': new Date(r.registered_at).toLocaleString('es-ES'),
    }));
    const csv = Papa.unparse(exportData);
    saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `inventario_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const closeForm = () => { setShowForm(false); setEditingRecord(null); };

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
          <TabBtn
            active={mainTab === 'inventario'}
            onClick={() => setMainTab('inventario')}
            icon={<ClipboardList className="h-4 w-4" />}
            label="Inventario"
            color="indigo"
          />
          <TabBtn
            active={mainTab === 'racks'}
            onClick={() => setMainTab('racks')}
            icon={<MapPin className="h-4 w-4" />}
            label="Racks / Locaciones"
            color="emerald"
          />
          <TabBtn
            active={mainTab === 'kitteo'}
            onClick={() => setMainTab('kitteo')}
            icon={<ArrowRightFromLine className="h-4 w-4" />}
            label="Salidas KITTEO"
            color="orange"
          />
        </div>

        {/* ══════════════════════════════
            PESTAÑA: INVENTARIO
        ══════════════════════════════ */}
        {mainTab === 'inventario' && (
          <>
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
              <StatCard icon={<ClipboardList className="h-6 w-6" />} label="Total Registros" value={stats.total} color="indigo" />
              <StatCard icon={<Package className="h-6 w-6" />} label="Total Unidades" value={stats.units} color="blue" />
              <StatCard icon={<LayoutDashboard className="h-6 w-6" />} label="Total Cajas" value={stats.boxes} color="emerald" />
            </div>

            {/* Actions Bar */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 mb-6 flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" placeholder="Buscar por Part Number, descripción, usuario o PO..." value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all bg-gray-50" />
              </div>
              <div className="flex gap-2.5 flex-wrap justify-end">
                <button onClick={() => { fetchRecords(); fetchAssignedEntries(); }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 shadow-sm transition-all active:scale-95">
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Actualizar
                </button>
                <button onClick={handleExportCSV} disabled={!filteredRecords.length}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 shadow-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Download className="h-4 w-4" />
                  Descargar CSV
                </button>
                <button onClick={() => setShowForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', boxShadow: '0 4px 14px 0 rgba(79,70,229,0.35)' }}>
                  <Plus className="h-4 w-4" />
                  Agregar Nuevo
                </button>
              </div>
            </div>

            {/* ── Barra de selección múltiple (aparece cuando hay seleccionados) ── */}
            {selectedIds.size > 0 && (
              <div
                className="mb-4 px-5 py-3 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm"
                style={{ background: 'linear-gradient(90deg, #f5f3ff 0%, #ede9fe 100%)', borderColor: '#c4b5fd' }}
              >
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{selectedIds.size}</span>
                  </div>
                  <p className="text-sm font-semibold text-violet-800">
                    {selectedIds.size} registro{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}
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
                    Imprimir {selectedIds.size} Etiqueta{selectedIds.size !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-indigo-500" />
                  <h2 className="font-semibold text-gray-800 text-sm">Registros de Inventario</h2>
                </div>
                {filteredRecords.length > 0 && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
                    {filteredRecords.length} {filteredRecords.length === 1 ? 'registro' : 'registros'}
                  </span>
                )}
              </div>
              <InventoryTable
                records={filteredRecords}
                loading={loading}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onLabel={handleLabel}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onToggleSelectAll={handleToggleSelectAll}
                assignedEntryIds={assignedEntryIds}
                assignedEntryLocations={assignedEntryLocations}
              />
            </div>
          </>
        )}

        {/* ══════════════════════════════
            PESTAÑA: SALIDAS KITTEO
        ══════════════════════════════ */}
        {mainTab === 'kitteo' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6">
              <KitteoPage />
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            PESTAÑA: RACKS / LOCACIONES
        ══════════════════════════════ */}
        {mainTab === 'racks' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Sub-pestañas */}
            <div className="flex gap-0 border-b border-gray-100">
              <SubTabBtn
                active={rackSubTab === 'locaciones'}
                onClick={() => setRackSubTab('locaciones')}
                icon={<MapPin className="h-4 w-4" />}
                label="Racks / Locaciones"
                color="emerald"
              />
              <SubTabBtn
                active={rackSubTab === 'salidas'}
                onClick={() => setRackSubTab('salidas')}
                icon={<LogOut className="h-4 w-4" />}
                label="Transferencia Kitteo"
                color="red"
              />
            </div>

            <div className="p-6">
              {rackSubTab === 'locaciones' && <RacksPage onAssignmentsChange={fetchAssignedEntries} />}
              {rackSubTab === 'salidas' && <ExitsPage />}
            </div>
          </div>
        )}
      </main>

      {/* Modal Etiqueta FIFO (individual) */}
      {labelRecord && <LabelModal record={labelRecord} onClose={() => setLabelRecord(null)} />}

      {/* Modal Etiquetas múltiples */}
      {showMultiLabel && selectedRecords.length > 0 && (
        <MultiLabelModal
          records={selectedRecords}
          onClose={() => setShowMultiLabel(false)}
        />
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
