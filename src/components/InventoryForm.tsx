import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Entry, NewEntry } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import {
  Hash, FileText, Boxes, Archive, Ruler, Save, X,
  ClipboardList, Search, Loader2, Plus, Trash2, Copy,
} from 'lucide-react';

// Una línea de cantidad dentro del mismo número de parte
export interface EntryLine {
  id: string;
  total_units: number;
  total_boxes: number;
  repeat: boolean;   // ¿activar repetición?
  repeat_count: number; // cuántas veces repetir (mínimo 2)
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
  repeat: false,
  repeat_count: 2,
});

// Expande las líneas según repeat/repeat_count antes de enviar al padre
const expandLines = (lines: EntryLine[]): EntryLine[] => {
  const result: EntryLine[] = [];
  for (const line of lines) {
    const times = line.repeat ? Math.max(2, line.repeat_count) : 1;
    for (let i = 0; i < times; i++) {
      result.push({ ...line, id: `${line.id}_${i}`, repeat: false, repeat_count: 1 });
    }
  }
  return result;
};

// Cuenta total de registros que se crearán
const totalRecords = (lines: EntryLine[]) =>
  lines.reduce((sum, l) => sum + (l.repeat ? Math.max(2, l.repeat_count) : 1), 0);

export function InventoryForm({ record, userEmail, onSave, onCancel }: InventoryFormProps) {
  const [formData, setFormData] = useState<Omit<NewEntry, 'total_units' | 'total_boxes'>>({
    part_number: '',
    description: '',
    unit_of_measure: 'Caja',
    registered_by: userEmail,
    po: '',
  });

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
      setLines([{ id: 'edit', total_units: record.total_units, total_boxes: record.total_boxes, repeat: false, repeat_count: 2 }]);
    }
  }, [record]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    if (lines.length === 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, field: keyof EntryLine, value: number | boolean) => {
    setLines((prev) => prev.map((l) => l.id === id ? { ...l, [field]: value } : l));
    const key = field === 'total_units' ? `${id}_units` : field === 'total_boxes' ? `${id}_boxes` : '';
    if (key && lineErrors[key]) setLineErrors((prev) => ({ ...prev, [key]: '' }));
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

    const expanded = expandLines(lines);

    if (record) {
      onSave({ ...formData, total_units: lines[0].total_units, total_boxes: lines[0].total_boxes } as NewEntry);
    } else if (expanded.length === 1) {
      onSave({ ...formData, total_units: expanded[0].total_units, total_boxes: expanded[0].total_boxes } as NewEntry);
    } else {
      onSave({ base: formData, lines: expanded } as MultiEntry);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const unitOptions = ['Caja', 'Unidad', 'Pieza', 'Paquete', 'Kilogramo', 'Gramo', 'Litro', 'Metro', 'Otro'];

  const inputClass = (field: string) =>
    `w-full px-4 py-2.5 border rounded-xl text-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-gray-50 ${
      errors[field] ? 'border-red-400 bg-red-50 focus:ring-red-400' : 'border-gray-200 hover:border-gray-300'
    }`;

  const total = !record ? totalRecords(lines) : 1;
  const isMulti = !record && total > 1;

  return (
    <form onSubmit={handleSubmit} className="px-6 pb-6 pt-5 space-y-4">

      {/* Part Number */}
      <div ref={dropdownRef} className="relative">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          <Hash className="h-3.5 w-3.5 text-indigo-400" />
          Part Number <span className="text-red-400">*</span>
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          {loadingSuggestions && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-400 animate-spin pointer-events-none" />}
          <input type="text" value={searchTerm} onChange={handleSearchChange}
            onFocus={() => { if (suggestions.length > 0 && !partSelected) setShowDropdown(true); }}
            placeholder="Buscar por número de parte o descripción..."
            className={`w-full pl-10 pr-10 py-2.5 border rounded-xl text-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-gray-50 ${
              errors.part_number ? 'border-red-400 bg-red-50' : partSelected ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
            }`}
            autoComplete="off" disabled={!!record} />
        </div>
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
            <div className="max-h-56 overflow-y-auto">
              {suggestions.map((part) => (
                <button key={part.inventory_id} type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSelectPart(part); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors border-b border-gray-50 last:border-0 group">
                  <p className="text-sm font-semibold text-indigo-700 font-mono">{part.inventory_id}</p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{part.description}</p>
                </button>
              ))}
            </div>
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-400">{suggestions.length === 12 ? 'Primeros 12 — escribe más para filtrar' : `${suggestions.length} resultado${suggestions.length !== 1 ? 's' : ''}`}</p>
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
            Cantidades
            {isMulti && (
              <span className="ml-1.5 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold">
                {total} registros
              </span>
            )}
          </label>
          {!record && (
            <button type="button" onClick={addLine}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition-all active:scale-95">
              <Plus className="h-3.5 w-3.5" />
              Agregar mismo Part Number
            </button>
          )}
        </div>

        {/* Encabezado columnas */}
        <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 px-1 items-center">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <Boxes className="h-3 w-3" /> QTY
          </span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <Archive className="h-3 w-3" /> Cajas
          </span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1 whitespace-nowrap">
            <Copy className="h-3 w-3" /> Repetir
          </span>
          <span className="w-7" />
        </div>

        {/* Filas */}
        {lines.map((line, idx) => {
          const lineTotal = line.repeat ? Math.max(2, line.repeat_count) : 1;
          return (
            <div key={line.id}
              className={`rounded-xl border p-2.5 transition-colors ${line.repeat ? 'bg-amber-50/60 border-amber-200' : isMulti ? 'bg-indigo-50/40 border-indigo-100' : 'bg-gray-50 border-gray-100'}`}>

              {/* Número de entrada */}
              {(lines.length > 1) && (
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-bold text-indigo-500 bg-indigo-100 rounded-full w-5 h-5 flex items-center justify-center">{idx + 1}</span>
                  <span className="text-xs text-indigo-400 font-medium">Entrada {idx + 1}</span>
                  {line.repeat && (
                    <span className="ml-auto text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                      × {Math.max(2, line.repeat_count)} registros
                    </span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-start">
                {/* QTY */}
                <div>
                  <input type="number" value={line.total_units} min={0} placeholder="QTY"
                    onChange={(e) => updateLine(line.id, 'total_units', Number(e.target.value))}
                    className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white transition-all ${lineErrors[`${line.id}_units`] ? 'border-red-400' : 'border-gray-200'}`} />
                  {lineErrors[`${line.id}_units`] && <p className="text-red-500 text-xs mt-1">{lineErrors[`${line.id}_units`]}</p>}
                </div>

                {/* Cajas */}
                <div>
                  <input type="number" value={line.total_boxes} min={0} placeholder="Cajas"
                    onChange={(e) => updateLine(line.id, 'total_boxes', Number(e.target.value))}
                    className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white transition-all ${lineErrors[`${line.id}_boxes`] ? 'border-red-400' : 'border-gray-200'}`} />
                  {lineErrors[`${line.id}_boxes`] && <p className="text-red-500 text-xs mt-1">{lineErrors[`${line.id}_boxes`]}</p>}
                </div>

                {/* Repetir: checkbox + número */}
                <div className="flex flex-col items-center gap-1 pt-1">
                  {/* Checkbox */}
                  <label className="flex items-center gap-1 cursor-pointer select-none" title="Repetir esta cantidad N veces">
                    <input type="checkbox" checked={line.repeat}
                      onChange={(e) => updateLine(line.id, 'repeat', e.target.checked)}
                      className="w-4 h-4 rounded accent-amber-500 cursor-pointer" />
                    <span className="text-xs text-gray-500 font-medium">x</span>
                  </label>
                  {/* Número de repeticiones */}
                  {line.repeat && (
                    <input type="number" value={line.repeat_count} min={2} max={999}
                      onChange={(e) => updateLine(line.id, 'repeat_count', Math.max(2, Number(e.target.value)))}
                      className="w-14 px-2 py-1.5 border border-amber-300 rounded-lg text-sm text-center font-bold text-amber-700 bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  )}
                </div>

                {/* Eliminar línea */}
                <button type="button" onClick={() => removeLine(line.id)}
                  disabled={lines.length === 1}
                  className="mt-1 p-2 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-20 disabled:cursor-not-allowed">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Mini resumen cuando está activo el repeat */}
              {line.repeat && (
                <p className="text-xs text-amber-600 font-medium mt-2 flex items-center gap-1">
                  <Copy className="h-3 w-3" />
                  Se crearán {Math.max(2, line.repeat_count)} registros idénticos con QTY {line.total_units} · {line.total_boxes} caja{line.total_boxes !== 1 ? 's' : ''} cada uno
                </p>
              )}
            </div>
          );
        })}

        {/* Resumen total */}
        {isMulti && (
          <div className="flex justify-between items-center px-2 pt-1 border-t border-indigo-100">
            <span className="text-xs font-semibold text-indigo-600">
              Total: {total} registros a crear
            </span>
            <div className="flex gap-4">
              <span className="text-xs text-gray-500">
                QTY total: <strong className="text-indigo-700">
                  {lines.reduce((s, l) => s + l.total_units * (l.repeat ? Math.max(2, l.repeat_count) : 1), 0).toLocaleString()}
                </strong>
              </span>
              <span className="text-xs text-gray-500">
                Cajas total: <strong className="text-indigo-700">
                  {lines.reduce((s, l) => s + l.total_boxes * (l.repeat ? Math.max(2, l.repeat_count) : 1), 0)}
                </strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Aviso */}
      {isMulti && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <span className="text-amber-500 text-sm mt-0.5">ℹ</span>
          <p className="text-xs text-amber-700">
            Se crearán <strong>{total} registros</strong> independientes. Cada uno tendrá su propio número FIFO consecutivo y su propia etiqueta.
          </p>
        </div>
      )}

      {/* Botones */}
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
          {record ? 'Actualizar' : isMulti ? `Guardar ${total} registros` : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
