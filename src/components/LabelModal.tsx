import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/lib/supabase';
import type { Entry } from '@/lib/supabase';
import { X, Printer, Loader2, Tag } from 'lucide-react';

interface LabelModalProps {
  record: Entry;
  onClose: () => void;
}

export function LabelModal({ record, onClose }: LabelModalProps) {
  const [fifoNumber, setFifoNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  // Contenido del QR: Part Number + QTY
  const qrContent = `Part Number: ${record.part_number}\nQTY: ${record.total_units}`;

  // Fecha formateada
  const formattedDate = new Date(record.registered_at).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  useEffect(() => {
    generateFifoLabel();
  }, []);

  const generateFifoLabel = async () => {
    setLoading(true);
    setError(null);

    try {
      // Obtener el último número FIFO registrado
      const { data: lastLabel, error: fetchError } = await supabase
        .from('fifo_labels')
        .select('fifo_number')
        .order('fifo_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const nextFifo = (lastLabel?.fifo_number ?? 0) + 1;

      // Insertar el nuevo registro de etiqueta
      const { error: insertError } = await supabase.from('fifo_labels').insert([
        {
          fifo_number: nextFifo,
          entry_id: record.id,
          part_number: record.part_number,
          description: record.description,
          qty: record.total_units,
          po: record.po,
          registered_at: record.registered_at,
        },
      ]);

      if (insertError) throw insertError;

      setFifoNumber(nextFifo);
    } catch (err: unknown) {
      console.error('Error generando etiqueta FIFO:', err);
      setError('No se pudo generar el número FIFO. Verifica que la tabla fifo_labels exista en Supabase.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const printContent = labelRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank', 'width=600,height=500');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Etiqueta FIFO ${fifoNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: Arial, sans-serif;
              background: #fff;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
            }
            .label-wrapper {
              width: 100mm;
              padding: 0;
            }
            @media print {
              body { background: #fff; }
              @page { size: 100mm 150mm; margin: 4mm; }
            }
          </style>
        </head>
        <body>
          <div class="label-wrapper">
            ${printContent.innerHTML}
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); window.close(); }, 300);
            };
          <\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100">
        {/* Header del modal */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)' }}>
              <Tag className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Etiqueta FIFO</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-10 w-10 text-violet-500 animate-spin" />
              <p className="text-gray-500 text-sm font-medium">Generando número FIFO...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-red-600 text-sm font-medium">{error}</p>
              <p className="text-red-400 text-xs mt-2">
                Ejecuta el SQL de creación de tabla <code>fifo_labels</code> en Supabase y vuelve a intentarlo.
              </p>
            </div>
          ) : (
            <>
              {/* Vista previa de la etiqueta */}
              <div className="flex justify-center mb-5">
                <div
                  ref={labelRef}
                  style={{
                    width: '340px',
                    border: '2px solid #1e1b4b',
                    borderRadius: '8px',
                    fontFamily: 'Arial, sans-serif',
                    background: '#ffffff',
                    overflow: 'hidden',
                  }}
                >
                  {/* Cabecera con FIFO */}
                  <div
                    style={{
                      background: 'linear-gradient(135deg, #1e1b4b 0%, #4f46e5 100%)',
                      padding: '10px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <p style={{ color: '#a5b4fc', fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>
                        PXG INTERNO
                      </p>
                      <p style={{ color: '#ffffff', fontSize: '11px', fontWeight: 700, margin: '2px 0 0 0' }}>
                        Control de Entradas
                      </p>
                    </div>
                    <div
                      style={{
                        background: '#f59e0b',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        textAlign: 'center',
                      }}
                    >
                      <p style={{ color: '#1e1b4b', fontSize: '8px', fontWeight: 700, margin: 0, letterSpacing: '1px' }}>FIFO</p>
                      <p style={{ color: '#1e1b4b', fontSize: '20px', fontWeight: 900, margin: 0, lineHeight: 1 }}>
                        {fifoNumber}
                      </p>
                    </div>
                  </div>

                  {/* Cuerpo */}
                  <div style={{ padding: '12px 14px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    {/* Info izquierda */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Fecha */}
                      <div style={{ marginBottom: '8px' }}>
                        <p style={{ fontSize: '8px', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 2px 0' }}>
                          Fecha
                        </p>
                        <p style={{ fontSize: '11px', color: '#111827', fontWeight: 600, margin: 0 }}>
                          {formattedDate}
                        </p>
                      </div>

                      {/* PO */}
                      <div style={{ marginBottom: '8px' }}>
                        <p style={{ fontSize: '8px', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 2px 0' }}>
                          PO
                        </p>
                        <p style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 700, margin: 0 }}>
                          {record.po || '—'}
                        </p>
                      </div>

                      {/* Part Number */}
                      <div style={{ marginBottom: '8px' }}>
                        <p style={{ fontSize: '8px', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 2px 0' }}>
                          Part Number
                        </p>
                        <p style={{ fontSize: '10px', color: '#1e1b4b', fontWeight: 800, fontFamily: 'monospace', margin: 0, wordBreak: 'break-all' }}>
                          {record.part_number}
                        </p>
                      </div>

                      {/* Descripción */}
                      <div style={{ marginBottom: '8px' }}>
                        <p style={{ fontSize: '8px', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 2px 0' }}>
                          Descripción
                        </p>
                        <p style={{ fontSize: '9px', color: '#374151', fontWeight: 500, margin: 0, lineHeight: '1.3' }}>
                          {record.description || '—'}
                        </p>
                      </div>

                      {/* QTY */}
                      <div
                        style={{
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          borderRadius: '6px',
                          padding: '5px 8px',
                          display: 'inline-block',
                        }}
                      >
                        <p style={{ fontSize: '8px', color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 1px 0' }}>
                          QTY
                        </p>
                        <p style={{ fontSize: '20px', color: '#1d4ed8', fontWeight: 900, margin: 0, lineHeight: 1 }}>
                          {record.total_units.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* QR derecha */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                      <div
                        style={{
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          padding: '6px',
                          background: '#fff',
                        }}
                      >
                        <QRCodeSVG
                          value={qrContent}
                          size={90}
                          level="M"
                          bgColor="#ffffff"
                          fgColor="#1e1b4b"
                        />
                      </div>
                      <p style={{ fontSize: '7px', color: '#9ca3af', textAlign: 'center', margin: 0, maxWidth: '90px', lineHeight: '1.2' }}>
                        Escanea para ver Part Number y QTY
                      </p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div
                    style={{
                      background: '#f9fafb',
                      borderTop: '1px solid #e5e7eb',
                      padding: '5px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <p style={{ fontSize: '8px', color: '#9ca3af', margin: 0 }}>
                      Registrado por: {record.registered_by ?? '—'}
                    </p>
                    <p style={{ fontSize: '8px', color: '#9ca3af', margin: 0 }}>
                      ID: {record.id}
                    </p>
                  </div>
                </div>
              </div>

              {/* Botones */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all active:scale-95"
                >
                  <X className="h-4 w-4" />
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', boxShadow: '0 4px 14px 0 rgba(124,58,237,0.35)' }}
                >
                  <Printer className="h-4 w-4" />
                  Imprimir / Guardar PDF
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
