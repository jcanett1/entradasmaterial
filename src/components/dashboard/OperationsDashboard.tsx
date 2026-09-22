import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Boxes,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  MapPin,
  Package,
  RefreshCw,
  Warehouse,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  DashboardActivity,
  DashboardData,
  DashboardOverview,
  getDefaultDateRange,
  RackOccupancy,
  fetchDashboardData,
} from '@/services/dashboardService';

type StorageFilter = 'principal' | 'kitteo';

type OperationsDashboardProps = {
  embedded?: boolean;
};

const numberFormatter = new Intl.NumberFormat('es-MX');
const compactNumberFormatter = new Intl.NumberFormat('es-MX', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const formatNumber = (value: number) => numberFormatter.format(Math.round(value));
const formatCompact = (value: number) => compactNumberFormatter.format(Math.round(value));

const formatShortDay = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).replace('.', '');
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const activityLabels: Record<string, { label: string; color: string; icon: typeof Package }> = {
  entrada: { label: 'Entrada de inventario', color: 'text-indigo-600 bg-indigo-50', icon: ArrowDownToLine },
  asignacion_rack: { label: 'Asignación a rack', color: 'text-emerald-600 bg-emerald-50', icon: MapPin },
  asignacion_kitteo: { label: 'Asignación a KITTEO', color: 'text-orange-600 bg-orange-50', icon: Boxes },
  transferencia_pendiente: { label: 'Transferencia pendiente', color: 'text-amber-600 bg-amber-50', icon: ArrowRight },
  salida_shipping_direct: { label: 'Salida Shipping Direct', color: 'text-red-600 bg-red-50', icon: ArrowUpFromLine },
  salida_kitteo: { label: 'Salida definitiva KITTEO', color: 'text-rose-600 bg-rose-50', icon: ArrowUpFromLine },
};

function getActivityMeta(activityType: string) {
  return activityLabels[activityType] ?? {
    label: 'Movimiento registrado',
    color: 'text-slate-600 bg-slate-50',
    icon: Activity,
  };
}

function getOccupancyTone(percent: number, warning: number, critical: number) {
  if (percent >= critical) return 'critical';
  if (percent >= warning) return 'warning';
  return 'healthy';
}

function getOccupancyClasses(percent: number, warning: number, critical: number) {
  const tone = getOccupancyTone(percent, warning, critical);
  if (tone === 'critical') {
    return { card: 'border-red-200 bg-red-50/60', bar: 'bg-red-500', text: 'text-red-700', badge: 'bg-red-100 text-red-700' };
  }
  if (tone === 'warning') {
    return { card: 'border-amber-200 bg-amber-50/60', bar: 'bg-amber-500', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' };
  }
  return { card: 'border-emerald-200 bg-emerald-50/50', bar: 'bg-emerald-500', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' };
}

function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  icon: typeof Package;
  tone: 'indigo' | 'blue' | 'emerald' | 'amber' | 'orange' | 'red';
}) {
  const tones = {
    indigo: { card: 'border-indigo-100 bg-indigo-50/70', icon: 'bg-indigo-100 text-indigo-600', value: 'text-indigo-800' },
    blue: { card: 'border-blue-100 bg-blue-50/70', icon: 'bg-blue-100 text-blue-600', value: 'text-blue-800' },
    emerald: { card: 'border-emerald-100 bg-emerald-50/70', icon: 'bg-emerald-100 text-emerald-600', value: 'text-emerald-800' },
    amber: { card: 'border-amber-100 bg-amber-50/70', icon: 'bg-amber-100 text-amber-600', value: 'text-amber-800' },
    orange: { card: 'border-orange-100 bg-orange-50/70', icon: 'bg-orange-100 text-orange-600', value: 'text-orange-800' },
    red: { card: 'border-red-100 bg-red-50/70', icon: 'bg-red-100 text-red-600', value: 'text-red-800' },
  }[tone];

  return (
    <div className={`relative overflow-hidden rounded-2xl border px-5 py-4 shadow-sm ${tones.card}`}>
      <div className="absolute -right-5 -bottom-8 h-20 w-20 rounded-full bg-white/40" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">{label}</p>
          <p className={`mt-2 text-2xl font-black tracking-tight ${tones.value}`}>{value}</p>
          <p className="mt-1 text-[11px] font-medium text-gray-500">{helper}</p>
        </div>
        <div className={`rounded-xl p-2.5 ${tones.icon}`}><Icon className="h-5 w-5" /></div>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  className = '',
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-gray-100 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-800">{title}</h3>
          {subtitle && <p className="mt-1 text-[11px] text-gray-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[520px] flex-col items-center justify-center gap-3 rounded-2xl border border-gray-100 bg-white shadow-sm">
      <RefreshCw className="h-9 w-9 animate-spin text-indigo-500" />
      <p className="text-sm font-semibold text-gray-600">Cargando indicadores reales de Supabase...</p>
      <p className="text-xs text-gray-400">Consultando ocupación, movimientos y locaciones</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="flex min-h-[190px] items-center justify-center text-sm text-gray-400">{message}</div>;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800 shadow-sm">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">No se pudo cargar el Dashboard</p>
          <p className="mt-1 break-words text-xs text-red-700">{message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </button>
        </div>
      </div>
    </div>
  );
}

export function OperationsDashboard({ embedded = false }: OperationsDashboardProps) {
  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [storageFilter, setStorageFilter] = useState<StorageFilter>('principal');
  const [selectedRack, setSelectedRack] = useState('ALL');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    try {
      const result = await fetchDashboardData(dateFrom, dateTo);
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error desconocido al cargar el dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const overview: DashboardOverview | null = data?.overview ?? null;
  const settings = data?.settings;
  const principalRacks = useMemo(
    () => (data?.racks ?? []).filter(rack => rack.storage_type === 'principal'),
    [data?.racks],
  );
  const kitteoRacks = useMemo(
    () => (data?.racks ?? []).filter(rack => rack.storage_type === 'kitteo'),
    [data?.racks],
  );
  const visibleLocations = useMemo(() => {
    const locations = (data?.locations ?? []).filter(location => location.storage_type === storageFilter);
    return selectedRack === 'ALL' ? locations : locations.filter(location => location.rack === selectedRack);
  }, [data?.locations, selectedRack, storageFilter]);

  const movementChartData = useMemo(() => (data?.movements ?? []).map(movement => ({
    day: formatShortDay(movement.movement_day),
    entradas: movement.entry_units,
    salidas: movement.shipping_direct_units + movement.kitteo_exit_units,
    pendientes: movement.pending_transfer_units,
  })), [data?.movements]);

  const distributionData = useMemo(() => {
    if (!overview) return [];
    return [
      { name: 'Racks principales', value: overview.rack_units, color: '#4f46e5' },
      { name: 'KITTEO', value: overview.kitteo_units, color: '#f97316' },
      { name: 'Transferencias pendientes', value: overview.pending_transfer_units, color: '#f59e0b' },
    ].filter(item => item.value > 0);
  }, [overview]);

  const alerts = useMemo(() => {
    if (!overview || !settings || !data) return [];
    const items: Array<{ title: string; description: string; tone: 'red' | 'amber' | 'blue' }> = [];
    const criticalRacks = principalRacks.filter(rack => rack.occupancy_percent >= settings.occupancy_critical_percent);
    const warningRacks = principalRacks.filter(rack => rack.occupancy_percent >= settings.occupancy_warning_percent && rack.occupancy_percent < settings.occupancy_critical_percent);

    if (criticalRacks.length > 0) {
      items.push({
        title: `${criticalRacks.length} rack${criticalRacks.length === 1 ? '' : 's'} en ocupación crítica`,
        description: `${criticalRacks.map(rack => `${rack.rack} (${rack.occupancy_percent.toFixed(1)}%)`).join(', ')}.`,
        tone: 'red',
      });
    }
    if (warningRacks.length > 0) {
      items.push({
        title: 'Racks próximos al límite operativo',
        description: `${warningRacks.map(rack => `${rack.rack} (${rack.occupancy_percent.toFixed(1)}%)`).join(', ')}.`,
        tone: 'amber',
      });
    }
    if (overview.rack_available_locations === 0) {
      items.push({
        title: 'Sin locaciones disponibles en racks principales',
        description: 'Se requiere liberar espacio o priorizar una transferencia de material.',
        tone: 'red',
      });
    }
    if (overview.open_precounts > 0) {
      items.push({
        title: `${formatNumber(overview.open_precounts)} preconteo${overview.open_precounts === 1 ? '' : 's'} pendiente${overview.open_precounts === 1 ? '' : 's'}`,
        description: 'Hay conteos KITTEO en borrador que requieren seguimiento.',
        tone: 'amber',
      });
    }
    if (overview.pending_transfer_records > 0) {
      items.push({
        title: `${formatNumber(overview.pending_transfer_records)} transferencia${overview.pending_transfer_records === 1 ? '' : 's'} en cola`,
        description: `${formatNumber(overview.pending_transfer_units)} unidades esperan asignación o salida definitiva.`,
        tone: 'blue',
      });
    }
    return items;
  }, [data, overview, principalRacks, settings]);

  const setPresetRange = (days: number) => {
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - (days - 1));
    const toDateString = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    setDateFrom(toDateString(from));
    setDateTo(toDateString(today));
  };

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={() => void loadDashboard()} />;
  if (!overview || !data || !settings) return <EmptyState message="No hay datos disponibles para mostrar el Dashboard." />;

  const occupancyTone = getOccupancyClasses(overview.rack_occupancy_percent, settings.occupancy_warning_percent, settings.occupancy_critical_percent);
  const activeRacks = storageFilter === 'principal' ? principalRacks : kitteoRacks;

  return (
    <div className={embedded ? 'space-y-5' : 'space-y-6'}>
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-indigo-100 p-2 text-indigo-600"><Activity className="h-5 w-5" /></div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-gray-900">Dashboard operativo</h2>
              <p className="mt-0.5 text-xs text-gray-500">Indicadores conectados a los datos reales de Supabase.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPresetRange(7)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition hover:border-indigo-200 hover:bg-indigo-50">7 días</button>
          <button type="button" onClick={() => setPresetRange(30)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition hover:border-indigo-200 hover:bg-indigo-50">30 días</button>
          <button type="button" onClick={() => setPresetRange(90)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition hover:border-indigo-200 hover:bg-indigo-50">90 días</button>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Desde
            <input type="date" value={dateFrom} max={dateTo} onChange={event => setDateFrom(event.target.value)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Hasta
            <input type="date" value={dateTo} min={dateFrom} onChange={event => setDateTo(event.target.value)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
          </label>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <CalendarDays className="h-4 w-4 text-indigo-400" />
          <span>Periodo: <strong className="text-gray-700">{overview.period_from}</strong> al <strong className="text-gray-700">{overview.period_to}</strong></span>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={() => void loadDashboard()} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Registros" value={formatNumber(overview.registered_records)} helper="Entradas del periodo" icon={Package} tone="indigo" />
        <StatCard label="Unidades recibidas" value={formatCompact(overview.registered_units)} helper="Entradas del periodo" icon={Boxes} tone="blue" />
        <StatCard label="Cajas recibidas" value={formatNumber(overview.registered_boxes)} helper="Entradas del periodo" icon={Warehouse} tone="emerald" />
        <StatCard label="Ocupación racks" value={`${overview.rack_occupancy_percent.toFixed(1)}%`} helper={`${formatNumber(overview.rack_occupied_locations)} ocupadas`} icon={MapPin} tone={occupancyTone.text === 'text-red-700' ? 'red' : occupancyTone.text === 'text-amber-700' ? 'amber' : 'emerald'} />
        <StatCard label="Unidades en zonas" value={formatCompact(overview.tracked_current_units)} helper={`${formatCompact(overview.rack_units)} racks · ${formatCompact(overview.kitteo_units)} KITTEO`} icon={Activity} tone="orange" />
        <StatCard label="Salidas definitivas" value={formatCompact(overview.shipping_direct_units_period + overview.kitteo_exit_units_period)} helper={`${formatCompact(overview.pending_transfer_units)} pendientes`} icon={ArrowUpFromLine} tone="red" />
      </div>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1.35fr_0.85fr]">
        <Panel title="Entradas y salidas" subtitle="Unidades por día dentro del periodo seleccionado" action={<span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-700">Datos RPC</span>}>
          {movementChartData.length === 0 ? <EmptyState message="No hay movimientos en el periodo seleccionado." /> : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={movementChartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={value => formatCompact(Number(value))} />
                  <Tooltip formatter={(value: number | string, name: string) => [formatNumber(Number(value)), name]} contentStyle={{ borderRadius: 12, borderColor: '#e5e7eb', fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                  <Bar dataKey="entradas" name="Entradas" fill="#4f46e5" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="salidas" name="Salidas definitivas" fill="#ef4444" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="pendientes" name="Transferencias pendientes" fill="#f59e0b" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Distribución actual" subtitle="Unidades por zona, sin sumar el histórico de entradas">
          {distributionData.length === 0 ? <EmptyState message="No hay material asignado a una zona." /> : (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-5 sm:flex-row">
              <div className="h-[210px] w-[210px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={distributionData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={88} paddingAngle={3} stroke="none">
                      {distributionData.map(item => <Cell key={item.name} fill={item.color} />)}
                    </Pie>
                    <Tooltip formatter={(value: number | string) => [formatNumber(Number(value)), 'Unidades']} contentStyle={{ borderRadius: 12, borderColor: '#e5e7eb', fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full max-w-[230px] space-y-3">
                {distributionData.map(item => (
                  <div key={item.name} className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex items-center gap-2 text-gray-600"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>
                    <strong className="text-gray-800">{formatNumber(item.value)}</strong>
                  </div>
                ))}
                <div className="mt-5 border-t border-gray-100 pt-4"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Total rastreado actual</p><p className="mt-1 text-2xl font-black text-gray-900">{formatCompact(overview.tracked_current_units)}</p></div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1.05fr_0.95fr]">
        <Panel
          title="Ocupación por rack"
          subtitle="Capacidad física actual de racks principales y KITTEO"
          action={<div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5"><button type="button" onClick={() => setStorageFilter('principal')} className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold ${storageFilter === 'principal' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'}`}>Racks</button><button type="button" onClick={() => setStorageFilter('kitteo')} className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold ${storageFilter === 'kitteo' ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-500'}`}>KITTEO</button></div>}
        >
          {activeRacks.length === 0 ? <EmptyState message="No hay racks configurados." /> : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activeRacks} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="rack" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={value => `${value}%`} />
                  <Tooltip formatter={(value: number | string) => [`${Number(value).toFixed(1)}%`, 'Ocupación']} contentStyle={{ borderRadius: 12, borderColor: '#e5e7eb', fontSize: 11 }} />
                  <Bar dataKey="occupancy_percent" name="Ocupación" radius={[6, 6, 0, 0]}>
                    {activeRacks.map(rack => {
                      const tone = getOccupancyTone(rack.occupancy_percent, settings.occupancy_warning_percent, settings.occupancy_critical_percent);
                      return <Cell key={`${rack.storage_type}-${rack.rack}`} fill={tone === 'critical' ? '#ef4444' : tone === 'warning' ? '#f59e0b' : storageFilter === 'kitteo' ? '#f97316' : '#4f46e5'} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {activeRacks.map(rack => {
              const classes = getOccupancyClasses(rack.occupancy_percent, settings.occupancy_warning_percent, settings.occupancy_critical_percent);
              return <div key={`${rack.storage_type}-summary-${rack.rack}`} className={`rounded-xl border px-3 py-2 ${classes.card}`}><div className="flex items-center justify-between gap-2"><span className={`text-xs font-black ${classes.text}`}>Rack {rack.rack}</span><span className={`text-[10px] font-black ${classes.text}`}>{rack.occupancy_percent.toFixed(0)}%</span></div><p className="mt-1 text-[10px] text-gray-500">{formatNumber(rack.occupied_locations)} ocupadas · {formatNumber(rack.available_locations)} libres</p></div>;
            })}
          </div>
        </Panel>

        <Panel title="Alertas operativas" subtitle="Reglas derivadas de la configuración de Supabase" action={<span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${alerts.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{alerts.length} activas</span>}>
          <div className="space-y-2.5">
            {alerts.length === 0 ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center text-center"><CheckCircle2 className="h-10 w-10 text-emerald-500" /><p className="mt-3 text-sm font-bold text-gray-700">Sin alertas activas</p><p className="mt-1 max-w-[260px] text-xs text-gray-400">Los indicadores están dentro de los umbrales configurados.</p></div>
            ) : alerts.map(alert => (
              <div key={`${alert.title}-${alert.description}`} className={`flex items-start gap-3 rounded-xl border p-3 ${alert.tone === 'red' ? 'border-red-100 bg-red-50/70' : alert.tone === 'amber' ? 'border-amber-100 bg-amber-50/70' : 'border-blue-100 bg-blue-50/70'}`}>
                <div className={`mt-0.5 rounded-lg p-2 ${alert.tone === 'red' ? 'bg-red-100 text-red-600' : alert.tone === 'amber' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}><AlertTriangle className="h-4 w-4" /></div>
                <div><p className="text-xs font-bold text-gray-800">{alert.title}</p><p className="mt-1 text-[11px] leading-4 text-gray-500">{alert.description}</p></div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Mapa de locaciones" subtitle={`${storageFilter === 'principal' ? 'Racks principales' : 'Locaciones KITTEO'} · consulta rápida de estado`} action={<div className="flex items-center gap-2"><select value={selectedRack} onChange={event => setSelectedRack(event.target.value)} className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-[10px] font-semibold text-gray-600 outline-none"><option value="ALL">Todos los racks</option>{(storageFilter === 'principal' ? principalRacks : kitteoRacks).map(rack => <option key={rack.rack} value={rack.rack}>Rack {rack.rack}</option>)}</select></div>}>
          {visibleLocations.length === 0 ? <EmptyState message="No hay locaciones para este filtro." /> : (
            <div className="grid max-h-[390px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {visibleLocations.map(location => {
                const occupied = location.location_status === 'ocupado';
                return <div key={`${location.storage_type}-${location.location_id}`} title={location.part_numbers ?? 'Sin material'} className={`rounded-xl border p-2.5 transition hover:-translate-y-0.5 ${occupied ? 'border-blue-200 bg-blue-50/70 hover:border-blue-300' : 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-300'}`}><div className="flex items-center justify-between gap-1"><span className={`text-[10px] font-black ${occupied ? 'text-blue-700' : 'text-emerald-700'}`}>{location.location_code}</span><span className={`h-2 w-2 rounded-full ${occupied ? 'bg-blue-500' : 'bg-emerald-500'}`} /></div><p className="mt-2 truncate text-[10px] font-medium text-gray-500">{occupied ? (location.part_numbers ?? 'Ocupada') : 'Disponible'}</p><p className="mt-1 text-[10px] font-bold text-gray-700">{location.units > 0 ? `${formatNumber(location.units)} und.` : '—'}</p></div>;
              })}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-gray-100 pt-3 text-[10px] font-semibold text-gray-500"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />Ocupada</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Disponible</span><span className="ml-auto">{formatNumber(visibleLocations.length)} locaciones mostradas</span></div>
        </Panel>

        <Panel title="Actividad reciente" subtitle="Últimos movimientos registrados" action={<span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold text-gray-500">{data.recentActivity.length} eventos</span>}>
          {data.recentActivity.length === 0 ? <EmptyState message="No hay actividad reciente." /> : (
            <div className="max-h-[390px] space-y-1 overflow-y-auto pr-1">
              {data.recentActivity.map((activity: DashboardActivity) => {
                const meta = getActivityMeta(activity.activity_type);
                const Icon = meta.icon;
                return <div key={`${activity.activity_type}-${activity.activity_id}-${activity.activity_at}`} className="flex items-start gap-2.5 rounded-xl p-2.5 transition hover:bg-gray-50"><div className={`mt-0.5 rounded-lg p-2 ${meta.color}`}><Icon className="h-3.5 w-3.5" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="text-[11px] font-bold text-gray-700">{meta.label}</p><span className="flex-shrink-0 text-[9px] text-gray-400">{formatDateTime(activity.activity_at)}</span></div><p className="mt-1 truncate text-[10px] text-gray-500">{activity.part_number ?? 'Material sin número de parte'} · {formatNumber(activity.quantity)} unidades{activity.location_code ? ` · ${activity.location_code}` : ''}</p></div></div>;
              })}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">Locaciones racks</p><p className="mt-1 text-lg font-black text-indigo-800">{formatNumber(overview.rack_occupied_locations)} / {formatNumber(overview.rack_total_locations)}</p><p className="text-[10px] text-indigo-600">{formatNumber(overview.rack_available_locations)} disponibles</p></div>
        <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-orange-500">Locaciones KITTEO</p><p className="mt-1 text-lg font-black text-orange-800">{formatNumber(overview.kitteo_occupied_locations)} / {formatNumber(overview.kitteo_total_locations)}</p><p className="text-[10px] text-orange-600">{formatNumber(overview.kitteo_available_locations)} disponibles</p></div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Actualización</p><p className="mt-1 text-lg font-black text-slate-800">En vivo</p><p className="text-[10px] text-slate-500">Consulta manual mediante Supabase RPC</p></div>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-gray-400"><Clock3 className="h-3.5 w-3.5" /> Las métricas actuales se calculan desde el estado vigente de racks/KITTEO; las entradas y salidas respetan el periodo seleccionado.</div>
    </div>
  );
}
