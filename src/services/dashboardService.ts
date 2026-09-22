import { supabase } from '@/lib/supabase';

export type DashboardOverview = {
  period_from: string;
  period_to: string;
  registered_records: number;
  registered_units: number;
  registered_boxes: number;
  rack_total_locations: number;
  rack_occupied_locations: number;
  rack_available_locations: number;
  rack_occupancy_percent: number;
  rack_units: number;
  kitteo_total_locations: number;
  kitteo_occupied_locations: number;
  kitteo_available_locations: number;
  kitteo_occupancy_percent: number;
  kitteo_units: number;
  pending_transfer_records: number;
  pending_transfer_units: number;
  shipping_direct_units_period: number;
  kitteo_exit_units_period: number;
  open_precounts: number;
  high_occupancy_racks: number;
  tracked_current_units: number;
};

export type DashboardMovement = {
  movement_day: string;
  entry_records: number;
  entry_units: number;
  pending_transfer_records: number;
  pending_transfer_units: number;
  shipping_direct_records: number;
  shipping_direct_units: number;
  kitteo_exit_records: number;
  kitteo_exit_units: number;
};

export type RackOccupancy = {
  storage_type: 'principal' | 'kitteo';
  rack: string;
  total_locations: number;
  occupied_locations: number;
  available_locations: number;
  occupancy_percent: number;
  units: number;
  distinct_parts: number;
};

export type DashboardLocation = {
  storage_type: 'principal' | 'kitteo';
  rack: string;
  location_id: number;
  location_code: string;
  location_status: 'ocupado' | 'disponible';
  units: number;
  item_count: number;
  part_numbers: string | null;
  assigned_at: string | null;
};

export type DashboardActivity = {
  activity_type:
    | 'entrada'
    | 'asignacion_rack'
    | 'asignacion_kitteo'
    | 'transferencia_pendiente'
    | 'salida_shipping_direct'
    | 'salida_kitteo'
    | string;
  activity_id: number;
  activity_at: string;
  part_number: string | null;
  quantity: number;
  location_code: string | null;
  destination: string | null;
  registered_by: string | null;
};

export type DashboardSettings = {
  occupancy_warning_percent: number;
  occupancy_critical_percent: number;
  fifo_warning_days: number;
  fifo_critical_days: number;
  pending_precount_warning_days: number;
};

export type DashboardData = {
  overview: DashboardOverview;
  movements: DashboardMovement[];
  racks: RackOccupancy[];
  locations: DashboardLocation[];
  recentActivity: DashboardActivity[];
  settings: DashboardSettings;
};

const DEFAULT_SETTINGS: DashboardSettings = {
  occupancy_warning_percent: 85,
  occupancy_critical_percent: 95,
  fifo_warning_days: 60,
  fifo_critical_days: 90,
  pending_precount_warning_days: 7,
};

const normalizeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeOverview = (row: Record<string, unknown>): DashboardOverview => ({
  period_from: String(row.period_from ?? ''),
  period_to: String(row.period_to ?? ''),
  registered_records: normalizeNumber(row.registered_records),
  registered_units: normalizeNumber(row.registered_units),
  registered_boxes: normalizeNumber(row.registered_boxes),
  rack_total_locations: normalizeNumber(row.rack_total_locations),
  rack_occupied_locations: normalizeNumber(row.rack_occupied_locations),
  rack_available_locations: normalizeNumber(row.rack_available_locations),
  rack_occupancy_percent: normalizeNumber(row.rack_occupancy_percent),
  rack_units: normalizeNumber(row.rack_units),
  kitteo_total_locations: normalizeNumber(row.kitteo_total_locations),
  kitteo_occupied_locations: normalizeNumber(row.kitteo_occupied_locations),
  kitteo_available_locations: normalizeNumber(row.kitteo_available_locations),
  kitteo_occupancy_percent: normalizeNumber(row.kitteo_occupancy_percent),
  kitteo_units: normalizeNumber(row.kitteo_units),
  pending_transfer_records: normalizeNumber(row.pending_transfer_records),
  pending_transfer_units: normalizeNumber(row.pending_transfer_units),
  shipping_direct_units_period: normalizeNumber(row.shipping_direct_units_period),
  kitteo_exit_units_period: normalizeNumber(row.kitteo_exit_units_period),
  open_precounts: normalizeNumber(row.open_precounts),
  high_occupancy_racks: normalizeNumber(row.high_occupancy_racks),
  tracked_current_units: normalizeNumber(row.tracked_current_units),
});

const normalizeMovement = (row: Record<string, unknown>): DashboardMovement => ({
  movement_day: String(row.movement_day ?? ''),
  entry_records: normalizeNumber(row.entry_records),
  entry_units: normalizeNumber(row.entry_units),
  pending_transfer_records: normalizeNumber(row.pending_transfer_records),
  pending_transfer_units: normalizeNumber(row.pending_transfer_units),
  shipping_direct_records: normalizeNumber(row.shipping_direct_records),
  shipping_direct_units: normalizeNumber(row.shipping_direct_units),
  kitteo_exit_records: normalizeNumber(row.kitteo_exit_records),
  kitteo_exit_units: normalizeNumber(row.kitteo_exit_units),
});

const normalizeRack = (row: Record<string, unknown>): RackOccupancy => ({
  storage_type: row.storage_type === 'kitteo' ? 'kitteo' : 'principal',
  rack: String(row.rack ?? ''),
  total_locations: normalizeNumber(row.total_locations),
  occupied_locations: normalizeNumber(row.occupied_locations),
  available_locations: normalizeNumber(row.available_locations),
  occupancy_percent: normalizeNumber(row.occupancy_percent),
  units: normalizeNumber(row.units),
  distinct_parts: normalizeNumber(row.distinct_parts),
});

const normalizeLocation = (row: Record<string, unknown>): DashboardLocation => ({
  storage_type: row.storage_type === 'kitteo' ? 'kitteo' : 'principal',
  rack: String(row.rack ?? ''),
  location_id: normalizeNumber(row.location_id),
  location_code: String(row.location_code ?? ''),
  location_status: row.location_status === 'ocupado' ? 'ocupado' : 'disponible',
  units: normalizeNumber(row.units),
  item_count: normalizeNumber(row.item_count),
  part_numbers: row.part_numbers ? String(row.part_numbers) : null,
  assigned_at: row.assigned_at ? String(row.assigned_at) : null,
});

const normalizeActivity = (row: Record<string, unknown>): DashboardActivity => ({
  activity_type: String(row.activity_type ?? ''),
  activity_id: normalizeNumber(row.activity_id),
  activity_at: String(row.activity_at ?? ''),
  part_number: row.part_number ? String(row.part_number) : null,
  quantity: normalizeNumber(row.quantity),
  location_code: row.location_code ? String(row.location_code) : null,
  destination: row.destination ? String(row.destination) : null,
  registered_by: row.registered_by ? String(row.registered_by) : null,
});

export const getDefaultDateRange = () => {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 29);
  const toDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  return { from: toDateString(from), to: toDateString(today) };
};

export async function fetchDashboardData(from: string, to: string): Promise<DashboardData> {
  const [overviewResult, movementsResult, racksResult, principalLocationsResult, kitteoLocationsResult, activityResult, settingsResult] = await Promise.all([
    supabase.rpc('dashboard_overview', { p_from: from, p_to: to }),
    supabase.rpc('dashboard_movements', { p_from: from, p_to: to }),
    supabase.rpc('dashboard_rack_occupancy'),
    supabase.rpc('dashboard_location_map', { p_storage_type: 'principal', p_rack: null }),
    supabase.rpc('dashboard_location_map', { p_storage_type: 'kitteo', p_rack: null }),
    supabase.rpc('dashboard_recent_activity', { p_limit: 20 }),
    supabase
      .from('dashboard_settings')
      .select('occupancy_warning_percent, occupancy_critical_percent, fifo_warning_days, fifo_critical_days, pending_precount_warning_days')
      .eq('id', 1)
      .maybeSingle(),
  ]);

  const firstError = [
    overviewResult.error,
    movementsResult.error,
    racksResult.error,
    principalLocationsResult.error,
    kitteoLocationsResult.error,
    activityResult.error,
    settingsResult.error,
  ].find(Boolean);

  if (firstError) {
    throw new Error(firstError.message);
  }

  const overviewRow = Array.isArray(overviewResult.data) ? overviewResult.data[0] : overviewResult.data;
  if (!overviewRow) {
    throw new Error('La función dashboard_overview no devolvió datos.');
  }

  const settingsRow = settingsResult.data as Record<string, unknown> | null;
  const settings: DashboardSettings = settingsRow
    ? {
        occupancy_warning_percent: normalizeNumber(settingsRow.occupancy_warning_percent),
        occupancy_critical_percent: normalizeNumber(settingsRow.occupancy_critical_percent),
        fifo_warning_days: normalizeNumber(settingsRow.fifo_warning_days),
        fifo_critical_days: normalizeNumber(settingsRow.fifo_critical_days),
        pending_precount_warning_days: normalizeNumber(settingsRow.pending_precount_warning_days),
      }
    : DEFAULT_SETTINGS;

  return {
    overview: normalizeOverview(overviewRow as Record<string, unknown>),
    movements: ((movementsResult.data ?? []) as Record<string, unknown>[]).map(normalizeMovement),
    racks: ((racksResult.data ?? []) as Record<string, unknown>[]).map(normalizeRack),
    locations: [
      ...((principalLocationsResult.data ?? []) as Record<string, unknown>[]),
      ...((kitteoLocationsResult.data ?? []) as Record<string, unknown>[]),
    ].map(normalizeLocation),
    recentActivity: ((activityResult.data ?? []) as Record<string, unknown>[]).map(normalizeActivity),
    settings,
  };
}

export async function fetchDashboardLocations(): Promise<DashboardLocation[]> {
  const [principalResult, kitteoResult] = await Promise.all([
    supabase.rpc('dashboard_location_map', { p_storage_type: 'principal', p_rack: null }),
    supabase.rpc('dashboard_location_map', { p_storage_type: 'kitteo', p_rack: null }),
  ]);

  const firstError = [principalResult.error, kitteoResult.error].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  return [
    ...((principalResult.data ?? []) as Record<string, unknown>[]),
    ...((kitteoResult.data ?? []) as Record<string, unknown>[]),
  ].map(normalizeLocation);
}
