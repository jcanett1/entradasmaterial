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
  Plus,
  Trash2,
} from 'lucide-react';

// Una línea de cantidad dentro del mismo número de parte
export interface EntryLine {
  id: string; // UUID local para React key
  total_units: number;
  total_boxes: number;
}

// Lo que el formulario devuelve al padre cuando hay múltiples líneas
export interface MultiEntry {
  base: Omit<NewEntry, 'total_units' | 'total_boxes'>;
  lines: EntryLine[];
}

interface PartOption {
  inventory_id: string;
  description: string;
}

interface InventoryFormProps {
  record: Entry | null;
  userEmail: string;
  onSave: (data: NewEntry | MultiEntry) => void;
  onCancel: () => void;
}

const newLine = (): EntryLine => ({
  id: Math.random().toString(36).slice(2),
  total_units: 0,
  total_boxes: 0,
});

export function InventoryForm({
  record,
  userEmail,
  onSave,
  onCancel,
}: InventoryFormProps) {
  const [formData, setFormData] = useState<Omit<NewEntry, 'total_units' | 'total_boxes'>>({
    part_number: '',
    description: '',
    unit_of_measure: 'Caja',
    registered_by: userEmail,
    po: '',
  });

  // Líneas de cantidad (siempre al menos 1)
  const [lines, setLines] = useState<EntryLine[]>([newLine()]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});

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
        unit_of_measure: record.unit_of_measure ?? 'Caja',
        registered_by: record.registered_by,
        po: record.po ?? '',
      });
      setSearchTerm(record.part_number);
      setPartSelected(true);
      setLines([{ id: 'edit', total_units: record.total_units, total_boxes: record.total_boxes }]);
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

  // Buscar sugerencias en parts_catalog
  const fetchSuggestions = useCallback(async (term: string) => {
    if (!term.trim()) { setSuggestions([]); setShowDropdown(false); return; }
    setLoadingSuggestions(true);
    const { data, error } = await supabase
      .from('parts_catalog')
      .select('inventory_id, description')
      .or(`inventory_id.ilike.%${term}%,description.ilike.%${term}%`)
      .order('inventory_id', { ascending: true })
      .limit(12);
    if (!error && data) { setSuggestions(data as PartOption[]); setShowDropdown(data.length > 0); }
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
    setFormData((prev) => ({ ...prev, part_number: part.inventory_id, description: part.description ?? '' }));
    setPartSelected(true);
    setShowDropdown(false);
    setSuggestions([]);
    if (errors.part_number) setErrors((prev) => ({ ...prev, part_number: '' }));
    if (errors.description) setErrors((prev) => ({ ...prev, description: '' }));
  };

  // --- Manejo de líneas ---
  const addLine = () => setLines((prev) => [...prev, newLine()]);

  const removeLine = (id: string) => {
    if (lines.length === 1) return; // siempre mínimo 1
    setLines((prev) => prev.filter((l) => l.id !== id));
    setLineErrors((prev) => {
      const next = { ...prev };
      delete next[`${id}_units`];
      delete next[`${id}_boxes`];
      return next;
    });
  };

  const updateLine = (id: string, field: 'total_units' | 'total_boxes', value: number) => {
    setLines((prev) => prev.map((l) => l.id === id ? { ...l, [field]: value } : l));
    const key = field === 'total_units' ? `${id}_units` : `${id}_boxes`;
    if (lineErrors[key]) setLineErrors((prev) => ({ ...prev, [key]: '' }));
  };

  // --- Validación ---
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    const newLineErrors: Record<string, string> = {};

    if (!formData.part_number.trim()) newErrors.part_number = 'El Part Number es requerido';
    if (!formData.description?.trim()) newErrors.description = 'La descripción es requerida';
    if (!formData.unit_of_measure?.trim()) newErrors.unit_of_measure = 'La unidad de medida es requerida';

    lines.forEach((line) => {
      if (line.total_units < 0) newLineErrors[`${line.id}_units`] = 'No puede ser negativo';
      if (line.total_boxes < 0) newLineErrors[`${line.id}_boxes`] = 'No puede ser negativo';
    });

    setErrors(newErrors);
    setLineErrors(newLineErrors);
    return Object.keys(newErrors).length === 0 && Object.keys(newLineErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (record) {
      // Edición: solo una línea
      onSave({
        ...formData,
        total_units: lines[0].total_units,
        total_boxes: lines[0].total_boxes,
      } as NewEntry);
    } else if (lines.length === 1) {
      // Nuevo registro con una sola línea
      onSave({
        ...formData,
        total_units: lines[0].total_units,
        total_boxes: lines[0].total_boxes,
      } as NewEntry);
    } else {
      // Múltiples líneas → MultiEntry
      onSave({ base: formData, lines } as MultiEntry);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const unitOptions = ['Caja', 'Unidad', 'Pieza', 'Paquete', 'Kilogramo', 'Gramo', 'Litro', 'Metro', 'Otro'];

  const inputClass = (field: string) =>
    `w-full px-4 py-2.5 border rounded-xl text-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-gray-50 ${
      errors[field] ? 'border-red-400 bg-red-50 focus:ring-red-400' : 'border-gray-200 hover:border-gray-300'
    }`;

  const isMultiLine = !record && lines.length > 1;

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
            onFocus={() => { if (suggestions.length > 0 && !partSelected) setShowDropdown(true); }}
            placeholder="Buscar por número de parte o descripción..."
            className={
              `w-full pl-10 pr-10 py-2.5 border rounded-xl text-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-gray-50 ` +
              (errors.part_number ? 'border-red-400 bg-red-50 focus:ring-red-400' : partSelected ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-gray-300')
            }
            autoComplete="off"
            disabled={!!record}
          />
        </div>
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
            <div className="max-h-56 overflow-y-auto">
              {suggestions.map((part) => (
                <button key={part.inventory_id} type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSelectPart(part); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors border-b border-gray-50 last:border-0 group"
                >
                  <p className="text-sm font-semibold text-indigo-700 font-mono group-hover:text-indigo-900">{part.inventory_id}</p>
                  <p className="text-xs text-gray-500 truncate mt-0.5 group-hover:text-gray-700">{part.description}</p>
                </button>
              ))}
            </div>
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                {suggestions.length === 12 ? 'Mostrando los primeros 12 — escribe más para filtrar' : `${suggestions.length} resultado${suggestions.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
        )}
        {errors.part_number && <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1"><span>⚠</span> {errors.part_number}</p>}
      </div>

      {/* Descripción */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          <FileText className="h-3.5 w-3.5 text-indigo-400" />
          Descripción <span className="text-red-400">*</span>
        </label>
        <textarea name="description" value={formData.description ?? ''} onChange={handleChange} rows={2}
          placeholder="Se llena automáticamente al seleccionar un Part Number..."
          className={inputClass('description') + ' resize-none'} />
        {errors.description && <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1"><span>⚠</span> {errors.description}</p>}
      </div>

      {/* PO */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          <ClipboardList className="h-3.5 w-3.5 text-purple-400" />
          PO (Orden de Compra)
        </label>
        <input name="po" value={formData.po ?? ''} onChange={handleChange} placeholder="Ej. PO-2024-001" className={inputClass('po')} />
      </div>

      {/* Unidad de Medida */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          <Ruler className="h-3.5 w-3.5 text-amber-400" />
          Unidad de Medida <span className="text-red-400">*</span>
        </label>
        <select name="unit_of_measure" value={formData.unit_of_measure ?? 'Caja'} onChange={handleChange}
          className={inputClass('unit_of_measure') + ' cursor-pointer'}>
          <option value="">Seleccionar unidad...</option>
          {unitOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        {errors.unit_of_measure && <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1"><span>⚠</span> {errors.unit_of_measure}</p>}
      </div>

      {/* ── LÍNEAS DE CANTIDAD ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
            <Boxes className="h-3.5 w-3.5 text-blue-400" />
            Cantidades {isMultiLine && <span className="ml-1 text-indigo-500 normal-case font-normal">({lines.length} entradas)</span>}
          </label>
          {/* Botón agregar línea — solo en modo nuevo registro */}
          {!record && (
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 hover:border-indigo-200 transition-all active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar mismo Part Number
            </button>
          )}
        </div>

        {/* Encabezado de columnas */}
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">QTY</span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cajas</span>
          <span className="w-7" />
        </div>

        {/* Filas de líneas */}
        {lines.map((line, idx) => (
          <div key={line.id} className={`grid grid-cols-[1fr_1fr_auto] gap-2 items-start p-2 rounded-xl border transition-colors ${isMultiLine ? 'bg-indigo-50/40 border-indigo-100' : 'bg-gray-50 border-gray-100'}`}>
            {/* Número de línea */}
            {isMultiLine && (
              <div className="col-span-3 flex items-center gap-1.5 mb-1">
                <span className="text-xs font-bold text-indigo-500 bg-indigo-100 rounded-full w-5 h-5 flex items-center justify-center">{idx + 1}</span>
                <span className="text-xs text-indigo-400 font-medium">Entrada {idx + 1}</span>
              </div>
            )}

            {/* QTY */}
            <div>
              <input
                type="number"
                value={line.total_units}
                onChange={(e) => updateLine(line.id, 'total_units', Number(e.target.value))}
                min={0}
                placeholder="QTY"
                className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white transition-all ${lineErrors[`${line.id}_units`] ? 'border-red-400' : 'border-gray-200'}`}
              />
              {lineErrors[`${line.id}_units`] && <p className="text-red-500 text-xs mt-1">{lineErrors[`${line.id}_units`]}</p>}
            </div>

            {/* Cajas */}
            <div>
              <input
                type="number"
                value={line.total_boxes}
                onChange={(e) => updateLine(line.id, 'total_boxes', Number(e.target.value))}
                min={0}
                placeholder="Cajas"
                className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white transition-all ${lineErrors[`${line.id}_boxes`] ? 'border-red-400' : 'border-gray-200'}`}
              />
              {lineErrors[`${line.id}_boxes`] && <p className="text-red-500 text-xs mt-1">{lineErrors[`${line.id}_boxes`]}</p>}
            </div>

            {/* Eliminar línea */}
            <button
              type="button"
              onClick={() => removeLine(line.id)}
              disabled={lines.length === 1}
              title="Eliminar esta entrada"
              className="mt-0.5 p-2 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        {/* Resumen cuando hay múltiples líneas */}
        {isMultiLine && (
          <div className="flex justify-end gap-4 px-2 pt-1 border-t border-indigo-100">
            <span className="text-xs text-gray-500">
              Total QTY: <strong className="text-indigo-700">{lines.reduce((s, l) => s + l.total_units, 0).toLocaleString()}</strong>
            </span>
            <span className="text-xs text-gray-500">
              Total Cajas: <strong className="text-indigo-700">{lines.reduce((s, l) => s + l.total_boxes, 0)}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Aviso de múltiples registros */}
      {isMultiLine && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <span className="text-amber-500 text-sm mt-0.5">ℹ</span>
          <p className="text-xs text-amber-700">
            Se crearán <strong>{lines.length} registros</strong> independientes con el mismo Part Number. Cada uno tendrá su propio número FIFO consecutivo y su propia etiqueta.
          </p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3 pt-4 border-t border-gray-100">
        <button type="button" onClick={onCancel}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all active:scale-95">
          <X className="h-4 w-4" />
          Cancelar
        </button>
        <button type="submit"
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 shadow-md"
          style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', boxShadow: '0 4px 14px 0 rgba(79,70,229,0.35)' }}>
          <Save className="h-4 w-4" />
          {record ? 'Actualizar' : isMultiLine ? `Guardar ${lines.length} registros` : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
