import React, { useState, useEffect } from 'react';
import { InventoryRecord, NewInventoryRecord } from '@/lib/supabase';
import { Save, X, Hash, FileText, Boxes, Package, Ruler, User, Calendar } from 'lucide-react';

interface InventoryFormProps {
  record: InventoryRecord | null;
  userEmail: string;
  onSave: (record: NewInventoryRecord) => void;
  onCancel: () => void;
}

export function InventoryForm({ record, userEmail, onSave, onCancel }: InventoryFormProps) {
  const [formData, setFormData] = useState({
    part_number: '',
    description: '',
    total_units: 0,
    total_boxes: 0,
    unit_of_measure: '',
    registered_by: userEmail,
    registered_at: new Date().toISOString().slice(0, 16),
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
        registered_at: record.registered_at.slice(0, 16),
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

    onSave({
      ...formData,
      registered_at: new Date(formData.registered_at).toISOString(),
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const unitOptions = ['Unidad', 'Pieza', 'Caja', 'Paquete', 'Kilogramo', 'Gramo', 'Litro', 'Metro', 'Otro'];

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      {/* Part Number */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
          <Hash className="h-4 w-4 text-gray-400" />
          Part Number *
        </label>
        <input
          type="text"
          name="part_number"
          value={formData.part_number}
          onChange={handleChange}
          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors ${errors.part_number ? 'border-red-500' : 'border-gray-300'}`}
          placeholder="Ej: PN-001234"
        />
        {errors.part_number && <p className="mt-1 text-sm text-red-500">{errors.part_number}</p>}
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
          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors resize-none ${errors.description ? 'border-red-500' : 'border-gray-300'}`}
          placeholder="Descripción del producto..."
        />
        {errors.description && <p className="mt-1 text-sm text-red-500">{errors.description}</p>}
      </div>

      {/* Units and Boxes */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
            <Package className="h-4 w-4 text-gray-400" />
            Total Unidades *
          </label>
          <input
            type="number"
            name="total_units"
            value={formData.total_units}
            onChange={handleChange}
            min="0"
            className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors ${errors.total_units ? 'border-red-500' : 'border-gray-300'}`}
          />
          {errors.total_units && <p className="mt-1 text-sm text-red-500">{errors.total_units}</p>}
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
            <Boxes className="h-4 w-4 text-gray-400" />
            Total Cajas *
          </label>
          <input
            type="number"
            name="total_boxes"
            value={formData.total_boxes}
            onChange={handleChange}
            min="0"
            className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors ${errors.total_boxes ? 'border-red-500' : 'border-gray-300'}`}
          />
          {errors.total_boxes && <p className="mt-1 text-sm text-red-500">{errors.total_boxes}</p>}
        </div>
      </div>

      {/* Unit of Measure */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
          <Ruler className="h-4 w-4 text-gray-400" />
          Unidad de Medida *
        </label>
        <select
          name="unit_of_measure"
          value={formData.unit_of_measure}
          onChange={handleChange}
          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white ${errors.unit_of_measure ? 'border-red-500' : 'border-gray-300'}`}
        >
          <option value="">Selecciona una unidad...</option>
          {unitOptions.map(unit => (
            <option key={unit} value={unit}>{unit}</option>
          ))}
        </select>
        {errors.unit_of_measure && <p className="mt-1 text-sm text-red-500">{errors.unit_of_measure}</p>}
      </div>

      {/* Registered By */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
          <User className="h-4 w-4 text-gray-400" />
          Registrado Por
        </label>
        <input
          type="text"
          name="registered_by"
          value={formData.registered_by}
          onChange={handleChange}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
          readOnly
        />
      </div>

      {/* Registration Date */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
          <Calendar className="h-4 w-4 text-gray-400" />
          Fecha de Registro
        </label>
        <input
          type="datetime-local"
          name="registered_at"
          value={formData.registered_at}
          onChange={handleChange}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <X className="h-5 w-5" />
          Cancelar
        </button>
        <button
          type="submit"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Save className="h-5 w-5" />
          {record ? 'Actualizar' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
