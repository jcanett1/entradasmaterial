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

  // Fecha formateada igual que la imagen: DD/Mon/YY
  const formattedDate = new Date(record.registered_at).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });

  useEffect(() => {
    loadFifoLabel();
  }, []);

  const loadFifoLabel = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('fifo_labels')
        .select('fifo_number')
        .eq('entry_id', record.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!data) {
        setError('Esta entrada no tiene etiqueta FIFO asignada. Solo los registros nuevos generan etiqueta automáticamente.');
      } else {
        setFifoNumber(data.fifo_number);
      }
    } catch (err: unknown) {
      console.error('Error cargando etiqueta FIFO:', err);
      setError('No se pudo cargar el número FIFO. Verifica que la tabla fifo_labels exista en Supabase.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const printContent = labelRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank', 'width=800,height=500');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Etiqueta FIFO ${fifoNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body {
              width: 102mm;
              height: 54mm;
              background: #fff;
              font-family: Arial, Helvetica, sans-serif;
            }
            @media print {
              html, body { width: 102mm; height: 54mm; }
              @page {
                size: 102mm 54mm landscape;
                margin: 0;
              }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); window.close(); }, 400);
            };
          <\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ── Etiqueta física (102mm × 54mm landscape) ──────────────────────────────
  // Escala de pantalla: 1mm ≈ 3.78px → 102mm ≈ 385px, 54mm ≈ 204px
  const LABEL_W = 385;
  const LABEL_H = 204;

  const LabelContent = () => (
    <div
      style={{
        width: `${LABEL_W}px`,
        height: `${LABEL_H}px`,
        background: '#ffffff',
        border: '1.5px solid #333',
        borderRadius: '4px',
        display: 'flex',
        flexDirection: 'row',
        overflow: 'hidden',
        fontFamily: 'Arial, Helvetica, sans-serif',
        position: 'relative',
      }}
    >
      {/* ── Columna izquierda: QR ── */}
      <div
        style={{
          width: '130px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '10px 6px 24px 10px',
          flexShrink: 0,
        }}
      >
        <QRCodeSVG
          value={qrContent}
          size={108}
          level="M"
          bgColor="#ffffff"
          fgColor="#000000"
        />
      </div>

      {/* ── Divisor vertical ── */}
      <div style={{ width: '1px', background: '#ccc', margin: '10px 0' }} />

      {/* ── Columna derecha: datos ── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '10px 12px 24px 14px',
          gap: '6px',
          minWidth: 0,
        }}
      >
        {/* Fecha */}
        <p
          style={{
            fontSize: '22px',
            fontWeight: 700,
            color: '#000',
            margin: 0,
            lineHeight: 1.1,
            letterSpacing: '-0.3px',
          }}
        >
          {formattedDate}
        </p>

        {/* PO */}
        <p
          style={{
            fontSize: '17px',
            fontWeight: 700,
            color: '#000',
            margin: 0,
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          PO: {record.po || '—'}
        </p>

        {/* Part Number */}
        <p
          style={{
            fontSize: '15px',
            fontWeight: 800,
            color: '#000',
            margin: 0,
            lineHeight: 1.1,
            fontFamily: 'Arial, monospace',
            wordBreak: 'break-all',
          }}
        >
          {record.part_number}
        </p>

        {/* QTY */}
        <p
          style={{
            fontSize: '20px',
            fontWeight: 900,
            color: '#000',
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          QTY: {record.total_units.toLocaleString()}
        </p>
      </div>

      {/* ── Footer: FIFO abajo a la izquierda ── */}
      <div
        style={{
          position: 'absolute',
          bottom: '5px',
          left: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span
          style={{
            fontSize: '9px',
            fontWeight: 700,
            color: '#555',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}
        >
          FIFO:
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 900,
            color: '#000',
          }}
        >
          {fifoNumber}
        </span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-gray-100">

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)' }}>
              <Tag className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Etiqueta FIFO</h2>
              <p className="text-xs text-gray-400">DYMO 550 · 102mm × 54mm</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="h-10 w-10 text-violet-500 animate-spin" />
              <p className="text-gray-500 text-sm font-medium">Cargando etiqueta...</p>
            </div>
          ) : error ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-amber-700 text-sm font-medium">{error}</p>
              <p className="text-amber-500 text-xs mt-2">El número FIFO se asigna automáticamente solo al crear un nuevo registro.</p>
              <button onClick={onClose} className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold border border-amber-200 bg-white text-amber-700 hover:bg-amber-50 transition-all">
                Cerrar
              </button>
            </div>
          ) : (
            <>
              {/* Vista previa */}
              <div className="flex justify-center mb-5">
                <div ref={labelRef}>
                  <LabelContent />
                </div>
              </div>

              {/* Info de escala */}
              <p className="text-center text-xs text-gray-400 mb-5">
                Vista previa a escala de pantalla · La impresión se ajusta a 102 × 54 mm
              </p>

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
