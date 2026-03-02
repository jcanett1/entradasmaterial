import React, { useState, useEffect } from 'react';
import type { Entry, NewEntry } from '@/lib/supabase';
import {
  Hash,
  FileText,
  Boxes,
  Archive,
  Ruler,
  Save,
  X,
} from 'lucide-react';

interface InventoryFormProps {
  record: Entry | null;
  userEmail: string;
  onSave: (record: NewEntry) => void;
  onCancel: () => void;
}

export function InventoryForm({
  record,
  userEmail,
  onSave,
  onCancel,
}: InventoryFormProps) {
  const [formData, setFormData] = useState<NewEntry>({
    part_number: '',
    description: '',
    total_units: 0,
    total_boxes: 0,
    unit_of_measure: '',
    registered_by: userEmail,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (record) {
      setFormData({
        part_number: record.part_number,
        description: record.description,
        total_units: record.total_units,
        total_boxes: record.total_boxes,
        unit_of_measure: record.unit_of_measure,
        registered_by: record.registered_by,
      });
    }
  }, [record]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.part_number.trim()) {
      newErrors.part_number = 'El Part Number es requerido';
    }
    if (!formData.description.trim()) {
      newErrors.description = 'La descripción es requerida';
    }
    if (formData.total_units < 0) {
      newErrors.total_units = 'Las unidades no pueden ser negativas';
    }
    if (formData.total_boxes < 0) {
      newErrors.total_boxes = 'Las cajas no pueden ser negativas';
    }
    if (!formData.unit_of_measure.trim()) {
      newErrors.unit_of_measure = 'La unidad de medida es requerida';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    onSave(formData);
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const unitOptions = [
    'Unidad',
    'Pieza',
    'Caja',
    'Paquete',
    'Kilogramo',
    'Gramo',
    'Litro',
    'Metro',
    'Otro',
  ];

  const inputClass = (field: string) =>
    `w-full px-4 py-2.5 border rounded-xl text-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-gray-50 ${
      errors[field]
        ? 'border-red-400 bg-red-50 focus:ring-red-400'
        : 'border-gray-200 hover:border-gray-300'
    }`;

  return (
    <form onSubmit={handleSubmit} className="px-6 pb-6 pt-5 space-y-4">
      {/* Part Number */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          <Hash className="h-3.5 w-3.5 text-indigo-400" />
          Part Number <span className="text-red-400">*</span>
        </label>
        <input
          name="part_number"
          value={formData.part_number}
          onChange={handleChange}
          placeholder="Ej. ABC-12345"
          className={inputClass('part_number')}
        />
        {errors.part_number && (
          <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
            <span>⚠</span> {errors.part_number}
          </p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          <FileText className="h-3.5 w-3.5 text-indigo-400" />
          Descripción <span className="text-red-400">*</span>
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={2}
          placeholder="Descripción del material..."
          className={inputClass('description') + ' resize-none'}
        />
        {errors.description && (
          <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
            <span>⚠</span> {errors.description}
          </p>
        )}
      </div>

      {/* Unidades / Cajas */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
            <Boxes className="h-3.5 w-3.5 text-blue-400" />
            Unidades
          </label>
          <input
            type="number"
            name="total_units"
            value={formData.total_units}
            onChange={handleChange}
            min={0}
            className={inputClass('total_units')}
          />
          {errors.total_units && (
            <p className="text-red-500 text-xs mt-1.5">{errors.total_units}</p>
          )}
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
            <Archive className="h-3.5 w-3.5 text-emerald-400" />
            Cajas
          </label>
          <input
            type="number"
            name="total_boxes"
            value={formData.total_boxes}
            onChange={handleChange}
            min={0}
            className={inputClass('total_boxes')}
          />
          {errors.total_boxes && (
            <p className="text-red-500 text-xs mt-1.5">{errors.total_boxes}</p>
          )}
        </div>
      </div>

      {/* Unidad de Medida */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          <Ruler className="h-3.5 w-3.5 text-amber-400" />
          Unidad de Medida <span className="text-red-400">*</span>
        </label>
        <select
          name="unit_of_measure"
          value={formData.unit_of_measure}
          onChange={handleChange}
          className={inputClass('unit_of_measure') + ' cursor-pointer'}
        >
          <option value="">Seleccionar unidad...</option>
          {unitOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {errors.unit_of_measure && (
          <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
            <span>⚠</span> {errors.unit_of_measure}
          </p>
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-3 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 active:scale-95"
        >
          <X className="h-4 w-4" />
          Cancelar
        </button>
        <button
          type="submit"
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 active:scale-95 shadow-md"
          style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', boxShadow: '0 4px 14px 0 rgba(79,70,229,0.35)' }}
        >
          <Save className="h-4 w-4" />
          {record ? 'Actualizar' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
