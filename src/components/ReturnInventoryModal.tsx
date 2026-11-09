import React, { useState } from 'react';
import { Loader2, RotateCcw, X, AlertTriangle } from 'lucide-react';
import type { Entry } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import type { TerminalExit } from '@/lib/terminalExitState';

export function ReturnInventoryModal({ entry, exits, onClose, onReturned }: {
  entry: Entry;
  exits: TerminalExit[];
  onClose: () => void;
  onReturned: () => Promise<void>;
}) {
  const [selectedKey, setSelectedKey] = useState(exits.length === 1 ? `${exits[0].source}:${exits[0].id}` : '');
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedExit = exits.find(exit => `${exit.source}:${exit.id}` === selectedKey);

  const handleReturn = async () => {
    if (!selectedExit || !acknowledged || saving) return;
    setSaving(true);
    setError('');
    try {
      const { error: rpcError } = await supabase.rpc('return_final_exit_to_inventory', {
        p_entry_id: entry.id,
        p_source_exit_type: selectedExit.source,
        p_source_exit_id: selectedExit.id,
      });
      if (rpcError) throw new Error(rpcError.message);
      await onReturned();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo verificar la devolución. Actualiza el inventario antes de intentarlo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="return-inventory-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 id="return-inventory-title" className="text-lg font-bold text-gray-900">Regresar a inventario</h2>
          <button type="button" disabled={saving} onClick={onClose} aria-label="Cerrar devolución" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-3 text-sm text-gray-600">Entrada <strong>#{entry.id}</strong> · <strong>{entry.part_number}</strong>{entry.po ? ` · PO ${entry.po}` : ''}</p>
        <p className="mt-2 text-sm text-gray-600">Se marcará la salida seleccionada como devuelta. Se conserva la misma entrada, su FIFO y fecha original; no se crea un registro nuevo ni se asigna automáticamente a una locación.</p>
        <label htmlFor="return-exit-source" className="mt-4 block text-sm font-semibold text-gray-700">Salida definitiva que deseas regresar</label>
        <select id="return-exit-source" value={selectedKey} disabled={saving} onChange={event => { setSelectedKey(event.target.value); setAcknowledged(false); }} className="mt-2 w-full rounded-xl border border-gray-200 p-3 text-sm">
          <option value="">Selecciona una salida</option>
          {exits.map(exit => <option key={`${exit.source}:${exit.id}`} value={`${exit.source}:${exit.id}`}>
            {exit.source === 'shipping_direct' ? 'Shipping Direct' : 'KITTEO'} #{exit.id} · {exit.qty ?? 0} unidades · {exit.exited_at ? new Date(exit.exited_at).toLocaleString('es-MX') : 'Sin fecha'}
          </option>)}
        </select>
        {selectedExit?.entry_id === null && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle className="mr-1 inline h-4 w-4" />Esta salida histórica no tiene vínculo directo con una entrada. Confirma que pertenece a la entrada #{entry.id}. Si coincide con varias, solo se liberará la seleccionada y se registrará la ambigüedad para auditoría.</p>}
        <p className="mt-3 text-xs text-gray-500">Si quedan otras salidas activas, transferencias o asignaciones de esta entrada, conservará el bloqueo correspondiente. Los reportes netos dejarán de descontar esta salida; su historial no se borra.</p>
        <label className="mt-4 flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" checked={acknowledged} disabled={saving || !selectedExit} onChange={event => setAcknowledged(event.target.checked)} className="mt-1" />Confirmo que el material de esta salida regresó y corresponde a esta entrada.</label>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={saving} onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 disabled:opacity-50">Cancelar</button>
          <button type="button" disabled={!selectedExit || !acknowledged || saving} onClick={() => void handleReturn()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}{saving ? 'Regresando…' : 'Regresar a inventario'}
          </button>
        </div>
      </section>
    </div>
  );
}
