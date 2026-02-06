import React from 'react';
import type { Entry, NewEntry } from '@/lib/supabase';
import { Edit2, Trash2, Package, Loader2 } from 'lucide-react';

interface InventoryTableProps {
  records: Entry[];
  loading: boolean;
  onEdit: (record: Entry) => void;
  onDelete: (id: number) => void; // ✅
}

export function InventoryTable({ records, loading, onEdit, onDelete }: InventoryTableProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-10 w-10 text-indigo-600 animate-spin mb-4" />
        <p className="text-gray-500">Cargando registros...</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Package className="h-16 w-16 text-gray-300 mb-4" />
        <p className="text-gray-500 text-lg">No hay registros</p>
        <p className="text-gray-400 text-sm mt-1">Crea tu primer registro de inventario</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Part Number
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Descripción
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Unidades
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Cajas
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Unidad de Medida
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Registrado Por
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Fecha de Registro
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {records.map((record) => (
            <tr key={record.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-4">
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 font-mono text-sm font-medium">
                  {record.part_number}
                </span>
              </td>
              <td className="px-4 py-4">
                <p className="text-gray-900 text-sm max-w-xs truncate" title={record.description}>
                  {record.description}
                </p>
              </td>
              <td className="px-4 py-4 text-center">
                <span className="text-gray-900 font-medium">
                  {record.total_units.toLocaleString()}
                </span>
              </td>
              <td className="px-4 py-4 text-center">
                <span className="text-gray-900 font-medium">
                  {record.total_boxes.toLocaleString()}
                </span>
              </td>
              <td className="px-4 py-4">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                  {record.unit_of_measure}
                </span>
              </td>
              <td className="px-4 py-4">
                <p className="text-gray-600 text-sm">{record.registered_by}</p>
              </td>
              <td className="px-4 py-4">
                <p className="text-gray-600 text-sm">
                  {new Date(record.registered_at).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => onEdit(record)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onDelete(record.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
