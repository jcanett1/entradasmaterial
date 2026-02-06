import React, { useState, useEffect } from 'react';
import type { Entry, NewEntry } from '@/lib/supabase';
import {
  Save,
  X,
  Hash,
  FileText,
  Boxes,
  Package,
  Ruler,
  User,
  Calendar,
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
    registered_at: new Date().toISOString(),
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
        registered_at: record.registered_at,
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

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      {/* Part Number */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
          <Hash className="h-4 w-4 text-gray-400" />
          Part Number *
        </label>
        <input
          name="part_number"
          value={formData.part_number}
          onChange={handleChange}
          className={`w-full px-4 py-2.5 border rounded-lg ${
            errors.part_number ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {errors.part_number && (
          <p className="mt-1 text-sm text-red-500">{errors.part_number}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
          <FileText className="h-4 w-4 text-gray-400" />
          Descripción *
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={2}
          className={`w-full px-4 py-2.5 border rounded-lg ${
            errors.description ? 'border-red-500' : 'border-gray-300'
          }`}
        />
      </div>

      {/* Units / Boxes */}
      <div className="grid grid-cols-2 gap-4">
        <input
          type="number"
          name="total_units"
          value={formData.total_units}
          onChange={handleChange}
          min={0}
          className="border rounded-lg px-4 py-2.5"
        />
        <input
          type="number"
          name="total_boxes"
          value={formData.total_boxes}
          onChange={handleChange}
          min={0}
          className="border rounded-lg px-4 py-2.5"
        />
      </div>

      {/* Unit */}
      <select
        name="unit_of_measure"
        value={formData.unit_of_measure}
        onChange={handleChange}
        className="w-full border rounded-lg px-4 py-2.5"
      >
        <option value="">Selecciona una unidad</option>
        {unitOptions.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>

      {/* Buttons */}
      <div className="flex gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border rounded-lg py-2"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="flex-1 bg-indigo-600 text-white rounded-lg py-2"
        >
          {record ? 'Actualizar' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
