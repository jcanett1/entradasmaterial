import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Entry, NewEntry } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { InventoryForm } from './InventoryForm';
import { InventoryTable } from './InventoryTable';
import {
  Package, LogOut, Plus, X, RefreshCw, Download,
  LayoutDashboard, ClipboardList, Search
} from 'lucide-react';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';

export function Dashboard() {
  const { user, signOut } = useAuth();
  const [records, setRecords] = useState<Entry[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<InventoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<InventoryRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({ total: 0, units: 0, boxes: 0 });

  useEffect(() => {
    fetchRecords();
  }, []);

  useEffect(() => {
    filterRecords();
    calculateStats();
  }, [records, searchTerm]);

  const fetchRecords = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('inventory_records')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching records:', error);
    } else {
      setRecords(data || []);
    }
    setLoading(false);
  };

  const filterRecords = () => {
    if (!searchTerm.trim()) {
      setFilteredRecords(records);
      return;
    }
    const term = searchTerm.toLowerCase();
    const filtered = records.filter(record =>
      record.part_number.toLowerCase().includes(term) ||
      record.description.toLowerCase().includes(term) ||
      record.unit_of_measure.toLowerCase().includes(term) ||
      record.registered_by.toLowerCase().includes(term)
    );
    setFilteredRecords(filtered);
  };

  const calculateStats = () => {
    const totalUnits = records.reduce((sum, r) => sum + r.total_units, 0);
    const totalBoxes = records.reduce((sum, r) => sum + r.total_boxes, 0);
    setStats({ total: records.length, units: totalUnits, boxes: totalBoxes });
  };

  const handleCreate = async (data: NewEntry) => {
    if (editingRecord) {
      const { error } = await supabase
        .from('inventory_records')
        .update({
          ...record,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingRecord.id);

      if (error) {
        console.error('Error updating record:', error);
        alert('Error al actualizar el registro');
        return;
      }
    } else {
      const { error } = await supabase
        .from('inventory_records')
        .insert([record]);

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

  const handleEdit = (record: InventoryRecord) => {
    setEditingRecord(record);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este registro?')) return;

    const { error } = await supabase
      .from('inventory_records')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting record:', error);
      alert('Error al eliminar el registro');
      return;
    }

    fetchRecords();
  };

  const handleExportCSV = () => {
    const exportData = filteredRecords.map(record => ({
      'Part Number': record.part_number,
      'Descripción': record.description,
      'Unidades Totales': record.total_units,
      'Cajas Totales': record.total_boxes,
      'Unidad de Medida': record.unit_of_measure,
      'Registrado Por': record.registered_by,
      'Fecha de Registro': new Date(record.registered_at).toLocaleString('es-ES'),
      'Creado': new Date(record.created_at).toLocaleString('es-ES'),
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `inventario_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingRecord(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2 rounded-lg">
                <Package className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Sistema de Inventario</h1>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <LogOut className="h-5 w-5" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-4">
              <div className="bg-indigo-100 p-3 rounded-xl">
                <ClipboardList className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Registros</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-4">
              <div className="bg-green-100 p-3 rounded-xl">
                <Package className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Unidades</p>
                <p className="text-2xl font-bold text-gray-900">{stats.units.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-4">
              <div className="bg-amber-100 p-3 rounded-xl">
                <LayoutDashboard className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Cajas</p>
                <p className="text-2xl font-bold text-gray-900">{stats.boxes.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por Part Number, descripción, unidad de medida..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={fetchRecords}
                className="flex items-center gap-2 px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <RefreshCw className="h-5 w-5" />
                <span className="hidden sm:inline">Actualizar</span>
              </button>
              <button
                onClick={handleExportCSV}
                disabled={filteredRecords.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 text-green-700 bg-green-100 hover:bg-green-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="h-5 w-5" />
                <span className="hidden sm:inline">Exportar CSV</span>
              </button>
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                <Plus className="h-5 w-5" />
                <span className="hidden sm:inline">Nuevo Registro</span>
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <InventoryTable
            records={filteredRecords}
            loading={loading}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      </main>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">
                {editingRecord ? 'Editar Registro' : 'Nuevo Registro'}
              </h2>
              <button
                onClick={closeForm}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <InventoryForm
              record={editingRecord}
              userEmail={user?.email || ''}
              onSave={handleSave}
              onCancel={closeForm}
            />
          </div>
        </div>
      )}
    </div>
  );
}
