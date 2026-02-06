import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Entry, NewEntry } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { InventoryForm } from './InventoryForm';
import { InventoryTable } from './InventoryTable';
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
  const { user, signOut } = useAuth();

  const [records, setRecords] = useState<Entry[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Entry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({ total: 0, units: 0, boxes: 0 });

  /* =======================
     FETCH
  ======================= */
  const fetchRecords = async () => {
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

  const handleDelete = async (id: string) => {
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Package className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Sistema de Inventario</h1>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>

          <button
            onClick={signOut}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <LogOut className="h-5 w-5" />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <StatCard
            icon={<ClipboardList />}
            label="Total Registros"
            value={stats.total}
          />
          <StatCard
            icon={<Package />}
            label="Total Unidades"
            value={stats.units}
          />
          <StatCard
            icon={<LayoutDashboard />}
            label="Total Cajas"
            value={stats.boxes}
          />
        </div>

        {/* Actions */}
        <div className="bg-white p-4 rounded-xl mb-6 flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>

          <div className="flex gap-2">
            <button onClick={fetchRecords} className="btn-gray">
              <RefreshCw className="h-5 w-5" /> Actualizar
            </button>
            <button
              onClick={handleExportCSV}
              disabled={!filteredRecords.length}
              className="btn-green"
            >
              <Download className="h-5 w-5" /> CSV
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="btn-indigo"
            >
              <Plus className="h-5 w-5" /> Nuevo
            </button>
          </div>
        </div>

        <InventoryTable
          records={filteredRecords}
          loading={loading}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </main>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold">
                {editingRecord ? 'Editar Registro' : 'Nuevo Registro'}
              </h2>
              <button onClick={closeForm}>
                <X />
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
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-white p-6 rounded-xl flex items-center gap-4">
      <div className="p-3 bg-indigo-100 rounded-xl text-indigo-600">
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}
