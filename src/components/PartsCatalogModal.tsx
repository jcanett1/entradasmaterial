import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Hash, Loader2, Save, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface PartsCatalogModalProps {
  onClose: () => void;
}

export function PartsCatalogModal({ onClose }: PartsCatalogModalProps) {
  const [inventoryId, setInventoryId] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, saving]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedInventoryId = inventoryId.trim();

    if (!normalizedInventoryId) {
      setError('El número de parte es requerido.');
      return;
    }

    if (normalizedInventoryId.length > 150) {
      setError('El número de parte no puede exceder 150 caracteres.');
      return;
    }

    setError('');
    setSaving(true);

    const { error: insertError } = await supabase.from('parts_catalog').insert({
      inventory_id: normalizedInventoryId,
      description: description.trim() || null,
    });

    if (insertError) {
      setSaving(false);
      if (insertError.code === '23505') {
        setError('Ese número de parte ya existe en el catálogo.');
      } else if (insertError.code === '42501') {
        setError('No tienes permisos para agregar números de parte.');
      } else {
        console.error('Error al crear número de parte:', insertError);
        setError('No se pudo guardar el número de parte. Intenta de nuevo.');
      }
      return;
    }

    setSaving(false);
    setSaved(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="presentation">
      <div
        className="animate-in w-full max-w-lg rounded-2xl border border-gray-100 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="parts-catalog-title"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2" style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}>
              <Hash className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 id="parts-catalog-title" className="text-lg font-bold text-gray-900">Nuevo número de parte</h2>
              <p className="mt-0.5 text-xs text-gray-500">Se guardará en el catálogo de inventario</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar"
            className="rounded-xl p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {saved ? (
          <div className="px-6 py-8">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-bold text-emerald-800">Número de parte guardado</p>
                <p className="mt-1 text-xs text-emerald-700">
                  <span className="font-mono font-semibold">{inventoryId.trim()}</span> ya está disponible en el catálogo.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:brightness-105 active:scale-95"
              style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 px-6 pb-6 pt-5">
            <div>
              <label htmlFor="parts-catalog-inventory-id" className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
                <Hash className="h-3.5 w-3.5 text-indigo-400" />
                Número de parte <span className="text-red-400">*</span>
              </label>
              <input
                id="parts-catalog-inventory-id"
                name="inventory_id"
                type="text"
                value={inventoryId}
                onChange={(event) => {
                  setInventoryId(event.target.value);
                  if (error) setError('');
                }}
                maxLength={150}
                autoComplete="off"
                autoFocus
                placeholder="Ej. ABC-12345"
                className={`w-full rounded-xl border bg-gray-50 px-4 py-2.5 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-400 ${error ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}
              />
              <p className="mt-1.5 text-right text-xs text-gray-400">{inventoryId.length}/150</p>
            </div>

            <div>
              <label htmlFor="parts-catalog-description" className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
                <FileText className="h-3.5 w-3.5 text-indigo-400" />
                Descripción
              </label>
              <textarea
                id="parts-catalog-description"
                name="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Describe el material (opcional)..."
                className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-400 hover:border-gray-300"
              />
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-3 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Guardando...' : 'Guardar número de parte'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
