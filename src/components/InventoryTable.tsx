import React from 'react';
import type { Entry } from '@/lib/supabase';
import { Edit2, Trash2, Package, Loader2, Hash, AlignLeft, Boxes, Archive, Ruler, User, Calendar, Settings2 } from 'lucide-react';

interface InventoryTableProps {
  records: Entry[];
  loading: boolean;
  onEdit: (record: Entry) => void;
  onDelete: (id: number) => void;
}

export function InventoryTable({
  records,
  loading,
  onEdit,
  onDelete,
}: InventoryTableProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="relative">
          <div className="h-14 w-14 rounded-full border-4 border-indigo-100"></div>
          <Loader2 className="h-14 w-14 text-indigo-500 animate-spin absolute inset-0" />
        </div>
        <p className="text-gray-500 mt-5 font-medium">Cargando registros...</p>
        <p className="text-gray-400 text-sm mt-1">Por favor espera un momento</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="p-5 bg-indigo-50 rounded-3xl mb-4">
          <Package className="h-14 w-14 text-indigo-300" />
        </div>
        <p className="text-gray-700 text-lg font-semibold">Sin registros</p>
        <p className="text-gray-400 text-sm mt-1">
          Usa el botón <span className="font-medium text-indigo-500">Agregar Nuevo</span> para crear el primer registro
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ background: 'linear-gradient(90deg, #f8f9ff 0%, #f0f4ff 100%)' }}>
            <Th icon={<Hash className="h-3.5 w-3.5" />} label="Part Number" />
            <Th icon={<AlignLeft className="h-3.5 w-3.5" />} label="Descripción" />
            <Th icon={<Boxes className="h-3.5 w-3.5" />} label="Unidades" center />
            <Th icon={<Archive className="h-3.5 w-3.5" />} label="Cajas" center />
            <Th icon={<Ruler className="h-3.5 w-3.5" />} label="Unidad de Medida" />
            <Th icon={<User className="h-3.5 w-3.5" />} label="Registrado Por" />
            <Th icon={<Calendar className="h-3.5 w-3.5" />} label="Fecha de Registro" />
            <Th icon={<Settings2 className="h-3.5 w-3.5" />} label="Acciones" center />
          </tr>
        </thead>

        <tbody>
          {records.map((record, idx) => (
            <tr
              key={record.id}
              className="group transition-colors duration-150 hover:bg-indigo-50/40 border-b border-gray-100 last:border-0"
              style={{ background: idx % 2 === 0 ? '#ffffff' : '#fafbff' }}
            >
              {/* Part Number */}
              <td className="px-5 py-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 font-mono text-sm font-semibold border border-indigo-100">
                  {record.part_number}
                </span>
              </td>

              {/* Descripción */}
              <td className="px-5 py-4">
                <p
                  className="text-gray-800 text-sm font-medium max-w-xs truncate"
                  title={record.description ?? ''}
                >
                  {record.description || <span className="text-gray-400 italic">Sin descripción</span>}
                </p>
              </td>

              {/* Unidades */}
              <td className="px-5 py-4 text-center">
                <span className="inline-flex items-center justify-center min-w-[56px] px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 font-bold text-sm border border-blue-100">
                  {record.total_units.toLocaleString()}
                </span>
              </td>

              {/* Cajas */}
              <td className="px-5 py-4 text-center">
                <span className="inline-flex items-center justify-center min-w-[44px] px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-sm border border-emerald-100">
                  {record.total_boxes}
                </span>
              </td>

              {/* Unidad de Medida */}
              <td className="px-5 py-4">
                <span className="inline-flex px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-100">
                  {record.unit_of_measure || '—'}
                </span>
              </td>

              {/* Registrado Por */}
              <td className="px-5 py-4">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-indigo-600 text-xs font-bold uppercase">
                      {(record.registered_by ?? '?')[0]}
                    </span>
                  </div>
                  <span className="text-sm text-gray-600 truncate max-w-[140px]" title={record.registered_by ?? ''}>
                    {record.registered_by}
                  </span>
                </div>
              </td>

              {/* Fecha */}
              <td className="px-5 py-4">
                <div className="flex flex-col">
                  <span className="text-sm text-gray-700 font-medium">
                    {new Date(record.registered_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                  <span className="text-xs text-gray-400 mt-0.5">
                    {new Date(record.registered_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </td>

              {/* Acciones */}
              <td className="px-5 py-4">
                <div className="flex justify-center items-center gap-1.5">
                  <button
                    onClick={() => onEdit(record)}
                    title="Editar registro"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 hover:border-blue-200 transition-all duration-150 active:scale-95"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Editar</span>
                  </button>

                  <button
                    onClick={() => onDelete(record.id)}
                    title="Eliminar registro"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 hover:border-red-200 transition-all duration-150 active:scale-95"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Eliminar</span>
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

/* =======================
   HELPER: Table Header Cell
======================= */
function Th({ icon, label, center }: { icon: React.ReactNode; label: string; center?: boolean }) {
  return (
    <th
      className={`px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 ${center ? 'text-center' : 'text-left'}`}
    >
      <div className={`flex items-center gap-1.5 ${center ? 'justify-center' : ''}`}>
        <span className="text-indigo-400">{icon}</span>
        {label}
      </div>
    </th>
  );
}
