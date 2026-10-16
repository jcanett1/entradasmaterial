import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, MapPin, Package, RefreshCw, Search, Warehouse } from 'lucide-react';
import { fetchLocationAssignments, LocationAssignment } from '@/services/locationReportService';

type StorageFilter = 'todos' | 'principal' | 'kitteo';
type ExportRow = {
  Almacén: string;
  Rack: string;
  Locación: string;
  Estado: string;
  'Número de parte': string;
  'Partidas del número en la locación': number;
  Cantidad: number;
  PO: string;
  FIFO: string;
  'Asignado desde': string;
};

const numberFormatter = new Intl.NumberFormat('es-MX');
const formatNumber = (value: number) => numberFormatter.format(Math.round(value));
const formatDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};
const fileDate = () => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
};
const storageLabel = (storageType: LocationAssignment['storage_type']) => storageType === 'kitteo' ? 'KITTEO' : 'Rack principal';
const partKey = (partNumber: string) => partNumber.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, '').toUpperCase();
const locationKey = (row: LocationAssignment) => `${row.storage_type}|${row.location_id}|${partKey(row.part_number)}`;

function toExportRow(row: LocationAssignment, occurrenceCount: number): ExportRow {
  return {
    Almacén: storageLabel(row.storage_type),
    Rack: row.rack || '—',
    Locación: row.location_code || '—',
    Estado: row.location_status === 'ocupado' ? 'Ocupado' : 'Disponible',
    'Número de parte': row.part_number,
    'Partidas del número en la locación': occurrenceCount,
    Cantidad: row.qty,
    PO: row.po || '—',
    FIFO: row.fifo_number === null ? '—' : String(row.fifo_number),
    'Asignado desde': formatDate(row.assigned_at),
  };
}

export function LocationBreakdown() {
  const [assignments, setAssignments] = useState<LocationAssignment[]>([]);
  const [storageFilter, setStorageFilter] = useState<StorageFilter>('todos');
  const [rackFilter, setRackFilter] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  const loadAssignments = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    try {
      setAssignments(await fetchLocationAssignments());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el desglose de inventario.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const availableRacks = useMemo(() => {
    const rows = storageFilter === 'todos'
      ? assignments
      : assignments.filter(row => row.storage_type === storageFilter);
    return [...new Set(rows.map(row => row.rack).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, 'es', { numeric: true }));
  }, [assignments, storageFilter]);

  useEffect(() => {
    if (rackFilter !== 'todos' && !availableRacks.includes(rackFilter)) setRackFilter('todos');
  }, [availableRacks, rackFilter]);

  const occurrenceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    assignments.forEach(row => {
      const key = locationKey(row);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [assignments]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('es-MX');
    return assignments.filter(row => {
      const matchesStorage = storageFilter === 'todos' || row.storage_type === storageFilter;
      const matchesRack = rackFilter === 'todos' || row.rack === rackFilter;
      const searchableValues = [
        row.location_code,
        row.rack,
        row.part_number,
        row.po ?? '',
        row.fifo_number === null ? '' : String(row.fifo_number),
      ];
      const matchesSearch = !normalizedSearch || searchableValues.some(value => value.toLocaleLowerCase('es-MX').includes(normalizedSearch));
      return matchesStorage && matchesRack && matchesSearch;
    });
  }, [assignments, rackFilter, searchTerm, storageFilter]);

  const exportRows = useMemo(
    () => filteredRows.map(row => toExportRow(row, occurrenceCounts.get(locationKey(row)) ?? 1)),
    [filteredRows, occurrenceCounts],
  );
  const uniqueParts = useMemo(() => new Set(filteredRows.map(row => partKey(row.part_number))).size, [filteredRows]);
  const uniqueLocations = useMemo(() => new Set(filteredRows.map(row => `${row.storage_type}|${row.location_id}`)).size, [filteredRows]);
  const totalUnits = filteredRows.reduce((total, row) => total + row.qty, 0);

  const exportExcel = async () => {
    if (exportRows.length === 0) return;
    setExporting('excel');
    try {
      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      worksheet['!cols'] = [
        { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 13 }, { wch: 38 },
        { wch: 30 }, { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 24 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Desglose');
      XLSX.writeFile(workbook, `desglose-locaciones-${fileDate()}.xlsx`);
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    if (exportRows.length === 0) return;
    setExporting('pdf');
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      document.setFontSize(15);
      document.setTextColor(31, 41, 55);
      document.text('Desglose de inventario por locación', 12, 14);
      document.setFontSize(8);
      document.setTextColor(100, 116, 139);
      document.text(`Generado: ${new Date().toLocaleString('es-MX')} · ${formatNumber(exportRows.length)} partidas · ${formatNumber(totalUnits)} unidades`, 12, 20);
      autoTable(document, {
        startY: 25,
        margin: { left: 10, right: 10 },
        head: [['Almacén', 'Rack', 'Locación', 'Estado', 'Número de parte', 'Partidas del PN', 'Cantidad', 'PO', 'FIFO', 'Asignado desde']],
        body: exportRows.map(row => [
          row.Almacén,
          row.Rack,
          row.Locación,
          row.Estado,
          row['Número de parte'],
          formatNumber(row['Partidas del número en la locación']),
          formatNumber(row.Cantidad),
          row.PO,
          row.FIFO,
          row['Asignado desde'],
        ]),
        styles: { fontSize: 6.5, cellPadding: 1.6, overflow: 'linebreak' },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 12 },
          2: { cellWidth: 18 },
          3: { cellWidth: 17 },
          4: { cellWidth: 48 },
          5: { cellWidth: 22, halign: 'right' },
          6: { cellWidth: 17, halign: 'right' },
          7: { cellWidth: 25 },
          8: { cellWidth: 15, halign: 'right' },
          9: { cellWidth: 32 },
        },
        didParseCell: hookData => {
          if (hookData.section === 'body' && hookData.column.index === 3) {
            hookData.cell.styles.textColor = hookData.cell.raw === 'Ocupado' ? [29, 78, 216] : [5, 150, 105];
          }
        },
      });
      document.save(`desglose-locaciones-${fileDate()}.pdf`);
    } finally {
      setExporting(null);
    }
  };

  const clearFilters = () => {
    setStorageFilter('todos');
    setRackFilter('todos');
    setSearchTerm('');
  };

  if (loading) {
    return <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-2xl border border-gray-100 bg-white shadow-sm"><RefreshCw className="h-8 w-8 animate-spin text-indigo-500" /><p className="text-sm font-semibold text-gray-600">Cargando partidas y números FIFO...</p></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50/70 p-4 md:flex-row md:items-center">
        <div>
          <h3 className="text-sm font-black text-violet-950">Desglose por locación, número de parte y FIFO</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-violet-800">Cada fila representa una partida asignada e indica su cantidad, PO y FIFO. “Partidas del número en la locación” cuenta cuántas partidas activas de ese mismo número de parte hay en esa locación.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={() => void loadAssignments()} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 shadow-sm transition hover:bg-gray-50"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Actualizar</button>
          <button type="button" onClick={() => void exportExcel()} disabled={!exportRows.length || exporting !== null} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"><FileSpreadsheet className="h-3.5 w-3.5" /> {exporting === 'excel' ? 'Generando...' : 'Excel'}</button>
          <button type="button" onClick={() => void exportPdf()} disabled={!exportRows.length || exporting !== null} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 shadow-sm transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"><FileText className="h-3.5 w-3.5" /> {exporting === 'pdf' ? 'Generando...' : 'PDF'}</button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">No se pudo cargar el desglose: {error}</div>}

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Tipo de almacén<select value={storageFilter} onChange={event => setStorageFilter(event.target.value as StorageFilter)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold normal-case text-gray-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"><option value="todos">Racks y KITTEO</option><option value="principal">Solo racks principales</option><option value="kitteo">Solo KITTEO</option></select></label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Rack<select value={rackFilter} onChange={event => setRackFilter(event.target.value)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold normal-case text-gray-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"><option value="todos">Todos los racks</option>{availableRacks.map(rack => <option key={rack} value={rack}>Rack {rack}</option>)}</select></label>
          <label className="relative flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Buscar número, PO, FIFO o locación<div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Ej. A-01, A-ALIGNSTICKS, PO o FIFO..." className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-xs normal-case text-gray-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></div></label>
        </div>
        <div className="mt-3 flex justify-end"><button type="button" onClick={clearFilters} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800">Limpiar filtros</button></div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4"><div className="flex items-center gap-2 text-indigo-600"><Package className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-wide">Partidas detalladas</span></div><p className="mt-2 text-2xl font-black text-indigo-800">{formatNumber(filteredRows.length)}</p></div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4"><div className="flex items-center gap-2 text-blue-600"><Warehouse className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-wide">Números de parte</span></div><p className="mt-2 text-2xl font-black text-blue-800">{formatNumber(uniqueParts)}</p></div>
        <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4"><div className="flex items-center gap-2 text-orange-600"><Warehouse className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-wide">Cantidad total</span></div><p className="mt-2 text-2xl font-black text-orange-800">{formatNumber(totalUnits)}</p></div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4"><div className="flex items-center gap-2 text-emerald-600"><MapPin className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-wide">Locaciones con partidas</span></div><p className="mt-2 text-2xl font-black text-emerald-800">{formatNumber(uniqueLocations)}</p></div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-2 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center"><div><h3 className="text-sm font-bold text-gray-800">Detalle de partidas asignadas</h3><p className="mt-1 text-[11px] text-gray-400">Una fila por asignación para consultar cada PO, FIFO y cantidad individualmente.</p></div><span className="text-[11px] font-semibold text-gray-500">{formatNumber(filteredRows.length)} filas para exportar</span></div>
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-left text-xs">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3 font-bold">Almacén</th><th className="px-3 py-3 font-bold">Rack</th><th className="px-3 py-3 font-bold">Locación</th><th className="px-3 py-3 font-bold">Estado</th><th className="min-w-[230px] px-3 py-3 font-bold">Número de parte</th><th className="px-3 py-3 text-right font-bold">Partidas del PN</th><th className="px-3 py-3 text-right font-bold">Cantidad</th><th className="px-3 py-3 font-bold">PO</th><th className="px-3 py-3 text-right font-bold">FIFO</th><th className="px-5 py-3 font-bold">Asignado desde</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.length === 0
                ? <tr><td colSpan={10} className="px-5 py-14 text-center text-sm text-gray-400">No hay partidas que coincidan con los filtros seleccionados.</td></tr>
                : filteredRows.map(row => <tr key={row.record_id} className="transition hover:bg-indigo-50/30"><td className="px-5 py-3 font-semibold text-gray-700">{storageLabel(row.storage_type)}</td><td className="px-3 py-3 font-bold text-gray-700">{row.rack || '—'}</td><td className="px-3 py-3 font-bold text-indigo-700">{row.location_code || '—'}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${row.location_status === 'ocupado' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{row.location_status === 'ocupado' ? 'Ocupado' : 'Disponible'}</span></td><td className="max-w-[330px] px-3 py-3 font-medium text-gray-700">{row.part_number}</td><td className="px-3 py-3 text-right text-gray-600">{formatNumber(occurrenceCounts.get(locationKey(row)) ?? 1)}</td><td className="px-3 py-3 text-right font-bold text-gray-800">{formatNumber(row.qty)}</td><td className="px-3 py-3 text-gray-600">{row.po || '—'}</td><td className="px-3 py-3 text-right font-semibold text-gray-700">{row.fifo_number === null ? '—' : formatNumber(row.fifo_number)}</td><td className="px-5 py-3 text-gray-500">{formatDate(row.assigned_at)}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-3 text-[10px] text-gray-400"><Download className="h-3.5 w-3.5" /> Excel y PDF descargan las filas visibles con los filtros actuales. El conteo de partidas considera el total del número de parte en la locación, aunque haya filtros de búsqueda.</div>
      </section>
    </div>
  );
}
