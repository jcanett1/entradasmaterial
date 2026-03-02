import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Entry, NewEntry } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { InventoryForm } from './InventoryForm';
import { InventoryTable } from './InventoryTable';
import { UserManagementDropdown } from './UserManagementDropdown';
import {
  Package,
  LogOut,
  Plus,
  X,
  RefreshCw,
  Download,
  LayoutDashboard,
  ClipboardList,
  Search
} from 'lucide-react';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';

export function Dashboard() {
  const { user, signOut, isAdmin } = useAuth();

  const [records, setRecords] = useState<Entry[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Entry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({ total: 0, units: 0, boxes: 0 });
  const [refreshing, setRefreshing] = useState(false);

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

    if (error) {
      console.error('Error fetching records:', error);
    } else {
      setRecords(data ?? []);
    }

    setLoading(false);
    setTimeout(() => setRefreshing(false), 600);
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  /* =======================
     FILTER + STATS
  ======================= */
  useEffect(() => {
    filterRecords();
    calculateStats();
  }, [records, searchTerm]);

  const filterRecords = () => {
    if (!searchTerm.trim()) {
      setFilteredRecords(records);
      return;
    }

    const term = searchTerm.toLowerCase();

    const filtered = records.filter((record) =>
      record.part_number.toLowerCase().includes(term) ||
      (record.description ?? '').toLowerCase().includes(term) ||
      (record.unit_of_measure ?? '').toLowerCase().includes(term) ||
      (record.registered_by ?? '').toLowerCase().includes(term)
    );

    setFilteredRecords(filtered);
  };

  const calculateStats = () => {
    const totalUnits = records.reduce((sum, r) => sum + r.total_units, 0);
    const totalBoxes = records.reduce((sum, r) => sum + r.total_boxes, 0);

    setStats({
      total: records.length,
      units: totalUnits,
      boxes: totalBoxes
    });
  };

  /* =======================
     CREATE / UPDATE
  ======================= */
  const handleCreate = async (data: NewEntry) => {
    if (editingRecord) {
      const { error } = await supabase
        .from('entries')
        .update(data)
        .eq('id', editingRecord.id);

      if (error) {
        console.error('Error updating record:', error);
        alert('Error al actualizar el registro');
        return;
      }
    } else {
      const { error } = await supabase
        .from('entries')
        .insert([data]);

      if (error) {
        console.error('Error creating record:', error);
        alert('Error al crear el registro');
        return;
      }
    }

    setShowForm(false);
    setEditingRecord(null);
    fetchRecords();
  };

  /* =======================
     EDIT / DELETE
  ======================= */
  const handleEdit = (record: Entry) => {
    setEditingRecord(record);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este registro?')) return;

    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting record:', error);
      alert('Error al eliminar el registro');
      return;
    }

    fetchRecords();
  };

  /* =======================
     EXPORT CSV
  ======================= */
  const handleExportCSV = () => {
    const exportData = filteredRecords.map((record) => ({
      'Part Number': record.part_number,
      'Descripción': record.description ?? '',
      'Unidades Totales': record.total_units,
      'Cajas Totales': record.total_boxes,
      'Unidad de Medida': record.unit_of_measure ?? '',
      'Registrado Por': record.registered_by ?? '',
      'Fecha de Registro': new Date(record.registered_at).toLocaleString('es-ES')
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });

    saveAs(blob, `inventario_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingRecord(null);
  };

  /* =======================
     UI
  ======================= */
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #f0f4ff 0%, #f8fafc 60%, #eef2ff 100%)' }}>
      {/* Header */}
      <header
        style={{
          background: 'linear-gradient(90deg, #3730a3 0%, #4f46e5 60%, #6366f1 100%)',
          boxShadow: '0 4px 24px 0 rgba(79,70,229,0.18)'
        }}
        className="sticky top-0 z-40"
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center gap-4">
          {/* Logo + Título */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="bg-white/20 backdrop-blur p-2 rounded-xl shadow">
              <Package className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-wide">Sistema de Inventario</h1>
              <p className="text-xs text-indigo-200 hidden sm:block">{user?.email}</p>
            </div>
          </div>

          {/* Acciones del header */}
          <div className="flex items-center gap-2">
            {/* Dropdown de gestión de usuarios (solo admin) */}
            <UserManagementDropdown
              currentUserEmail={user?.email ?? ''}
              isAdmin={isAdmin}
            />

            {/* Separador visual */}
            {isAdmin && <div className="h-6 w-px bg-white/20 mx-1" />}

            {/* Botón cerrar sesión */}
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white/90 hover:bg-white/15 transition-all duration-200 font-medium text-sm border border-white/20"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <StatCard
            icon={<ClipboardList className="h-6 w-6" />}
            label="Total Registros"
            value={stats.total}
            color="indigo"
          />
          <StatCard
            icon={<Package className="h-6 w-6" />}
            label="Total Unidades"
            value={stats.units}
            color="blue"
          />
          <StatCard
            icon={<LayoutDashboard className="h-6 w-6" />}
            label="Total Cajas"
            value={stats.boxes}
            color="emerald"
          />
        </div>

        {/* Actions Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 mb-6 flex flex-col sm:flex-row gap-4 justify-between items-center">
          {/* Search */}
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por part number, descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all bg-gray-50"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2.5 flex-wrap justify-end">
            {/* Actualizar */}
            <button
              onClick={fetchRecords}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-all duration-200 active:scale-95"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>

            {/* Descargar CSV */}
            <button
              onClick={handleExportCSV}
              disabled={!filteredRecords.length}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 shadow-sm transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" />
              <span>Descargar CSV</span>
            </button>

            {/* Nuevo */}
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-all duration-200 active:scale-95"
              style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', boxShadow: '0 4px 14px 0 rgba(79,70,229,0.35)' }}
            >
              <Plus className="h-4 w-4" />
              <span>Agregar Nuevo</span>
            </button>
          </div>
        </div>

        {/* Table Card */}
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
          />
        </div>
      </main>

      {/* Modal Nuevo/Editar Registro */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100 animate-in">
            <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl" style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}>
                  {editingRecord ? <RefreshCw className="h-4 w-4 text-white" /> : <Plus className="h-4 w-4 text-white" />}
                </div>
                <h2 className="text-lg font-bold text-gray-900">
                  {editingRecord ? 'Editar Registro' : 'Nuevo Registro'}
                </h2>
              </div>
              <button
                onClick={closeForm}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <InventoryForm
              record={editingRecord}
              userEmail={user?.email || ''}
              onSave={handleCreate}
              onCancel={closeForm}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* =======================
   HELPER
======================= */
function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  const colorMap: Record<string, { bg: string; text: string; shadow: string }> = {
    indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-600',  shadow: 'rgba(99,102,241,0.15)' },
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-600',    shadow: 'rgba(59,130,246,0.15)' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', shadow: 'rgba(16,185,129,0.15)' },
  };
  const c = colorMap[color] ?? colorMap['indigo'];

  return (
    <div
      className="bg-white rounded-2xl p-6 flex items-center gap-5 border border-gray-100"
      style={{ boxShadow: `0 4px 20px 0 ${c.shadow}` }}
    >
      <div className={`p-3.5 rounded-2xl ${c.bg} ${c.text} flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-3xl font-bold text-gray-900 mt-0.5">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}
