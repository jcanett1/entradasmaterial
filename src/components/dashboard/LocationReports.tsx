import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  MapPin,
  Package,
  RefreshCw,
  Search,
  Warehouse,
} from 'lucide-react';
import { DashboardLocation, fetchDashboardLocations } from '@/services/dashboardService';

type StorageFilter = 'todos' | 'principal' | 'kitteo';
type StatusFilter = 'todos' | 'ocupado' | 'disponible';

type ReportRow = {
  'Tipo de almacén': string;
  Rack: string;
  Locación: string;
  Estado: string;
  'Número(s) de parte': string;
  Unidades: number;
  'Grupos asignados': number;
  'Asignado desde': string;
};

const numberFormatter = new Intl.NumberFormat('es-MX');
const formatNumber = (value: number) => numberFormatter.format(Math.round(value));

function formatAssignmentDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fileDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function getStorageLabel(storageType: DashboardLocation['storage_type']) {
  return storageType === 'kitteo' ? 'KITTEO' : 'Rack principal';
}

function getStatusLabel(status: DashboardLocation['location_status']) {
  return status === 'ocupado' ? 'Ocupado' : 'Disponible';
}

function toReportRow(location: DashboardLocation): ReportRow {
  return {
    'Tipo de almacén': getStorageLabel(location.storage_type),
    Rack: location.rack || '—',
    Locación: location.location_code || '—',
    Estado: getStatusLabel(location.location_status),
    'Número(s) de parte': location.part_numbers || '—',
    Unidades: location.units,
    'Grupos asignados': location.item_count,
    'Asignado desde': formatAssignmentDate(location.assigned_at),
  };
}

export function LocationReports() {
  const [locations, setLocations] = useState<DashboardLocation[]>([]);
  const [storageFilter, setStorageFilter] = useState<StorageFilter>('todos');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [rackFilter, setRackFilter] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  const loadLocations = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    try {
      setLocations(await fetchDashboardLocations());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar las locaciones.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  const availableRacks = useMemo(() => {
    const filteredByStorage = storageFilter === 'todos'
      ? locations
      : locations.filter(location => location.storage_type === storageFilter);
    return Array.from(new Set(filteredByStorage.map(location => location.rack).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  }, [locations, storageFilter]);

  useEffect(() => {
    if (rackFilter !== 'todos' && !availableRacks.includes(rackFilter)) setRackFilter('todos');
  }, [availableRacks, rackFilter]);

  const filteredLocations = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return locations.filter(location => {
      const matchesStorage = storageFilter === 'todos' || location.storage_type === storageFilter;
      const matchesStatus = statusFilter === 'todos' || location.location_status === statusFilter;
      const matchesRack = rackFilter === 'todos' || location.rack === rackFilter;
      const matchesSearch = !normalizedSearch || [
        location.location_code,
        location.rack,
        location.part_numbers ?? '',
      ].some(value => value.toLowerCase().includes(normalizedSearch));
      return matchesStorage && matchesStatus && matchesRack && matchesSearch;
    });
  }, [locations, rackFilter, searchTerm, statusFilter, storageFilter]);

  const reportRows = useMemo(() => filteredLocations.map(toReportRow), [filteredLocations]);
  const occupiedCount = filteredLocations.filter(location => location.location_status === 'ocupado').length;
  const partNumbers = useMemo(() => {
    const unique = new Set<string>();
    filteredLocations.forEach(location => {
      (location.part_numbers ?? '').split(',').map(part => part.trim()).filter(Boolean).forEach(part => unique.add(part));
    });
    return unique.size;
  }, [filteredLocations]);
  const totalUnits = filteredLocations.reduce((sum, location) => sum + location.units, 0);

  const exportExcel = async () => {
    if (!reportRows.length) return;
    setExporting('excel');
    try {
      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.json_to_sheet(reportRows);
      worksheet['!cols'] = [
        { wch: 18 },
        { wch: 10 },
        { wch: 14 },
        { wch: 13 },
        { wch: 38 },
        { wch: 14 },
        { wch: 17 },
        { wch: 24 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Locaciones');
      XLSX.writeFile(workbook, `reporte-locaciones-${fileDate()}.xlsx`);
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    if (!reportRows.length) return;
    setExporting('pdf');
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      document.setFontSize(16);
      document.setTextColor(31, 41, 55);
      document.text('Reporte de locaciones e inventario asignado', 14, 15);
      document.setFontSize(9);
      document.setTextColor(100, 116, 139);
      document.text(`Generado: ${new Date().toLocaleString('es-MX')} · Filtros: ${storageFilter === 'todos' ? 'Todos' : storageFilter === 'kitteo' ? 'KITTEO' : 'Racks principales'} · ${formatNumber(reportRows.length)} locaciones`, 14, 21);
      document.text(`Resumen: ${formatNumber(occupiedCount)} ocupadas · ${formatNumber(reportRows.length - occupiedCount)} disponibles · ${formatNumber(partNumbers)} números de parte · ${formatNumber(totalUnits)} unidades`, 14, 26);

      autoTable(document, {
        startY: 31,
        head: [['Almacén', 'Rack', 'Locación', 'Estado', 'Número(s) de parte', 'Unidades', 'Grupos', 'Asignado desde']],
        body: reportRows.map(row => [
          row['Tipo de almacén'],
          row.Rack,
          row.Locación,
          row.Estado,
          row['Número(s) de parte'],
          formatNumber(row.Unidades),
          formatNumber(row['Grupos asignados']),
          row['Asignado desde'],
        ]),
        styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 15 },
          2: { cellWidth: 20 },
          3: { cellWidth: 20 },
          4: { cellWidth: 60 },
          5: { cellWidth: 18, halign: 'right' },
          6: { cellWidth: 15, halign: 'right' },
          7: { cellWidth: 35 },
        },
        didParseCell: hookData => {
          if (hookData.section === 'body' && hookData.column.index === 3) {
            hookData.cell.styles.textColor = hookData.cell.raw === 'Ocupado' ? [29, 78, 216] : [5, 150, 105];
          }
        },
      });
      document.save(`reporte-locaciones-${fileDate()}.pdf`);
    } finally {
      setExporting(null);
    }
  };

  const clearFilters = () => {
    setStorageFilter('todos');
    setStatusFilter('todos');
    setRackFilter('todos');
    setSearchTerm('');
  };

  if (loading) {
    return <div className="flex min-h-[430px] flex-col items-center justify-center gap-3 rounded-2xl border border-gray-100 bg-white shadow-sm"><RefreshCw className="h-9 w-9 animate-spin text-indigo-500" /><p className="text-sm font-semibold text-gray-600">Cargando locaciones para el reporte...</p></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="flex items-center gap-2"><div className="rounded-xl bg-violet-100 p-2 text-violet-600"><FileText className="h-5 w-5" /></div><div><h2 className="text-xl font-black tracking-tight text-gray-900">Reportes de locaciones</h2><p className="mt-0.5 text-xs text-gray-500">Consulta qué números de parte están asignados a cada rack y locación KITTEO.</p></div></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void loadLocations()} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 shadow-sm transition hover:bg-gray-50"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Actualizar</button>
          <button type="button" onClick={() => void exportExcel()} disabled={!reportRows.length || exporting !== null} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"><FileSpreadsheet className="h-3.5 w-3.5" /> {exporting === 'excel' ? 'Generando...' : 'Excel'}</button>
          <button type="button" onClick={() => void exportPdf()} disabled={!reportRows.length || exporting !== null} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 shadow-sm transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"><FileText className="h-3.5 w-3.5" /> {exporting === 'pdf' ? 'Generando...' : 'PDF'}</button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">No se pudo cargar el reporte: {error}</div>}

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Tipo de almacén<select value={storageFilter} onChange={event => setStorageFilter(event.target.value as StorageFilter)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold normal-case text-gray-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"><option value="todos">Racks y KITTEO</option><option value="principal">Solo racks principales</option><option value="kitteo">Solo KITTEO</option></select></label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Rack<select value={rackFilter} onChange={event => setRackFilter(event.target.value)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold normal-case text-gray-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"><option value="todos">Todos los racks</option>{availableRacks.map(rack => <option key={rack} value={rack}>Rack {rack}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Estado<select value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold normal-case text-gray-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"><option value="todos">Ocupadas y disponibles</option><option value="ocupado">Solo ocupadas</option><option value="disponible">Solo disponibles</option></select></label>
          <label className="relative flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 md:col-span-2 xl:col-span-2">Buscar locación o número de parte<div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Ej. A-01 o número de parte..." className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-xs normal-case text-gray-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></div></label>
        </div>
        <div className="mt-3 flex justify-end"><button type="button" onClick={clearFilters} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800">Limpiar filtros</button></div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4"><div className="flex items-center gap-2 text-indigo-600"><MapPin className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-wide">Locaciones mostradas</span></div><p className="mt-2 text-2xl font-black text-indigo-800">{formatNumber(reportRows.length)}</p></div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4"><div className="flex items-center gap-2 text-blue-600"><Package className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-wide">Números de parte</span></div><p className="mt-2 text-2xl font-black text-blue-800">{formatNumber(partNumbers)}</p><p className="mt-1 text-[10px] text-blue-600">{formatNumber(occupiedCount)} locaciones ocupadas</p></div>
        <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4"><div className="flex items-center gap-2 text-orange-600"><Warehouse className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-wide">Unidades asignadas</span></div><p className="mt-2 text-2xl font-black text-orange-800">{formatNumber(totalUnits)}</p><p className="mt-1 text-[10px] text-orange-600">Estado actual de locaciones</p></div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-2 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center"><div><h3 className="text-sm font-bold text-gray-800">Detalle de locaciones</h3><p className="mt-1 text-[11px] text-gray-400">El reporte incluye el número o números de parte agrupados en cada locación.</p></div><span className="text-[11px] font-semibold text-gray-500">{formatNumber(reportRows.length)} filas para exportar</span></div>
        <div className="overflow-x-auto">
          <table className="min-w-[940px] w-full text-left text-xs">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3 font-bold">Almacén</th><th className="px-3 py-3 font-bold">Rack</th><th className="px-3 py-3 font-bold">Locación</th><th className="px-3 py-3 font-bold">Estado</th><th className="min-w-[250px] px-3 py-3 font-bold">Número(s) de parte</th><th className="px-3 py-3 text-right font-bold">Unidades</th><th className="px-3 py-3 text-right font-bold">Grupos</th><th className="px-5 py-3 font-bold">Asignado desde</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {reportRows.length === 0 ? <tr><td colSpan={8} className="px-5 py-14 text-center text-sm text-gray-400">No hay locaciones que coincidan con los filtros seleccionados.</td></tr> : reportRows.map((row, index) => <tr key={`${row['Tipo de almacén']}-${row.Locación}-${index}`} className="transition hover:bg-indigo-50/30"><td className="px-5 py-3 font-semibold text-gray-700">{row['Tipo de almacén']}</td><td className="px-3 py-3 font-bold text-gray-700">{row.Rack}</td><td className="px-3 py-3 font-bold text-indigo-700">{row.Locación}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${row.Estado === 'Ocupado' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{row.Estado}</span></td><td className="max-w-[330px] px-3 py-3 font-medium text-gray-600">{row['Número(s) de parte']}</td><td className="px-3 py-3 text-right font-bold text-gray-800">{formatNumber(row.Unidades)}</td><td className="px-3 py-3 text-right text-gray-600">{formatNumber(row['Grupos asignados'])}</td><td className="px-5 py-3 text-gray-500">{row['Asignado desde']}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-3 text-[10px] text-gray-400"><Download className="h-3.5 w-3.5" /> Los botones Excel y PDF exportan exactamente las filas visibles con los filtros actuales.</div>
      </section>
    </div>
  );
}
