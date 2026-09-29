import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Eye,
  Loader2,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
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
import { supabase } from '@/lib/supabase';
import type {
  PhysicalAudit,
  PhysicalAuditCounterItem,
  PhysicalAuditFinding,
  PhysicalAuditLocation,
  PhysicalAuditRackAssignment,
  PhysicalAuditStatus,
  PhysicalAuditSupervisorItem,
} from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

type AuditTab = 'avance' | 'resumen' | 'asignacion' | 'monitoreo' | 'resultados' | 'hallazgos';
type CounterTab = 'conteo' | 'hallazgo';

type ReferenceLocation = {
  id: number;
  rack: string;
  location_code: string;
  status: string;
};

type ReferenceItem = {
  id: number;
  location_id: number;
  location_code: string;
  entry_id: number | null;
  part_number: string;
  po: string | null;
  qty: number;
  fifo_number: number | null;
};

type EntryDescription = { id: number; description: string | null };
type CounterProfile = { user_id: string; email: string | null; nombre_completo: string | null };

type AuditSummary = {
  rack: string;
  total: number;
  completed: number;
  pending: number;
  items: number;
  differences: number;
  progress: number;
};

const PAGE_SIZE = 1000;
const CHUNK_SIZE = 500;
const CHART_COLORS = ['#059669', '#d97706', '#ef4444', '#cbd5e1'];

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
};

const formatStatus = (status: PhysicalAuditStatus | string) => ({
  programada: 'Programada',
  en_progreso: 'En progreso',
  completada: 'Completada',
  cerrada: 'Cerrada',
  cancelada: 'Cancelada',
  pendiente: 'Pendiente',
  correcto: 'Correcto',
  faltante: 'Faltante',
  sobrante: 'Sobrante',
  pendiente_revision: 'Pendiente de revisión',
  validado: 'Validado',
  rechazado: 'Rechazado',
  aplicado: 'Aplicado',
}[status] ?? status);

function statusClass(status: string) {
  if (['correcto', 'completada', 'validado', 'aplicado'].includes(status)) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (['faltante', 'sobrante', 'pendiente_revision', 'en_progreso'].includes(status)) return 'bg-amber-100 text-amber-700 border-amber-200';
  if (['rechazado', 'cancelada'].includes(status)) return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClass(status)}`}>{formatStatus(status)}</span>;
}

async function fetchAllRows<T>(table: string, select: string) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows;
}

async function insertInChunks(table: string, rows: unknown[]) {
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    const { error } = await supabase.from(table).insert(rows.slice(index, index + CHUNK_SIZE));
    if (error) throw error;
  }
}

export function PhysicalAuditPage({ counterOnly = false }: { counterOnly?: boolean }) {
  const { userProfile, isManager, isCounter } = useAuth();
  const isCounterView = counterOnly || isCounter;

  const [audits, setAudits] = useState<PhysicalAudit[]>([]);
  const [activeAuditId, setActiveAuditId] = useState<number | null>(null);
  const [auditLocations, setAuditLocations] = useState<PhysicalAuditLocation[]>([]);
  const [assignments, setAssignments] = useState<PhysicalAuditRackAssignment[]>([]);
  const [counterItems, setCounterItems] = useState<PhysicalAuditCounterItem[]>([]);
  const [supervisorItems, setSupervisorItems] = useState<PhysicalAuditSupervisorItem[]>([]);
  const [findings, setFindings] = useState<PhysicalAuditFinding[]>([]);
  const [counterProfiles, setCounterProfiles] = useState<CounterProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditTab, setAuditTab] = useState<AuditTab>('avance');
  const [counterTab, setCounterTab] = useState<CounterTab>('conteo');
  const [selectedPartId, setSelectedPartId] = useState<number | null>(null);
  const [partSearch, setPartSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [referenceLocations, setReferenceLocations] = useState<ReferenceLocation[]>([]);
  const [referenceItems, setReferenceItems] = useState<ReferenceItem[]>([]);
  const [entryDescriptions, setEntryDescriptions] = useState<Record<number, string | null>>({});
  const [createForm, setCreateForm] = useState({ name: '', description: '', selectedRacks: [] as string[], assignees: {} as Record<string, string> });
  const [saving, setSaving] = useState(false);
  const [countInputs, setCountInputs] = useState<Record<number, string>>({});
  const [findingForm, setFindingForm] = useState({ itemId: '', foundLocation: '', foundRack: '', foundQty: '', notes: '' });

  const activeAudit = useMemo(() => audits.find(audit => audit.id === activeAuditId) ?? null, [audits, activeAuditId]);

  const loadAudits = useCallback(async () => {
    const { data, error: auditError } = await supabase
      .from('physical_audits')
      .select('*')
      .order('created_at', { ascending: false });
    if (auditError) throw auditError;
    const nextAudits = (data ?? []) as PhysicalAudit[];
    setAudits(nextAudits);
    setActiveAuditId(current => current && nextAudits.some(audit => audit.id === current) ? current : (nextAudits[0]?.id ?? null));
    return nextAudits;
  }, []);

  const loadAuditData = useCallback(async (auditId: number | null) => {
    if (!auditId) {
      setAuditLocations([]);
      setAssignments([]);
      setCounterItems([]);
      setSupervisorItems([]);
      setFindings([]);
      return;
    }

    setRefreshing(true);
    setError(null);
    try {
      const locationsPromise = supabase
        .from('physical_audit_locations')
        .select('*')
        .eq('audit_id', auditId)
        .order('rack')
        .order('location_code');

      if (isCounterView) {
        const [locationsResult, itemsResult] = await Promise.all([
          locationsPromise,
          supabase.rpc('physical_audit_get_counter_items', { p_audit_id: auditId }),
        ]);
        if (locationsResult.error) throw locationsResult.error;
        if (itemsResult.error) throw itemsResult.error;
        setAuditLocations((locationsResult.data ?? []) as PhysicalAuditLocation[]);
        setCounterItems((itemsResult.data ?? []) as PhysicalAuditCounterItem[]);
        setSupervisorItems([]);
        setAssignments([]);
        setFindings([]);
      } else {
        const [locationsResult, assignmentsResult, itemsResult, findingsResult] = await Promise.all([
          locationsPromise,
          supabase.from('physical_audit_rack_assignments').select('*').eq('audit_id', auditId).order('rack'),
          supabase.rpc('physical_audit_get_supervisor_items', { p_audit_id: auditId }),
          supabase.rpc('physical_audit_get_supervisor_findings', { p_audit_id: auditId }),
        ]);
        if (locationsResult.error) throw locationsResult.error;
        if (assignmentsResult.error) throw assignmentsResult.error;
        if (itemsResult.error) throw itemsResult.error;
        if (findingsResult.error) throw findingsResult.error;
        setAuditLocations((locationsResult.data ?? []) as PhysicalAuditLocation[]);
        setAssignments((assignmentsResult.data ?? []) as PhysicalAuditRackAssignment[]);
        setSupervisorItems((itemsResult.data ?? []) as PhysicalAuditSupervisorItem[]);
        setFindings((findingsResult.data ?? []) as PhysicalAuditFinding[]);
        setCounterItems([]);
      }
    } catch (loadError) {
      console.error('Error cargando auditoría:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la auditoría.');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [isCounterView]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void loadAudits()
      .catch(loadError => {
        if (!mounted) return;
        console.error('Error cargando auditorías:', loadError);
        setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar las auditorías.');
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [loadAudits]);

  useEffect(() => {
    void loadAuditData(activeAuditId);
  }, [activeAuditId, loadAuditData]);

  const loadCounterProfiles = useCallback(async () => {
    const { data, error: countersError } = await supabase
      .from('usuarioalmacen')
      .select('user_id, email, nombre_completo')
      .eq('rol', 'contador')
      .eq('activo', true)
      .order('nombre_completo');
    if (countersError) throw countersError;
    const profiles = (data ?? []).filter(row => row.user_id).map(row => row as CounterProfile);
    setCounterProfiles(profiles);
    return profiles;
  }, []);

  useEffect(() => {
    if (!isManager) return;
    void loadCounterProfiles().catch(loadError => {
      console.error('Error cargando contadores:', loadError);
    });
  }, [isManager, loadCounterProfiles]);

  useEffect(() => {
    if (isCounterView || !activeAuditId) return;
    const channel = supabase
      .channel(`physical-audit-${activeAuditId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'physical_audit_items' }, () => {
        void loadAuditData(activeAuditId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'physical_audit_locations', filter: `audit_id=eq.${activeAuditId}` }, () => {
        void loadAuditData(activeAuditId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'physical_audit_findings', filter: `audit_id=eq.${activeAuditId}` }, () => {
        void loadAuditData(activeAuditId);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeAuditId, isCounterView, loadAuditData]);

  const loadReferenceData = useCallback(async () => {
    setCreateLoading(true);
    try {
      const [locations, items] = await Promise.all([
        fetchAllRows<ReferenceLocation>('locations', 'id, rack, location_code, status'),
        fetchAllRows<ReferenceItem>('location_items', 'id, location_id, location_code, entry_id, part_number, po, qty, fifo_number'),
        loadCounterProfiles(),
      ]);
      setReferenceLocations(locations);
      setReferenceItems(items);
      const entryIds = [...new Set(items.map(item => item.entry_id).filter((id): id is number => id !== null))];
      const descriptions: Record<number, string | null> = {};
      for (let index = 0; index < entryIds.length; index += CHUNK_SIZE) {
        const { data, error: entryError } = await supabase
          .from('entries')
          .select('id, description')
          .in('id', entryIds.slice(index, index + CHUNK_SIZE));
        if (entryError) throw entryError;
        ((data ?? []) as EntryDescription[]).forEach(row => { descriptions[row.id] = row.description; });
      }
      setEntryDescriptions(descriptions);
    } catch (loadError) {
      console.error('Error cargando datos para nueva auditoría:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar racks y contadores.');
    } finally {
      setCreateLoading(false);
    }
  }, [loadCounterProfiles]);

  useEffect(() => {
    if (showCreate && isManager) void loadReferenceData();
  }, [showCreate, isManager, loadReferenceData]);

  const rackOptions = useMemo(() => [...new Set(referenceLocations.map(location => location.rack).filter(Boolean))].sort(), [referenceLocations]);

  const rackSummary = useMemo<AuditSummary[]>(() => {
    const byRack = new Map<string, AuditSummary>();
    auditLocations.forEach(location => {
      const current = byRack.get(location.rack) ?? { rack: location.rack, total: 0, completed: 0, pending: 0, items: 0, differences: 0, progress: 0 };
      current.total += 1;
      if (location.status === 'completada') current.completed += 1;
      else current.pending += 1;
      byRack.set(location.rack, current);
    });
    supervisorItems.forEach(item => {
      const current = byRack.get(item.rack) ?? { rack: item.rack, total: 0, completed: 0, pending: 0, items: 0, differences: 0, progress: 0 };
      current.items += 1;
      if (item.difference_qty !== null && item.difference_qty !== 0) current.differences += 1;
      byRack.set(item.rack, current);
    });
    return [...byRack.values()].map(row => ({ ...row, progress: row.total ? Math.round((row.completed / row.total) * 100) : 0 })).sort((a, b) => a.rack.localeCompare(b.rack));
  }, [auditLocations, supervisorItems]);

  const totalLocations = auditLocations.length;
  const completedLocations = auditLocations.filter(location => location.status === 'completada').length;
  const totalItems = supervisorItems.length;
  const countedItems = supervisorItems.filter(item => item.found_qty !== null).length;
  const expectedUnits = supervisorItems.reduce((sum, item) => sum + (item.expected_qty ?? 0), 0);
  const foundUnits = supervisorItems.reduce((sum, item) => sum + (item.found_qty ?? 0), 0);
  const differenceUnits = supervisorItems.reduce((sum, item) => sum + (item.difference_qty ?? 0), 0);
  const correctItems = supervisorItems.filter(item => item.status === 'correcto').length;
  const differenceItems = supervisorItems.filter(item => item.status === 'faltante' || item.status === 'sobrante').length;
  const pendingItems = supervisorItems.filter(item => item.status === 'pendiente').length;
  const progress = totalLocations ? Math.round((completedLocations / totalLocations) * 100) : 0;

  const selectedPart = useMemo(() => supervisorItems.find(item => item.id === selectedPartId) ?? supervisorItems[0] ?? null, [supervisorItems, selectedPartId]);
  const filteredSupervisorItems = useMemo(() => {
    const term = partSearch.trim().toLowerCase();
    if (!term) return supervisorItems;
    return supervisorItems.filter(item => [item.part_number, item.description, item.location_code, item.rack, item.po].some(value => String(value ?? '').toLowerCase().includes(term)));
  }, [partSearch, supervisorItems]);

  const submitCount = async (item: PhysicalAuditCounterItem) => {
    const rawValue = countInputs[item.id] ?? (item.found_qty === null ? '' : String(item.found_qty));
    if (rawValue.trim() === '' || Number.isNaN(Number(rawValue)) || Number(rawValue) < 0) {
      window.alert('Captura una cantidad válida. Puedes registrar 0.');
      return;
    }
    setSaving(true);
    const { error: countError } = await supabase.rpc('physical_audit_record_count', {
      p_item_id: item.id,
      p_found_qty: Math.floor(Number(rawValue)),
      p_notes: item.notes ?? null,
    });
    if (countError) window.alert(`No se pudo registrar el conteo: ${countError.message}`);
    else await loadAuditData(activeAuditId);
    setSaving(false);
  };

  const completeLocation = async (location: PhysicalAuditLocation) => {
    setSaving(true);
    const { error: completeError } = await supabase.rpc('physical_audit_complete_location', { p_audit_location_id: location.id });
    if (completeError) window.alert(completeError.message);
    else await loadAuditData(activeAuditId);
    setSaving(false);
  };

  const submitFinding = async () => {
    if (!activeAuditId || !findingForm.itemId || !findingForm.foundLocation.trim() || findingForm.foundQty.trim() === '') {
      window.alert('Selecciona el número de parte, la ubicación real y la cantidad encontrada.');
      return;
    }
    const item = counterItems.find(row => row.id === Number(findingForm.itemId));
    const location = item ? auditLocations.find(row => row.id === item.audit_location_id) : null;
    if (!item || !location) return;
    setSaving(true);
    const { error: findingError } = await supabase.rpc('physical_audit_report_finding', {
      p_audit_id: activeAuditId,
      p_audit_location_id: location.id,
      p_part_number: item.part_number,
      p_description: item.description,
      p_expected_location_code: location.location_code,
      p_found_location_code: findingForm.foundLocation.trim(),
      p_found_rack: findingForm.foundRack.trim() || null,
      p_found_qty: Math.floor(Number(findingForm.foundQty)),
      p_po: item.po,
      p_fifo_number: item.fifo_number,
      p_notes: findingForm.notes.trim() || null,
      p_expected_location_id: location.location_id,
      p_expected_location_item_id: null,
      p_found_location_id: null,
    });
    if (findingError) window.alert(`No se pudo enviar el hallazgo: ${findingError.message}`);
    else {
      setFindingForm({ itemId: '', foundLocation: '', foundRack: '', foundQty: '', notes: '' });
      window.alert('Hallazgo enviado para revisión del supervisor.');
      await loadAuditData(activeAuditId);
    }
    setSaving(false);
  };

  const reviewFinding = async (finding: PhysicalAuditFinding, status: 'validado' | 'rechazado') => {
    if (!userProfile?.user_id) return;
    const reviewNotes = window.prompt(status === 'validado' ? 'Nota de validación (opcional):' : 'Motivo del rechazo (opcional):', finding.review_notes ?? '') ?? finding.review_notes ?? null;
    const { error: reviewError } = await supabase
      .from('physical_audit_findings')
      .update({ status, reviewed_by: userProfile.user_id, reviewed_at: new Date().toISOString(), review_notes: reviewNotes })
      .eq('id', finding.id);
    if (reviewError) window.alert(`No se pudo actualizar el hallazgo: ${reviewError.message}`);
    else await loadAuditData(activeAuditId);
  };

  const toggleDraftRack = (rack: string) => {
    setCreateForm(current => {
      const selected = current.selectedRacks.includes(rack);
      return {
        ...current,
        selectedRacks: selected ? current.selectedRacks.filter(item => item !== rack) : [...current.selectedRacks, rack],
      };
    });
  };

  const createAudit = async () => {
    if (!createForm.name.trim() || createForm.selectedRacks.length === 0 || createForm.selectedRacks.some(rack => !createForm.assignees[rack])) {
      window.alert('Escribe el nombre, selecciona al menos un rack y asigna un contador a cada rack.');
      return;
    }
    setSaving(true);
    let createdAuditId: number | null = null;
    try {
      const { data: auditData, error: auditError } = await supabase
        .from('physical_audits')
        .insert({ name: createForm.name.trim(), description: createForm.description.trim() || null, status: 'programada', created_by: userProfile?.user_id ?? null })
        .select('*')
        .single();
      if (auditError || !auditData) throw auditError ?? new Error('No se pudo crear la auditoría');
      createdAuditId = Number(auditData.id);

      const selectedLocations = referenceLocations.filter(location => createForm.selectedRacks.includes(location.rack));
      const assignmentsToInsert = createForm.selectedRacks.map(rack => ({ audit_id: createdAuditId, rack, contador_user_id: createForm.assignees[rack], assigned_by: userProfile?.user_id ?? null, status: 'asignado' }));
      await insertInChunks('physical_audit_rack_assignments', assignmentsToInsert);

      const locationRows = selectedLocations.map(location => ({
        audit_id: createdAuditId,
        location_id: location.id,
        location_code: location.location_code,
        rack: location.rack,
        contador_user_id: createForm.assignees[location.rack],
        status: 'pendiente',
      }));
      await insertInChunks('physical_audit_locations', locationRows);

      const selectedReferenceItems = referenceItems.filter(item => selectedLocations.some(location => location.id === item.location_id));

      if (selectedReferenceItems.length > 0) {
        // Reemplazar audit_location_id usando el código de locación recién insertado.
        const { data: insertedLocations, error: insertedLocationsError } = await supabase
          .from('physical_audit_locations')
          .select('id, location_code')
          .eq('audit_id', createdAuditId);
        if (insertedLocationsError) throw insertedLocationsError;
        const locationIdByCode = new Map((insertedLocations ?? []).map(row => [row.location_code, row.id]));
        const finalItems = referenceItems
          .filter(item => selectedLocations.some(location => location.id === item.location_id))
          .map(item => ({
            audit_location_id: locationIdByCode.get(item.location_code),
            location_item_id: item.id,
            entry_id: item.entry_id,
            part_number: item.part_number,
            description: item.entry_id ? (entryDescriptions[item.entry_id] ?? null) : null,
            po: item.po,
            fifo_number: item.fifo_number,
            expected_qty: item.qty ?? 0,
          }))
          .filter(item => item.audit_location_id);
        await insertInChunks('physical_audit_items', finalItems);
      }

      const { error: startError } = await supabase
        .from('physical_audits')
        .update({ status: 'en_progreso', started_at: new Date().toISOString() })
        .eq('id', createdAuditId);
      if (startError) throw startError;

      setShowCreate(false);
      setCreateForm({ name: '', description: '', selectedRacks: [], assignees: {} });
      const nextAudits = await loadAudits();
      const created = nextAudits.find(audit => audit.id === createdAuditId);
      if (created) setActiveAuditId(created.id);
      window.alert('Auditoría creada y racks asignados correctamente.');
    } catch (createError) {
      console.error('Error creando auditoría:', createError);
      if (createdAuditId) await supabase.from('physical_audits').delete().eq('id', createdAuditId);
      window.alert(createError instanceof Error ? createError.message : 'No se pudo crear la auditoría.');
    } finally {
      setSaving(false);
    }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await loadAudits();
      await loadAuditData(activeAuditId);
    } finally {
      setRefreshing(false);
    }
  };

  if (!isCounterView && !isManager) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-800">No tienes permisos para acceder a Auditoría Física.</div>;
  }

  if (loading) {
    return <div className="flex min-h-[360px] items-center justify-center"><div className="flex flex-col items-center gap-3 text-gray-500"><Loader2 className="h-9 w-9 animate-spin text-indigo-600" /><span>Cargando auditorías...</span></div></div>;
  }

  if (isCounterView) {
    return <CounterAuditView
      audits={audits}
      activeAudit={activeAudit}
      activeAuditId={activeAuditId}
      setActiveAuditId={setActiveAuditId}
      auditLocations={auditLocations}
      items={counterItems}
      tab={counterTab}
      setTab={setCounterTab}
      countInputs={countInputs}
      setCountInputs={setCountInputs}
      submitCount={submitCount}
      completeLocation={completeLocation}
      findingForm={findingForm}
      setFindingForm={setFindingForm}
      submitFinding={submitFinding}
      saving={saving}
      error={error}
      refresh={refreshAll}
      refreshing={refreshing}
    />;
  }

  const donutData = [
    { name: 'Correcto', value: correctItems },
    { name: 'Con diferencia', value: differenceItems },
    { name: 'Pendiente', value: pendingItems },
  ].filter(item => item.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="mb-1 text-xs font-black uppercase tracking-[0.16em] text-indigo-600">Centro de control</p>
          <h2 className="text-3xl font-black tracking-tight text-gray-900">Auditoría Física</h2>
          <p className="mt-2 text-sm text-gray-500">Compara el inventario registrado contra el conteo físico por rack, locación y número de parte.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-indigo-700 active:scale-95"><Plus className="h-4 w-4" />Nueva auditoría</button>
          <button type="button" onClick={() => void refreshAll()} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 shadow-sm transition hover:bg-gray-50 active:scale-95"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Actualizar</button>
        </div>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" /><div><strong>No se pudo cargar la auditoría</strong><p className="mt-1">{error}</p></div></div>}

      {audits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-indigo-200 bg-white p-12 text-center shadow-sm"><ClipboardCheck className="mx-auto h-12 w-12 text-indigo-300" /><h3 className="mt-4 text-lg font-bold text-gray-800">Todavía no hay auditorías</h3><p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">Crea la primera auditoría para tomar la fotografía de las locaciones y asignar racks a los contadores.</p><button type="button" onClick={() => setShowCreate(true)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" />Crear auditoría</button></div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:flex-row md:items-center">
            <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-indigo-600" /><span className="text-xs font-bold uppercase tracking-wide text-gray-500">Auditoría activa</span></div>
            <select value={activeAuditId ?? ''} onChange={event => setActiveAuditId(Number(event.target.value))} className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-bold text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100">
              {audits.map(audit => <option key={audit.id} value={audit.id}>{audit.name}</option>)}
            </select>
            {activeAudit && <StatusBadge status={activeAudit.status} />}
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_#d1fae5]" />Actualización en vivo</div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={<MapPin className="h-5 w-5" />} label="Locaciones revisadas" value={`${completedLocations} / ${totalLocations}`} note={`${progress}% de avance`} tone="indigo" />
            <MetricCard icon={<Package className="h-5 w-5" />} label="Números de parte" value={`${countedItems} / ${totalItems}`} note="Con captura física" tone="emerald" />
            <MetricCard icon={<CheckCircle2 className="h-5 w-5" />} label="Correctos" value={correctItems.toLocaleString()} note="Sin diferencia" tone="violet" />
            <MetricCard icon={<AlertTriangle className="h-5 w-5" />} label="Diferencia acumulada" value={differenceUnits > 0 ? `+${differenceUnits}` : String(differenceUnits)} note={`${differenceItems} registros con diferencia`} tone="amber" />
          </div>

          <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm">
            <AuditTabButton active={auditTab === 'avance'} onClick={() => setAuditTab('avance')} icon={<BarChart3 className="h-4 w-4" />} label="Avance por rack" />
            <AuditTabButton active={auditTab === 'resumen'} onClick={() => setAuditTab('resumen')} icon={<ClipboardCheck className="h-4 w-4" />} label="Resumen general" />
            <AuditTabButton active={auditTab === 'asignacion'} onClick={() => setAuditTab('asignacion')} icon={<Users className="h-4 w-4" />} label="Asignar contadores" />
            <AuditTabButton active={auditTab === 'monitoreo'} onClick={() => setAuditTab('monitoreo')} icon={<Activity className="h-4 w-4" />} label="Monitoreo en vivo" />
            <AuditTabButton active={auditTab === 'resultados'} onClick={() => setAuditTab('resultados')} icon={<Eye className="h-4 w-4" />} label="Resultados" />
            <AuditTabButton active={auditTab === 'hallazgos'} onClick={() => setAuditTab('hallazgos')} icon={<AlertTriangle className="h-4 w-4" />} label="Material encontrado" />
          </div>

          {auditTab === 'avance' && <AdvanceView rackSummary={rackSummary} auditLocations={auditLocations} items={supervisorItems} filteredItems={filteredSupervisorItems} selectedPart={selectedPart} selectedPartId={selectedPartId} setSelectedPartId={setSelectedPartId} partSearch={partSearch} setPartSearch={setPartSearch} />}
          {auditTab === 'resumen' && <SummaryView rackSummary={rackSummary} totalLocations={totalLocations} completedLocations={completedLocations} totalItems={totalItems} countedItems={countedItems} expectedUnits={expectedUnits} foundUnits={foundUnits} differenceUnits={differenceUnits} correctItems={correctItems} differenceItems={differenceItems} pendingItems={pendingItems} donutData={donutData} />}
          {auditTab === 'asignacion' && <AssignmentView assignments={assignments} auditLocations={auditLocations} counters={counterProfiles} onCreate={() => setShowCreate(true)} />}
          {auditTab === 'monitoreo' && <LiveView assignments={assignments} auditLocations={auditLocations} items={supervisorItems} />}
          {auditTab === 'resultados' && <ResultsView items={filteredSupervisorItems} search={partSearch} setSearch={setPartSearch} onSelect={setSelectedPartId} />}
          {auditTab === 'hallazgos' && <FindingsView findings={findings} onReview={reviewFinding} />}
        </>
      )}

      {showCreate && <CreateAuditModal form={createForm} setForm={setCreateForm} racks={rackOptions} counters={counterProfiles} loading={createLoading} saving={saving} onClose={() => setShowCreate(false)} onToggleRack={toggleDraftRack} onCreate={createAudit} />}
    </div>
  );
}

function CounterAuditView({
  audits, activeAudit, activeAuditId, setActiveAuditId, auditLocations, items, tab, setTab, countInputs, setCountInputs, submitCount, completeLocation, findingForm, setFindingForm, submitFinding, saving, error, refresh, refreshing,
}: {
  audits: PhysicalAudit[];
  activeAudit: PhysicalAudit | null;
  activeAuditId: number | null;
  setActiveAuditId: (id: number) => void;
  auditLocations: PhysicalAuditLocation[];
  items: PhysicalAuditCounterItem[];
  tab: CounterTab;
  setTab: (tab: CounterTab) => void;
  countInputs: Record<number, string>;
  setCountInputs: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  submitCount: (item: PhysicalAuditCounterItem) => Promise<void>;
  completeLocation: (location: PhysicalAuditLocation) => Promise<void>;
  findingForm: { itemId: string; foundLocation: string; foundRack: string; foundQty: string; notes: string };
  setFindingForm: React.Dispatch<React.SetStateAction<{ itemId: string; foundLocation: string; foundRack: string; foundQty: string; notes: string }>>;
  submitFinding: () => Promise<void>;
  saving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshing: boolean;
}) {
  const completedLocations = auditLocations.filter(location => location.status === 'completada').length;
  const grouped = auditLocations.map(location => ({ location, items: items.filter(item => item.audit_location_id === location.id) }));
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-900 via-indigo-700 to-indigo-500 p-6 text-white shadow-lg"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><p className="mb-1 text-xs font-black uppercase tracking-[0.16em] text-indigo-200">Vista del contador</p><h2 className="text-3xl font-black tracking-tight">Mis conteos</h2><p className="mt-2 max-w-xl text-sm text-indigo-100">Registra únicamente la cantidad física que encuentres en cada etiqueta. La cantidad esperada no se muestra en esta vista.</p></div><div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold">● Sesión activa</div></div></div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><strong>No se pudo cargar la auditoría:</strong> {error}</div>}
      {audits.length === 0 ? <div className="rounded-2xl border border-dashed border-indigo-200 bg-white p-12 text-center shadow-sm"><ClipboardCheck className="mx-auto h-12 w-12 text-indigo-300" /><h3 className="mt-4 text-lg font-bold text-gray-800">No tienes auditorías asignadas</h3><p className="mt-2 text-sm text-gray-500">El supervisor debe asignarte un rack para comenzar.</p></div> : <>
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:flex-row md:items-center"><div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-indigo-600" /><span className="text-xs font-bold uppercase tracking-wide text-gray-500">Auditoría</span></div><select value={activeAuditId ?? ''} onChange={event => setActiveAuditId(Number(event.target.value))} className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-bold text-gray-800"><option value="">Seleccionar auditoría</option>{audits.map(audit => <option key={audit.id} value={audit.id}>{audit.name}</option>)}</select><button type="button" onClick={() => void refresh()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Actualizar</button></div>
        {activeAudit && <><div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><MetricCard icon={<MapPin className="h-5 w-5" />} label="Locaciones terminadas" value={`${completedLocations} / ${auditLocations.length}`} note="De mis asignaciones" tone="indigo" /><MetricCard icon={<Package className="h-5 w-5" />} label="Números asignados" value={items.length.toLocaleString()} note={`${items.filter(item => item.counted).length} registrados`} tone="emerald" /><MetricCard icon={<Clock3 className="h-5 w-5" />} label="Estado" value={formatStatus(activeAudit.status)} note="Auditoría activa" tone="violet" /></div><div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm"><AuditTabButton active={tab === 'conteo'} onClick={() => setTab('conteo')} icon={<ClipboardCheck className="h-4 w-4" />} label="Mis asignaciones" /><AuditTabButton active={tab === 'hallazgo'} onClick={() => setTab('hallazgo')} icon={<AlertTriangle className="h-4 w-4" />} label="Material encontrado" /></div>{tab === 'conteo' ? <div className="space-y-4">{grouped.map(({ location, items: locationItems }) => <CounterLocationCard key={location.id} location={location} items={locationItems} countInputs={countInputs} setCountInputs={setCountInputs} submitCount={submitCount} completeLocation={completeLocation} saving={saving} />)}</div> : <CounterFindingForm items={items} locations={auditLocations} form={findingForm} setForm={setFindingForm} onSubmit={submitFinding} saving={saving} />}</>}
      </>}
    </div>
  );
}

function CounterLocationCard({ location, items, countInputs, setCountInputs, submitCount, completeLocation, saving }: { location: PhysicalAuditLocation; items: PhysicalAuditCounterItem[]; countInputs: Record<number, string>; setCountInputs: React.Dispatch<React.SetStateAction<Record<number, string>>>; submitCount: (item: PhysicalAuditCounterItem) => Promise<void>; completeLocation: (location: PhysicalAuditLocation) => Promise<void>; saving: boolean }) {
  const allCounted = items.every(item => item.counted);
  return <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex flex-col justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-white px-5 py-4 md:flex-row md:items-center"><div className="flex items-center gap-3"><div className="rounded-xl bg-indigo-100 p-2.5 text-indigo-700"><MapPin className="h-5 w-5" /></div><div><h3 className="font-black text-gray-900">{location.location_code} <span className="font-medium text-gray-500">· Rack {location.rack}</span></h3><p className="mt-1 text-xs text-gray-500">{items.length ? `${items.length} número${items.length === 1 ? '' : 's'} de parte asignado${items.length === 1 ? '' : 's'}` : 'Locación sin materiales registrados'}</p></div></div><div className="flex items-center gap-2"><StatusBadge status={location.status} />{location.status !== 'completada' && <button type="button" disabled={saving || !allCounted} onClick={() => void completeLocation(location)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="h-4 w-4" />Terminar locación</button>}</div></div>{items.length > 0 ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Número de parte</th><th className="px-5 py-3">Descripción</th><th className="px-5 py-3">PO / FIFO</th><th className="px-5 py-3">Cantidad encontrada</th><th className="px-5 py-3">Acción</th><th className="px-5 py-3">Estado</th></tr></thead><tbody>{items.map(item => <tr key={item.id} className="border-t border-gray-100"><td className="px-5 py-4 font-mono text-xs font-bold text-indigo-700">{item.part_number}</td><td className="px-5 py-4 text-gray-700">{item.description || 'Sin descripción'}</td><td className="px-5 py-4 text-xs text-gray-500">{item.po || '—'}{item.fifo_number !== null ? ` · FIFO ${item.fifo_number}` : ''}</td><td className="px-5 py-4"><input type="number" min="0" placeholder="Cantidad" value={countInputs[item.id] ?? (item.found_qty === null ? '' : String(item.found_qty))} onChange={event => setCountInputs(current => ({ ...current, [item.id]: event.target.value }))} disabled={item.counted || saving} className="w-32 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-center font-bold focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" /></td><td className="px-5 py-4"><button type="button" disabled={item.counted || saving} onClick={() => void submitCount(item)} className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500">{item.counted ? 'Guardado' : 'Registrar'}</button></td><td className="px-5 py-4">{item.counted ? <StatusBadge status="correcto" /> : <StatusBadge status="pendiente" />}</td></tr>)}</tbody></table></div> : <div className="px-5 py-5 text-sm text-gray-500">Confirma esta locación como revisada; no hay números de parte que capturar.</div>}<div className="border-t border-indigo-50 bg-indigo-50/50 px-5 py-3 text-xs text-indigo-700"><strong>Conteo ciego:</strong> no se muestra la cantidad esperada del sistema.</div></div>;
}

function CounterFindingForm({ items, locations, form, setForm, onSubmit, saving }: { items: PhysicalAuditCounterItem[]; locations: PhysicalAuditLocation[]; form: { itemId: string; foundLocation: string; foundRack: string; foundQty: string; notes: string }; setForm: React.Dispatch<React.SetStateAction<{ itemId: string; foundLocation: string; foundRack: string; foundQty: string; notes: string }>>; onSubmit: () => Promise<void>; saving: boolean }) {
  const selectedItem = items.find(item => String(item.id) === form.itemId);
  const expectedLocation = selectedItem ? locations.find(location => location.id === selectedItem.audit_location_id) : null;
  return <div className="space-y-5"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><strong>¿Cuándo usarlo?</strong><br />Cuando encuentres el número de parte físicamente en una ubicación diferente a la que aparece en la asignación.</div><div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="text-lg font-black text-gray-900">Registrar número de parte encontrado</h3><p className="mt-1 text-sm text-gray-500">El supervisor revisará el hallazgo antes de cambiar la ubicación.</p></div><span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">Requiere revisión</span></div><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Field label="Número de parte encontrado"><select value={form.itemId} onChange={event => setForm(current => ({ ...current, itemId: event.target.value }))} className="field-input"><option value="">Seleccionar número de parte</option>{items.map(item => <option key={item.id} value={item.id}>{item.part_number} · {item.location_code}</option>)}</select></Field><Field label="Descripción"><input value={selectedItem?.description ?? ''} readOnly className="field-input bg-gray-50 text-gray-500" placeholder="Aparece automáticamente" /></Field><Field label="Locación esperada"><input value={expectedLocation ? `${expectedLocation.location_code} · Rack ${expectedLocation.rack}` : ''} readOnly className="field-input bg-gray-50 text-gray-500" /></Field><Field label="Rack donde se encontró"><input value={form.foundRack} onChange={event => setForm(current => ({ ...current, foundRack: event.target.value }))} className="field-input" placeholder="Ej. A" /></Field><Field label="Ubicación real encontrada"><input value={form.foundLocation} onChange={event => setForm(current => ({ ...current, foundLocation: event.target.value }))} className="field-input" placeholder="Ej. A-20" /></Field><Field label="Cantidad encontrada"><input type="number" min="0" value={form.foundQty} onChange={event => setForm(current => ({ ...current, foundQty: event.target.value }))} className="field-input" placeholder="Cantidad" /></Field><div className="md:col-span-2"><Field label="Comentario opcional"><textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} className="field-input min-h-24 py-3" placeholder="Agrega una nota para el supervisor..." /></Field></div></div><div className="mt-5 flex justify-end"><button type="button" disabled={saving} onClick={() => void onSubmit()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Enviar hallazgo</button></div></div></div>;
}

function AdvanceView({ rackSummary, auditLocations, items, filteredItems, selectedPart, selectedPartId, setSelectedPartId, partSearch, setPartSearch }: { rackSummary: AuditSummary[]; auditLocations: PhysicalAuditLocation[]; items: PhysicalAuditSupervisorItem[]; filteredItems: PhysicalAuditSupervisorItem[]; selectedPart: PhysicalAuditSupervisorItem | null; selectedPartId: number | null; setSelectedPartId: (id: number) => void; partSearch: string; setPartSearch: (value: string) => void }) {
  const locationItems = auditLocations.map(location => {
    const itemsForLocation = items.filter(item => item.audit_location_id === location.id);
    return { location, items: itemsForLocation, expected: itemsForLocation.reduce((sum, item) => sum + item.expected_qty, 0), found: itemsForLocation.reduce((sum, item) => sum + (item.found_qty ?? 0), 0), difference: itemsForLocation.reduce((sum, item) => sum + (item.difference_qty ?? 0), 0) };
  });
  return <div className="space-y-5"><div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_.8fr]"><div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-black text-gray-900">Progreso de locaciones revisadas por rack</h3><p className="mt-1 text-xs text-gray-500">Avance de la auditoría activa por rack</p></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">En vivo</span></div><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={rackSummary} margin={{ top: 10, right: 10, bottom: 0, left: -16 }}><CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" /><XAxis dataKey="rack" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip formatter={(value, name) => [value, name === 'completed' ? 'Revisadas' : 'Pendientes']} /><Legend formatter={value => value === 'completed' ? 'Revisadas' : 'Pendientes'} /><Bar dataKey="completed" name="completed" stackId="a" fill="#4f46e5" radius={[0, 0, 0, 0]} /><Bar dataKey="pending" name="pending" stackId="a" fill="#cbd5e1" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></div><div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="mb-2"><h3 className="font-black text-gray-900">Estado de números de parte</h3><p className="mt-1 text-xs text-gray-500">Conteo físico registrado en la auditoría</p></div><div className="h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{ name: 'Correcto', value: items.filter(item => item.status === 'correcto').length }, { name: 'Diferencia', value: items.filter(item => ['faltante', 'sobrante'].includes(item.status)).length }, { name: 'Pendiente', value: items.filter(item => item.status === 'pendiente').length }].filter(row => row.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={3}>{[0, 1, 2].map(index => <Cell key={`cell-${index}`} fill={CHART_COLORS[index]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div></div></div><div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_.7fr]"><div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div><h3 className="font-black text-gray-900">Locaciones del rack seleccionado</h3><p className="mt-1 text-xs text-gray-500">Detalle de avance por locación y cantidad</p></div><span className="rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-bold text-indigo-700">{auditLocations.length} locaciones</span></div><div className="max-h-[430px] overflow-auto"><table className="w-full min-w-[790px] text-left text-xs"><thead className="sticky top-0 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Locación</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Part numbers</th><th className="px-4 py-3">Sistema</th><th className="px-4 py-3">Físico</th><th className="px-4 py-3">Diferencia</th></tr></thead><tbody>{locationItems.map(row => <tr key={row.location.id} className="border-t border-gray-100"><td className="px-4 py-3 font-mono font-bold text-indigo-700">{row.location.location_code}</td><td className="px-4 py-3"><StatusBadge status={row.location.status} /></td><td className="px-4 py-3 font-bold text-gray-700">{row.items.length}</td><td className="px-4 py-3 font-bold text-gray-700">{row.expected.toLocaleString()}</td><td className="px-4 py-3 font-bold text-gray-700">{row.items.some(item => item.found_qty === null) ? '—' : row.found.toLocaleString()}</td><td className={`px-4 py-3 font-bold ${row.difference < 0 ? 'text-red-600' : row.difference > 0 ? 'text-emerald-700' : 'text-gray-500'}`}>{row.items.length && row.items.every(item => item.found_qty !== null) ? (row.difference > 0 ? `+${row.difference}` : row.difference) : '—'}</td></tr>)}</tbody></table></div></div><div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="border-b border-gray-100 px-5 py-4"><h3 className="font-black text-gray-900">Números de parte registrados</h3><p className="mt-1 text-xs text-gray-500">Selecciona uno para ver su información</p><div className="relative mt-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={partSearch} onChange={event => setPartSearch(event.target.value)} placeholder="Buscar número de parte..." className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-xs focus:border-indigo-400 focus:outline-none" /></div></div><div className="max-h-[250px] overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Número de parte</th><th className="px-4 py-3">Locación</th><th className="px-4 py-3">Físico</th><th className="px-4 py-3">Estado</th></tr></thead><tbody>{filteredItems.map(item => <tr key={item.id} onClick={() => setSelectedPartId(item.id)} className={`cursor-pointer border-t border-gray-100 transition hover:bg-indigo-50 ${item.id === selectedPartId || (!selectedPartId && item.id === selectedPart?.id) ? 'bg-indigo-50' : ''}`}><td className="px-4 py-3 font-mono font-bold text-indigo-700">{item.part_number}</td><td className="px-4 py-3">{item.location_code}</td><td className="px-4 py-3 font-bold">{item.found_qty ?? '—'}</td><td className="px-4 py-3"><StatusBadge status={item.status} /></td></tr>)}</tbody></table></div>{selectedPart && <div className="border-t border-indigo-100 bg-indigo-50/50 p-4"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-indigo-600">Detalle del registro seleccionado</p><div className="mt-1 flex items-start justify-between gap-2"><div><p className="font-mono text-sm font-black text-indigo-800">{selectedPart.part_number}</p><p className="mt-1 text-xs text-gray-600">{selectedPart.description || 'Sin descripción'}</p></div><StatusBadge status={selectedPart.status} /></div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><Detail label="Ubicación" value={`${selectedPart.location_code} · Rack ${selectedPart.rack}`} /><Detail label="PO / FIFO" value={`${selectedPart.po || '—'}${selectedPart.fifo_number !== null ? ` · FIFO ${selectedPart.fifo_number}` : ''}`} /><Detail label="Sistema" value={String(selectedPart.expected_qty)} /><Detail label="Físico" value={selectedPart.found_qty === null ? 'Pendiente' : String(selectedPart.found_qty)} /><Detail label="Diferencia" value={selectedPart.difference_qty === null ? '—' : String(selectedPart.difference_qty)} /><Detail label="Capturado" value={formatDate(selectedPart.counted_at)} /></div></div>}</div></div></div>;
}

function SummaryView({ rackSummary, totalLocations, completedLocations, totalItems, countedItems, expectedUnits, foundUnits, differenceUnits, correctItems, differenceItems, pendingItems, donutData }: { rackSummary: AuditSummary[]; totalLocations: number; completedLocations: number; totalItems: number; countedItems: number; expectedUnits: number; foundUnits: number; differenceUnits: number; correctItems: number; differenceItems: number; pendingItems: number; donutData: Array<{ name: string; value: number }> }) {
  return <div className="space-y-5"><div className="grid grid-cols-1 gap-4 md:grid-cols-3"><SimpleSummary label="Locaciones" value={`${completedLocations} / ${totalLocations}`} note="Revisadas / totales" /><SimpleSummary label="Números de parte" value={`${countedItems} / ${totalItems}`} note="Con cantidad física" /><SimpleSummary label="Unidades" value={`${foundUnits.toLocaleString()} / ${expectedUnits.toLocaleString()}`} note={`Diferencia ${differenceUnits > 0 ? '+' : ''}${differenceUnits}`} /></div><div className="grid grid-cols-1 gap-5 xl:grid-cols-2"><div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><h3 className="font-black text-gray-900">Resumen por rack</h3><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[570px] text-left text-xs"><thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Rack</th><th className="px-4 py-3">Locaciones</th><th className="px-4 py-3">Revisadas</th><th className="px-4 py-3">Part numbers</th><th className="px-4 py-3">Diferencias</th><th className="px-4 py-3">Avance</th></tr></thead><tbody>{rackSummary.map(row => <tr key={row.rack} className="border-t border-gray-100"><td className="px-4 py-3 font-mono font-bold text-indigo-700">{row.rack}</td><td className="px-4 py-3">{row.total}</td><td className="px-4 py-3 font-bold">{row.completed}</td><td className="px-4 py-3">{row.items}</td><td className="px-4 py-3"><span className="rounded-full bg-amber-100 px-2 py-1 font-bold text-amber-700">{row.differences}</span></td><td className="px-4 py-3 font-black text-indigo-700">{row.progress}%</td></tr>)}</tbody></table></div></div><div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><h3 className="font-black text-gray-900">Estado del conteo</h3><div className="mt-2 h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={donutData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3}>{donutData.map((_, index) => <Cell key={index} fill={CHART_COLORS[index]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div><div className="grid grid-cols-3 gap-2 text-center text-xs"><div><strong className="block text-lg text-emerald-700">{correctItems}</strong><span className="text-gray-500">Correctos</span></div><div><strong className="block text-lg text-amber-700">{differenceItems}</strong><span className="text-gray-500">Diferencias</span></div><div><strong className="block text-lg text-gray-500">{pendingItems}</strong><span className="text-gray-500">Pendientes</span></div></div></div></div></div>;
}

function AssignmentView({ assignments, auditLocations, counters, onCreate }: { assignments: PhysicalAuditRackAssignment[]; auditLocations: PhysicalAuditLocation[]; counters: CounterProfile[]; onCreate: () => void }) {
  const nameFor = (userId: string) => counters.find(counter => counter.user_id === userId)?.nombre_completo || counters.find(counter => counter.user_id === userId)?.email || userId.slice(0, 8);
  return <div className="space-y-5"><div className="flex flex-col justify-between gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-5 md:flex-row md:items-center"><div><h3 className="font-black text-indigo-900">Asignación de contadores</h3><p className="mt-1 text-sm text-indigo-700">Cada rack tiene una persona responsable del conteo físico.</p></div><button type="button" onClick={onCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" />Nueva auditoría / asignación</button></div><div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Rack</th><th className="px-5 py-3">Contador</th><th className="px-5 py-3">Locaciones</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Asignado</th></tr></thead><tbody>{assignments.map(assignment => { const total = auditLocations.filter(location => location.rack === assignment.rack).length; const done = auditLocations.filter(location => location.rack === assignment.rack && location.status === 'completada').length; return <tr key={assignment.id} className="border-t border-gray-100"><td className="px-5 py-4 font-mono font-bold text-indigo-700">Rack {assignment.rack}</td><td className="px-5 py-4"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-100 text-xs font-black text-indigo-700">{nameFor(assignment.contador_user_id).slice(0, 2).toUpperCase()}</span><span className="font-bold text-gray-800">{nameFor(assignment.contador_user_id)}</span></div></td><td className="px-5 py-4 font-bold">{done} / {total}</td><td className="px-5 py-4"><StatusBadge status={assignment.status} /></td><td className="px-5 py-4 text-gray-500">{formatDate(assignment.assigned_at)}</td></tr>; })}</tbody></table></div></div></div>;
}

function LiveView({ assignments, auditLocations, items }: { assignments: PhysicalAuditRackAssignment[]; auditLocations: PhysicalAuditLocation[]; items: PhysicalAuditSupervisorItem[] }) {
  return <div className="space-y-5"><div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_#d1fae5]" />Monitoreo en vivo activo: los registros se actualizan cuando un contador guarda una cantidad.</div><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{assignments.map(assignment => { const locations = auditLocations.filter(location => location.rack === assignment.rack); const done = locations.filter(location => location.status === 'completada').length; const rackItems = items.filter(item => item.rack === assignment.rack); const differences = rackItems.filter(item => item.status === 'faltante' || item.status === 'sobrante').length; const percentage = locations.length ? Math.round((done / locations.length) * 100) : 0; return <div key={assignment.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-100 text-sm font-black text-indigo-700">{assignment.rack}</span><div><h3 className="font-black text-gray-900">Rack {assignment.rack}</h3><p className="mt-1 text-xs text-gray-500">{assignment.contador_user_id.slice(0, 8)} · {done} de {locations.length} locaciones</p></div></div><StatusBadge status={assignment.status} /></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${percentage}%` }} /></div><div className="mt-2 flex justify-between text-xs"><strong className="text-indigo-700">{percentage}%</strong><span className="text-gray-500">{differences} diferencias</span></div></div>; })}</div><div className="rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="border-b border-gray-100 px-5 py-4"><h3 className="font-black text-gray-900">Últimas capturas</h3><p className="mt-1 text-xs text-gray-500">Ordenadas por la fecha de conteo</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Hora</th><th className="px-5 py-3">Rack / Locación</th><th className="px-5 py-3">Número de parte</th><th className="px-5 py-3">Físico</th><th className="px-5 py-3">Resultado</th></tr></thead><tbody>{items.filter(item => item.counted_at).sort((a, b) => Date.parse(b.counted_at ?? '') - Date.parse(a.counted_at ?? '')).slice(0, 12).map(item => <tr key={item.id} className="border-t border-gray-100"><td className="px-5 py-4 text-gray-500">{formatDate(item.counted_at)}</td><td className="px-5 py-4 font-mono font-bold text-indigo-700">{item.rack} · {item.location_code}</td><td className="px-5 py-4 font-mono font-bold">{item.part_number}</td><td className="px-5 py-4 font-bold">{item.found_qty}</td><td className="px-5 py-4"><StatusBadge status={item.status} /></td></tr>)}</tbody></table></div></div></div>;
}

function ResultsView({ items, search, setSearch, onSelect }: { items: PhysicalAuditSupervisorItem[]; search: string; setSearch: (value: string) => void; onSelect: (id: number) => void }) {
  return <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex flex-col justify-between gap-3 border-b border-gray-100 px-5 py-4 md:flex-row md:items-center"><div><h3 className="font-black text-gray-900">Resultados de la auditoría</h3><p className="mt-1 text-xs text-gray-500">Comparación entre la cantidad del sistema y el conteo físico.</p></div><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar locación o part number..." className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-xs md:w-72" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Locación</th><th className="px-4 py-3">Número de parte</th><th className="px-4 py-3">Sistema</th><th className="px-4 py-3">Físico</th><th className="px-4 py-3">Diferencia</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Capturado</th><th className="px-4 py-3">Acción</th></tr></thead><tbody>{items.map(item => <tr key={item.id} className="border-t border-gray-100"><td className="px-4 py-4 font-mono font-bold text-indigo-700">{item.location_code}</td><td className="px-4 py-4 font-mono font-bold">{item.part_number}</td><td className="px-4 py-4 font-bold">{item.expected_qty}</td><td className="px-4 py-4 font-bold">{item.found_qty ?? '—'}</td><td className={`px-4 py-4 font-black ${item.difference_qty === null ? 'text-gray-400' : item.difference_qty < 0 ? 'text-red-600' : item.difference_qty > 0 ? 'text-emerald-700' : 'text-gray-500'}`}>{item.difference_qty === null ? '—' : item.difference_qty > 0 ? `+${item.difference_qty}` : item.difference_qty}</td><td className="px-4 py-4"><StatusBadge status={item.status} /></td><td className="px-4 py-4 text-gray-500">{formatDate(item.counted_at)}</td><td className="px-4 py-4"><button type="button" onClick={() => onSelect(item.id)} className="inline-flex items-center gap-1 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1.5 font-bold text-indigo-700"> <Eye className="h-3.5 w-3.5" />Detalle</button></td></tr>)}</tbody></table></div></div>;
}

function FindingsView({ findings, onReview }: { findings: PhysicalAuditFinding[]; onReview: (finding: PhysicalAuditFinding, status: 'validado' | 'rechazado') => Promise<void> }) {
  return <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex flex-col justify-between gap-3 border-b border-gray-100 px-5 py-4 md:flex-row md:items-center"><div><h3 className="font-black text-gray-900">Material encontrado</h3><p className="mt-1 text-xs text-gray-500">Revisa piezas reportadas en una locación diferente a la esperada.</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">{findings.filter(finding => finding.status === 'pendiente_revision').length} pendientes</span></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Número de parte</th><th className="px-4 py-3">Esperada</th><th className="px-4 py-3">Encontrada en</th><th className="px-4 py-3">Cantidad</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acción</th></tr></thead><tbody>{findings.map(finding => <tr key={finding.id} className="border-t border-gray-100"><td className="px-4 py-4 text-gray-500">{formatDate(finding.created_at)}</td><td className="px-4 py-4 font-mono font-bold text-indigo-700">{finding.part_number}</td><td className="px-4 py-4 font-mono">{finding.expected_location_code || '—'}</td><td className="px-4 py-4 font-mono font-bold">{finding.found_location_code}{finding.found_rack ? ` · Rack ${finding.found_rack}` : ''}</td><td className="px-4 py-4 font-bold">{finding.found_qty}</td><td className="px-4 py-4"><StatusBadge status={finding.status} /></td><td className="px-4 py-4">{finding.status === 'pendiente_revision' ? <div className="flex gap-2"><button type="button" onClick={() => void onReview(finding, 'validado')} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 font-bold text-white">Validar</button><button type="button" onClick={() => void onReview(finding, 'rechazado')} className="rounded-lg bg-red-50 px-2.5 py-1.5 font-bold text-red-700">Rechazar</button></div> : <span className="text-gray-400">Revisado</span>}</td></tr>)}</tbody></table></div>{findings.length === 0 && <div className="p-10 text-center text-sm text-gray-500">No hay material encontrado reportado en esta auditoría.</div>}</div>;
}

function CreateAuditModal({ form, setForm, racks, counters, loading, saving, onClose, onToggleRack, onCreate }: { form: { name: string; description: string; selectedRacks: string[]; assignees: Record<string, string> }; setForm: React.Dispatch<React.SetStateAction<{ name: string; description: string; selectedRacks: string[]; assignees: Record<string, string> }>>; racks: string[]; counters: CounterProfile[]; loading: boolean; saving: boolean; onClose: () => void; onToggleRack: (rack: string) => void; onCreate: () => Promise<void> }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-gray-100 px-6 py-5"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-600">Nueva auditoría</p><h3 className="mt-1 text-xl font-black text-gray-900">Crear fotografía de conteo</h3></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-5 w-5" /></button></div><div className="space-y-5 p-6"><Field label="Nombre de auditoría"><input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} className="field-input" placeholder="Ej. Conteo mensual octubre 2026" /></Field><Field label="Descripción"><textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} className="field-input min-h-20 py-3" placeholder="Periodo, turno o notas generales..." /></Field><div><div className="mb-2 flex items-center justify-between"><label className="field-label">Selecciona racks y contador responsable</label><span className="text-xs text-gray-500">{form.selectedRacks.length} seleccionados</span></div>{loading ? <div className="flex items-center gap-2 rounded-xl bg-gray-50 p-4 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Cargando locaciones y contadores...</div> : racks.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">No se encontraron racks en `locations`.</div> : <div className="space-y-2">{racks.map(rack => { const selected = form.selectedRacks.includes(rack); return <div key={rack} className={`rounded-xl border p-3 transition ${selected ? 'border-indigo-200 bg-indigo-50/60' : 'border-gray-200 bg-white'}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><label className="flex flex-1 items-center gap-3 text-sm font-bold text-gray-800"><input type="checkbox" checked={selected} onChange={() => onToggleRack(rack)} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />Rack {rack}<span className="text-xs font-normal text-gray-500">{referenceLocationCount(rack, racks, form)}</span></label>{selected && <select value={form.assignees[rack] ?? ''} onChange={event => setForm(current => ({ ...current, assignees: { ...current.assignees, [rack]: event.target.value } }))} className="field-input sm:max-w-[260px]"><option value="">Seleccionar contador</option>{counters.map(counter => <option key={counter.user_id} value={counter.user_id}>{counter.nombre_completo || counter.email || counter.user_id}</option>)}</select>}</div></div>; })}</div>}</div><div className="flex justify-end gap-3 border-t border-gray-100 pt-5"><button type="button" onClick={onClose} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700">Cancelar</button><button type="button" disabled={saving || loading} onClick={() => void onCreate()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Crear y asignar racks</button></div></div></div></div>;
}

function referenceLocationCount(rack: string, _racks: string[], _form: { name: string; description: string; selectedRacks: string[]; assignees: Record<string, string> }) {
  return `Rack ${rack}`;
}

function MetricCard({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string; note: string; tone: 'indigo' | 'emerald' | 'violet' | 'amber' }) {
  const classes = { indigo: 'bg-indigo-50 text-indigo-700', emerald: 'bg-emerald-50 text-emerald-700', violet: 'bg-violet-50 text-violet-700', amber: 'bg-amber-50 text-amber-700' }[tone];
  return <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm"><div className={`rounded-xl p-3 ${classes}`}>{icon}</div><div className="min-w-0"><p className="truncate text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</p><p className="mt-1 truncate text-2xl font-black text-gray-900">{value}</p><p className="mt-0.5 truncate text-[11px] text-gray-400">{note}</p></div></div>;
}

function SimpleSummary({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p><p className="mt-2 text-3xl font-black text-gray-900">{value}</p><p className="mt-1 text-xs text-gray-500">{note}</p></div>;
}

function AuditTabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" onClick={onClick} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${active ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}>{icon}{label}</button>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="field-label">{label}</label>{children}</div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p><p className="mt-1 font-bold text-gray-700">{value}</p></div>;
}
