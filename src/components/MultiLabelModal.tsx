import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/lib/supabase';
import type { Entry } from '@/lib/supabase';
import { X, Printer, Loader2, Tags } from 'lucide-react';

interface FifoData {
  entry_id: number;
  fifo_number: number | null;
}

interface MultiLabelModalProps {
  records: Entry[];
  onClose: () => void;
}

export function MultiLabelModal({ records, onClose }: MultiLabelModalProps) {
  const [fifoMap, setFifoMap] = useState<Record<number, number | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFifoLabels();
  }, []);

  const loadFifoLabels = async () => {
    setLoading(true);
    try {
      const ids = records.map((r) => r.id);
      const { data, error } = await supabase
        .from('fifo_labels')
        .select('entry_id, fifo_number')
        .in('entry_id', ids);

      if (error) throw error;

      const map: Record<number, number | null> = {};
      // Inicializar todos como null
      ids.forEach((id) => { map[id] = null; });
      // Llenar con los datos encontrados
      (data as FifoData[]).forEach((row) => {
        map[row.entry_id] = row.fifo_number;
      });
      setFifoMap(map);
    } catch (err) {
      console.error('Error cargando etiquetas FIFO:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const labelsHtml = records.map((record) => {
      const fifo = fifoMap[record.id];
      const formattedDate = new Date(record.registered_at).toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
      });

      // Generar SVG del QR manualmente para la ventana de impresión
      const qrContent = `Part Number: ${record.part_number}\nQTY: ${record.total_units}\nFIFO: ${fifo ?? 'N/A'}`;
      // Usamos un placeholder de texto para el QR en la impresión (se reemplaza con el SVG real abajo)
      return { record, fifo, formattedDate, qrContent };
    });

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;

    // Generar el HTML de las etiquetas para impresión
    // Cada etiqueta es 102mm × 54mm
    const labelsMarkup = labelsHtml.map(({ record, fifo, formattedDate }) => {
      const qrId = `qr-${record.id}`;
      return `
        <div class="label-page">
          <div class="label">
            <!-- Fila superior -->
            <div class="top-row">
              <span class="date">${formattedDate}</span>
              <span class="part-number">${record.part_number}</span>
              <span class="po">PO: ${record.po || '—'}</span>
            </div>
            <!-- QR -->
            <div class="qr-area">
              <div id="${qrId}" class="qr-placeholder">[QR: ${record.part_number}]</div>
            </div>
            <!-- Fila inferior -->
            <div class="bottom-row">
              <span class="fifo">FIFO: ${fifo ?? 'N/A'}</span>
              <span class="qty">QTY: ${record.total_units.toLocaleString()}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Etiquetas FIFO (${records.length})</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body {
              background: #fff;
              font-family: Arial, Helvetica, sans-serif;
            }
            .label-page {
              width: 102mm;
              height: 54mm;
              page-break-after: always;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .label-page:last-child { page-break-after: avoid; }
            .label {
              width: 102mm;
              height: 54mm;
              border: 1.5px solid #333;
              border-radius: 3px;
              padding: 6px 8px;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              position: relative;
              overflow: hidden;
            }
            .top-row {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              width: 100%;
            }
            .date { font-size: 11px; font-weight: 700; color: #000; white-space: nowrap; min-width: 60px; }
            .part-number { font-size: 12px; font-weight: 800; color: #000; font-family: Arial, monospace; text-align: center; flex: 1; padding: 0 4px; word-break: break-all; line-height: 1.2; }
            .po { font-size: 11px; font-weight: 700; color: #000; white-space: nowrap; text-align: right; min-width: 60px; }
            .qr-area {
              display: flex;
              justify-content: center;
              align-items: center;
              flex: 1;
              padding: 2px 0;
            }
            .qr-area svg { display: block; }
            .bottom-row {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              width: 100%;
            }
            .fifo { font-size: 12px; font-weight: 900; color: #000; letter-spacing: 0.5px; }
            .qty { font-size: 14px; font-weight: 900; color: #000; }
            @media print {
              html, body { background: #fff; }
              .label-page {
                width: 102mm;
                height: 54mm;
              }
              @page {
                size: 102mm 54mm landscape;
                margin: 0;
              }
            }
          </style>
          <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"><\/script>
        </head>
        <body>
          ${labelsMarkup}
          <script>
            // Generar QR codes para cada etiqueta
            var records = ${JSON.stringify(records.map(r => ({
              id: r.id,
              part_number: r.part_number,
              total_units: r.total_units,
              fifo: fifoMap[r.id] ?? 'N/A'
            })))};

            function generateQRs() {
              records.forEach(function(record) {
                var el = document.getElementById('qr-' + record.id);
                if (!el) return;
                var qrText = 'Part Number: ' + record.part_number + '\\nQTY: ' + record.total_units + '\\nFIFO: ' + record.fifo;
                QRCode.toCanvas(qrText, { width: 100, margin: 0, errorCorrectionLevel: 'M' }, function(err, canvas) {
                  if (!err && canvas) {
                    el.innerHTML = '';
                    canvas.style.display = 'block';
                    el.appendChild(canvas);
                  }
                });
              });
            }

            if (typeof QRCode !== 'undefined') {
              generateQRs();
              setTimeout(function() { window.print(); }, 800);
            } else {
              document.querySelector('script[src*="qrcode"]').addEventListener('load', function() {
                generateQRs();
                setTimeout(function() { window.print(); }, 800);
              });
              setTimeout(function() { window.print(); }, 1500);
            }
          <\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Dimensiones de vista previa en pantalla (escala de 102mm × 54mm)
  const LABEL_W = 340;
  const LABEL_H = 180;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl border border-gray-100 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)' }}>
              <Tags className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Imprimir Etiquetas FIFO</h2>
              <p className="text-xs text-gray-400">{records.length} etiqueta{records.length !== 1 ? 's' : ''} seleccionada{records.length !== 1 ? 's' : ''} · DYMO 550 · 102mm × 54mm</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="h-10 w-10 text-violet-500 animate-spin" />
              <p className="text-gray-500 text-sm font-medium">Cargando etiquetas...</p>
            </div>
          ) : (
            <>
              <p className="text-center text-xs text-gray-400 mb-5">
                Vista previa a escala · Se imprimirán {records.length} etiqueta{records.length !== 1 ? 's' : ''}, una por página
              </p>

              {/* Grid de etiquetas */}
              <div className="flex flex-wrap gap-4 justify-center">
                {records.map((record) => {
                  const fifo = fifoMap[record.id];
                  const formattedDate = new Date(record.registered_at).toLocaleDateString('es-MX', {
                    day: '2-digit', month: 'short', year: '2-digit',
                  });
                  const qrContent = `Part Number: ${record.part_number}\nQTY: ${record.total_units}\nFIFO: ${fifo ?? 'N/A'}`;

                  return (
                    <div key={record.id} className="flex flex-col items-center gap-1">
                      {/* Mini etiqueta preview */}
                      <div
                        style={{
                          width: `${LABEL_W}px`,
                          height: `${LABEL_H}px`,
                          background: '#ffffff',
                          border: '1.5px solid #333',
                          borderRadius: '4px',
                          fontFamily: 'Arial, Helvetica, sans-serif',
                          position: 'relative',
                          overflow: 'hidden',
                          padding: '7px 9px',
                          boxSizing: 'border-box',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                        }}
                      >
                        {/* Fila superior */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#000', whiteSpace: 'nowrap', minWidth: '70px' }}>
                            {formattedDate}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#000', fontFamily: 'Arial, monospace', textAlign: 'center', flex: 1, padding: '0 5px', wordBreak: 'break-all', lineHeight: 1.2 }}>
                            {record.part_number}
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#000', whiteSpace: 'nowrap', textAlign: 'right', minWidth: '70px' }}>
                            PO: {record.po || '—'}
                          </span>
                        </div>

                        {/* QR */}
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, padding: '2px 0' }}>
                          <QRCodeSVG value={qrContent} size={90} level="M" bgColor="#ffffff" fgColor="#000000" />
                        </div>

                        {/* Fila inferior */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%' }}>
                          <span style={{ fontSize: '12px', fontWeight: 900, color: '#000', letterSpacing: '0.5px' }}>
                            FIFO: {fifo ?? <span style={{ color: '#999', fontWeight: 400 }}>N/A</span>}
                          </span>
                          <span style={{ fontSize: '14px', fontWeight: 900, color: '#000' }}>
                            QTY: {record.total_units.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {fifo === null && (
                        <span className="text-xs text-amber-500 font-medium">Sin FIFO asignado</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all active:scale-95"
            >
              <X className="h-4 w-4" />
              Cancelar
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', boxShadow: '0 4px 14px 0 rgba(124,58,237,0.35)' }}
            >
              <Printer className="h-4 w-4" />
              Imprimir {records.length} Etiqueta{records.length !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
