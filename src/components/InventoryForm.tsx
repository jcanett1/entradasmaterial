import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Entry, NewEntry } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import {
  Hash,
  FileText,
  Boxes,
  Archive,
  Ruler,
  Save,
  X,
  ClipboardList,
  Search,
  Loader2,
} from 'lucide-react';

interface PartOption {
  inventory_id: string;
  description: string;
}

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
    unit_of_measure: 'Caja',
    registered_by: userEmail,
    po: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // --- Autocompletado Part Number ---
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<PartOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [partSelected, setPartSelected] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cargar datos del registro al editar
  useEffect(() => {
    if (record) {
      setFormData({
        part_number: record.part_number,
        description: record.description,
        total_units: record.total_units,
        total_boxes: record.total_boxes,
        unit_of_measure: record.unit_of_measure ?? 'Caja',
        registered_by: record.registered_by,
        po: record.po ?? '',
      });
      setSearchTerm(record.part_number);
      setPartSelected(true);
    }
  }, [record]);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Buscar sugerencias en parts_catalog con debounce
  const fetchSuggestions = useCallback(async (term: string) => {
    if (!term.trim() || term.length < 1) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    setLoadingSuggestions(true);
    const { data, error } = await supabase
      .from('parts_catalog')
      .select('inventory_id, description')
      .or(`inventory_id.ilike.%${term}%,description.ilike.%${term}%`)
      .order('inventory_id', { ascending: true })
      .limit(12);

    if (!error && data) {
      setSuggestions(data as PartOption[]);
      setShowDropdown(data.length > 0);
    }
    setLoadingSuggestions(false);
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    setPartSelected(false);
    setFormData((prev) => ({ ...prev, part_number: val }));

    if (errors.part_number) setErrors((prev) => ({ ...prev, part_number: '' }));

    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => fetchSuggestions(val), 250);
  };

  const handleSelectPart = (part: PartOption) => {
    setSearchTerm(part.inventory_id);
    setFormData((prev) => ({
      ...prev,
      part_number: part.inventory_id,
      description: part.description ?? '',
    }));
    setPartSelected(true);
    setShowDropdown(false);
    setSuggestions([]);
    if (errors.part_number) setErrors((prev) => ({ ...prev, part_number: '' }));
    if (errors.description) setErrors((prev) => ({ ...prev, description: '' }));
  };

  // --- Validación ---
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.part_number.trim()) {
      newErrors.part_number = 'El Part Number es requerido';
    }
    if (!formData.description?.trim()) {
      newErrors.description = 'La descripción es requerida';
    }
    if (formData.total_units < 0) {
      newErrors.total_units = 'El QTY no puede ser negativo';
    }
    if (formData.total_boxes < 0) {
      newErrors.total_boxes = 'Las cajas no pueden ser negativas';
    }
    if (!formData.unit_of_measure?.trim()) {
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
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const unitOptions = [
    'Caja',
    'Unidad',
    'Pieza',
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

      {/* Part Number con autocompletado */}
      <div ref={dropdownRef} className="relative">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          <Hash className="h-3.5 w-3.5 text-indigo-400" />
          Part Number <span className="text-red-400">*</span>
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          {loadingSuggestions && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-400 animate-spin pointer-events-none" />
          )}
          <input
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            onFocus={() => {
              if (suggestions.length > 0 && !partSelected) setShowDropdown(true);
            }}
            placeholder="Buscar por número de parte o descripción..."
            className={
              `w-full pl-10 pr-10 py-2.5 border rounded-xl text-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-gray-50 ` +
              (errors.part_number
                ? 'border-red-400 bg-red-50 focus:ring-red-400'
                : partSelected
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-gray-200 hover:border-gray-300')
            }
            autoComplete="off"
          />
        </div>

        {/* Dropdown de sugerencias */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
            <div className="max-h-56 overflow-y-auto">
              {suggestions.map((part) => (
                <button
                  key={part.inventory_id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectPart(part);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors border-b border-gray-50 last:border-0 group"
                >
                  <p className="text-sm font-semibold text-indigo-700 font-mono group-hover:text-indigo-900">
                    {part.inventory_id}
                  </p>
                  <p className="text-xs text-gray-500 truncate mt-0.5 group-hover:text-gray-700">
                    {part.description}
                  </p>
                </button>
              ))}
            </div>
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                {suggestions.length === 12 ? 'Mostrando los primeros 12 resultados — escribe más para filtrar' : `${suggestions.length} resultado${suggestions.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
        )}

        {errors.part_number && (
          <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
            <span>⚠</span> {errors.part_number}
          </p>
        )}
      </div>

      {/* Description (auto-llenado, editable) */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          <FileText className="h-3.5 w-3.5 text-indigo-400" />
          Descripción <span className="text-red-400">*</span>
        </label>
        <textarea
          name="description"
          value={formData.description ?? ''}
          onChange={handleChange}
          rows={2}
          placeholder="Se llena automáticamente al seleccionar un Part Number..."
          className={inputClass('description') + ' resize-none'}
        />
        {errors.description && (
          <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
            <span>⚠</span> {errors.description}
          </p>
        )}
      </div>

      {/* PO */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          <ClipboardList className="h-3.5 w-3.5 text-purple-400" />
          PO (Orden de Compra)
        </label>
        <input
          name="po"
          value={formData.po ?? ''}
          onChange={handleChange}
          placeholder="Ej. PO-2024-001"
          className={inputClass('po')}
        />
      </div>

      {/* QTY / Cajas */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
            <Boxes className="h-3.5 w-3.5 text-blue-400" />
            QTY
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

      {/* Unidad de Medida (default: Caja) */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          <Ruler className="h-3.5 w-3.5 text-amber-400" />
          Unidad de Medida <span className="text-red-400">*</span>
        </label>
        <select
          name="unit_of_measure"
          value={formData.unit_of_measure ?? 'Caja'}
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
