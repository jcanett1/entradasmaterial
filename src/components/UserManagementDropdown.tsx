import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { UsuarioAlmacen } from '@/lib/supabase';
import {
  Users,
  UserPlus,
  ChevronDown,
  X,
  Save,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Shield,
  User,
  Building2,
  Mail,
  Lock,
  BadgeCheck,
  AlertCircle,
  LogOut,
} from 'lucide-react';

interface UserManagementDropdownProps {
  currentUserEmail: string;
  isAdmin: boolean;
  userRol: 'admin' | 'supervisor' | 'operador' | null;
  onSignOut: () => void;
}

type FormMode = 'list' | 'create' | 'edit';

interface UserFormData {
  email: string;
  password: string;
  nombre_completo: string;
  departamento: string;
  rol: 'admin' | 'supervisor' | 'operador';
  activo: boolean;
}

const defaultForm: UserFormData = {
  email: '',
  password: '',
  nombre_completo: '',
  departamento: '',
  rol: 'operador',
  activo: true,
};

const ROL_LABEL: Record<string, string> = {
  admin: 'Admin',
  supervisor: 'Supervisor',
  operador: 'Operador',
};

/* =============================================
   COMPONENTE PRINCIPAL
============================================= */
export function UserManagementDropdown({
  currentUserEmail,
  isAdmin,
  userRol,
  onSignOut,
}: UserManagementDropdownProps) {
  const [open, setOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState<FormMode>('list');
  const [users, setUsers] = useState<UsuarioAlmacen[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [editingUser, setEditingUser] = useState<UsuarioAlmacen | null>(null);
  const [form, setForm] = useState<UserFormData>(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  /* ---- Cerrar al click fuera ---- */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ---- Toast auto-dismiss ---- */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /* =============================================
     FETCH — obtiene usuarios + email via RPC o vista
     Usamos una consulta a usuarioalmacen y luego
     enriquecemos con el email del usuario autenticado
     que tenemos disponible en auth.users via
     la función get_users_with_email (si existe),
     o simplemente mostramos lo que hay.
  ============================================= */
  const fetchUsers = async () => {
    setLoadingUsers(true);

    // Intentar obtener usuarios con email via función RPC
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('get_users_with_email');

    if (!rpcError && rpcData) {
      setUsers(rpcData as UsuarioAlmacen[]);
    } else {
      // Fallback: solo datos de usuarioalmacen sin email
      const { data, error } = await supabase
        .from('usuarioalmacen')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error) setUsers(data ?? []);
      else console.error('Error fetching users:', error);
    }

    setLoadingUsers(false);
  };

  /* =============================================
     ABRIR MODAL
  ============================================= */
  const openList = () => {
    fetchUsers();
    setMode('list');
    setShowModal(true);
    setOpen(false);
  };

  const openCreate = () => {
    setForm(defaultForm);
    setErrors({});
    setMode('create');
    setShowModal(true);
    setOpen(false);
  };

  const openEdit = (u: UsuarioAlmacen) => {
    setEditingUser(u);
    setForm({
      email: u.email ?? '',
      password: '',
      nombre_completo: u.nombre_completo ?? '',
      departamento: u.departamento ?? '',
      rol: u.rol,
      activo: u.activo,
    });
    setErrors({});
    setMode('edit');
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setForm(defaultForm);
    setErrors({});
  };

  /* =============================================
     VALIDACIÓN
  ============================================= */
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (mode === 'create') {
      if (!form.email.trim()) e.email = 'El correo es requerido';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Correo inválido';
      if (!form.password || form.password.length < 6) e.password = 'Mínimo 6 caracteres';
    }
    if (!form.nombre_completo.trim()) e.nombre_completo = 'El nombre es requerido';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /* =============================================
     CREAR USUARIO
  ============================================= */
  const handleCreate = async () => {
    if (!validate()) return;
    setSaving(true);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    });

    if (signUpError || !signUpData.user) {
      setToast({ msg: signUpError?.message ?? 'Error al crear usuario', type: 'error' });
      setSaving(false);
      return;
    }

    const { error: dbError } = await supabase.from('usuarioalmacen').insert([{
      user_id: signUpData.user.id,
      nombre_completo: form.nombre_completo.trim(),
      departamento: form.departamento.trim() || null,
      rol: form.rol,
      activo: form.activo,
    }]);

    if (dbError) {
      setToast({ msg: dbError.message, type: 'error' });
    } else {
      setToast({ msg: 'Usuario creado exitosamente', type: 'success' });
      fetchUsers();
      setMode('list');
    }
    setSaving(false);
  };

  /* =============================================
     EDITAR USUARIO
  ============================================= */
  const handleEdit = async () => {
    if (!validate() || !editingUser) return;
    setSaving(true);

    const { error } = await supabase
      .from('usuarioalmacen')
      .update({
        nombre_completo: form.nombre_completo.trim(),
        departamento: form.departamento.trim() || null,
        rol: form.rol,
        activo: form.activo,
      })
      .eq('id', editingUser.id);

    if (error) {
      setToast({ msg: error.message, type: 'error' });
    } else {
      setToast({ msg: 'Usuario actualizado correctamente', type: 'success' });
      fetchUsers();
      setMode('list');
      setEditingUser(null);
    }
    setSaving(false);
  };

  /* =============================================
     ELIMINAR USUARIO
  ============================================= */
  const handleDelete = async (u: UsuarioAlmacen) => {
    if (!confirm(`¿Eliminar al usuario "${u.nombre_completo ?? u.email ?? u.user_id}"? Esta acción no se puede deshacer.`)) return;

    const { error } = await supabase
      .from('usuarioalmacen')
      .delete()
      .eq('id', u.id);

    if (error) {
      setToast({ msg: error.message, type: 'error' });
    } else {
      setToast({ msg: 'Usuario eliminado', type: 'success' });
      fetchUsers();
    }
  };

  /* =============================================
     HELPERS UI
  ============================================= */
  const rolBadge = (rol: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      admin:      { label: 'Admin',      cls: 'bg-purple-100 text-purple-700 border-purple-200' },
      supervisor: { label: 'Supervisor', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
      operador:   { label: 'Operador',   cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    };
    const r = map[rol] ?? map['operador'];
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${r.cls}`}>
        {r.label}
      </span>
    );
  };

  const inputCls = (field: string) =>
    `w-full px-3.5 py-2.5 border rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-gray-50 ${
      errors[field] ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300'
    }`;

  /* =============================================
     RENDER
  ============================================= */
  return (
    <>
      {/* ---- Toast ---- */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium border animate-in ${
          toast.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          {toast.type === 'success'
            ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
            : <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* ---- Trigger ---- */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-white/90 hover:bg-white/15 transition-all duration-200 text-sm font-medium border border-white/20"
        >
          <div className="h-7 w-7 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold uppercase">
              {currentUserEmail ? currentUserEmail[0] : '?'}
            </span>
          </div>
          <span className="hidden sm:inline max-w-[150px] truncate">{currentUserEmail}</span>
          {userRol && (
            <span className={`hidden sm:inline text-xs px-1.5 py-0.5 rounded-md font-semibold ${
              userRol === 'admin'      ? 'bg-yellow-400/30 text-yellow-200' :
              userRol === 'supervisor' ? 'bg-blue-400/30 text-blue-200' :
                                         'bg-white/20 text-white/70'
            }`}>
              {ROL_LABEL[userRol]}
            </span>
          )}
          {isAdmin && (
            <span title="Administrador"><Shield className="h-3.5 w-3.5 text-yellow-300" /></span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* ---- Menú desplegable ---- */}
        {open && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-in">
            {/* Info del usuario actual */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-800 truncate">{currentUserEmail}</p>
              <p className="text-xs text-gray-400 mt-0.5">{ROL_LABEL[userRol ?? ''] ?? 'Sin rol asignado'}</p>
            </div>

            {/* Opciones de gestión — solo admin */}
            {isAdmin ? (
              <>
                <button
                  onClick={openList}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                >
                  <Users className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                  Ver usuarios
                </button>
                <button
                  onClick={openCreate}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors border-b border-gray-100"
                >
                  <UserPlus className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                  Agregar usuario
                </button>
              </>
            ) : (
              <div className="px-4 py-2 border-b border-gray-100" />
            )}

            {/* Cerrar sesión */}
            <button
              onClick={() => { setOpen(false); onSignOut(); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              Cerrar sesión
            </button>
          </div>
        )}
      </div>

      {/* =============================================
          MODAL
      ============================================= */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-gray-100 animate-in max-h-[90vh] flex flex-col">

            {/* Header del modal */}
            <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl" style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}>
                  {mode === 'list'   && <Users className="h-4 w-4 text-white" />}
                  {mode === 'create' && <UserPlus className="h-4 w-4 text-white" />}
                  {mode === 'edit'   && <Edit2 className="h-4 w-4 text-white" />}
                </div>
                <h2 className="text-lg font-bold text-gray-900">
                  {mode === 'list'   && 'Usuarios del Sistema'}
                  {mode === 'create' && 'Agregar Nuevo Usuario'}
                  {mode === 'edit'   && 'Editar Usuario'}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {mode !== 'list' && (
                  <button
                    onClick={() => { setMode('list'); setErrors({}); fetchUsers(); }}
                    className="text-xs text-indigo-600 hover:underline font-medium px-2 py-1"
                  >
                    ← Volver
                  </button>
                )}
                <button
                  onClick={closeModal}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Cuerpo del modal */}
            <div className="overflow-y-auto flex-1">

              {/* ---- LISTA ---- */}
              {mode === 'list' && (
                <>
                  <div className="px-6 py-4 flex justify-between items-center border-b border-gray-50">
                    <p className="text-sm text-gray-500">
                      {loadingUsers
                        ? 'Cargando...'
                        : `${users.length} usuario${users.length !== 1 ? 's' : ''}`}
                    </p>
                    <button
                      onClick={() => { setForm(defaultForm); setErrors({}); setMode('create'); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white shadow-sm active:scale-95"
                      style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Nuevo usuario
                    </button>
                  </div>

                  {loadingUsers ? (
                    <div className="flex flex-col items-center justify-center py-16">
                      <Loader2 className="h-8 w-8 text-indigo-400 animate-spin mb-3" />
                      <p className="text-sm text-gray-400">Cargando usuarios...</p>
                    </div>
                  ) : users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16">
                      <Users className="h-12 w-12 text-gray-200 mb-3" />
                      <p className="text-gray-500 font-medium">Sin usuarios registrados</p>
                      <p className="text-gray-400 text-sm mt-1">Agrega el primer usuario</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {users.map((u) => (
                        <div key={u.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            {/* Info del usuario */}
                            <div className="flex items-start gap-3 min-w-0">
                              {/* Avatar */}
                              <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm mt-0.5 ${
                                u.rol === 'admin'      ? 'bg-purple-100 text-purple-700' :
                                u.rol === 'supervisor' ? 'bg-blue-100 text-blue-700' :
                                                         'bg-gray-100 text-gray-600'
                              }`}>
                                {(u.nombre_completo ?? u.email ?? 'U')[0]?.toUpperCase()}
                              </div>

                              <div className="min-w-0 flex-1">
                                {/* Nombre */}
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                  {u.nombre_completo || <span className="text-gray-400 italic font-normal">Sin nombre</span>}
                                </p>

                                {/* Email */}
                                {u.email && (
                                  <p className="text-xs text-gray-500 truncate mt-0.5 flex items-center gap-1">
                                    <Mail className="h-3 w-3 flex-shrink-0" />
                                    {u.email}
                                  </p>
                                )}

                                {/* Departamento */}
                                {u.departamento && (
                                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                    <Building2 className="h-3 w-3 flex-shrink-0" />
                                    {u.departamento}
                                  </p>
                                )}

                                {/* Rol + Estado */}
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  {rolBadge(u.rol)}
                                  {u.activo ? (
                                    <span className="inline-flex items-center gap-0.5 text-xs text-emerald-600 font-medium">
                                      <CheckCircle2 className="h-3 w-3" /> Activo
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 text-xs text-red-500 font-medium">
                                      <XCircle className="h-3 w-3" /> Inactivo
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Acciones */}
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                onClick={() => openEdit(u)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 transition-all active:scale-95"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                                Editar
                              </button>
                              <button
                                onClick={() => handleDelete(u)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 transition-all active:scale-95"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Eliminar
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ---- CREAR / EDITAR ---- */}
              {(mode === 'create' || mode === 'edit') && (
                <div className="px-6 py-5 space-y-4">

                  {/* Email (solo crear) */}
                  {mode === 'create' && (
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                        <Mail className="h-3.5 w-3.5 text-indigo-400" />
                        Correo electrónico <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                        placeholder="usuario@empresa.com"
                        className={inputCls('email')}
                      />
                      {errors.email && <p className="text-red-500 text-xs mt-1.5">⚠ {errors.email}</p>}
                    </div>
                  )}

                  {/* Email (solo editar — readonly) */}
                  {mode === 'edit' && form.email && (
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                        <Mail className="h-3.5 w-3.5 text-gray-400" />
                        Correo electrónico
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        readOnly
                        className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
                      />
                      <p className="text-xs text-gray-400 mt-1">El correo no se puede modificar desde aquí.</p>
                    </div>
                  )}

                  {/* Contraseña (solo crear) */}
                  {mode === 'create' && (
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                        <Lock className="h-3.5 w-3.5 text-indigo-400" />
                        Contraseña <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                        placeholder="Mínimo 6 caracteres"
                        className={inputCls('password')}
                      />
                      {errors.password && <p className="text-red-500 text-xs mt-1.5">⚠ {errors.password}</p>}
                    </div>
                  )}

                  {/* Nombre completo */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                      <User className="h-3.5 w-3.5 text-indigo-400" />
                      Nombre completo <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.nombre_completo}
                      onChange={(e) => setForm((p) => ({ ...p, nombre_completo: e.target.value }))}
                      placeholder="Nombre y apellido"
                      className={inputCls('nombre_completo')}
                    />
                    {errors.nombre_completo && <p className="text-red-500 text-xs mt-1.5">⚠ {errors.nombre_completo}</p>}
                  </div>

                  {/* Departamento */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                      <Building2 className="h-3.5 w-3.5 text-indigo-400" />
                      Departamento
                    </label>
                    <input
                      type="text"
                      value={form.departamento}
                      onChange={(e) => setForm((p) => ({ ...p, departamento: e.target.value }))}
                      placeholder="Ej. Almacén, Logística..."
                      className={inputCls('departamento')}
                    />
                  </div>

                  {/* Rol + Estado */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                        <BadgeCheck className="h-3.5 w-3.5 text-indigo-400" />
                        Rol
                      </label>
                      <select
                        value={form.rol}
                        onChange={(e) => setForm((p) => ({ ...p, rol: e.target.value as UserFormData['rol'] }))}
                        className={inputCls('rol') + ' cursor-pointer'}
                      >
                        <option value="operador">Operador</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        Estado
                      </label>
                      <select
                        value={form.activo ? 'true' : 'false'}
                        onChange={(e) => setForm((p) => ({ ...p, activo: e.target.value === 'true' }))}
                        className={inputCls('activo') + ' cursor-pointer'}
                      >
                        <option value="true">Activo</option>
                        <option value="false">Inactivo</option>
                      </select>
                    </div>
                  </div>

                  {/* Botones */}
                  <div className="flex gap-3 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => { setMode('list'); setErrors({}); fetchUsers(); }}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all active:scale-95"
                    >
                      <X className="h-4 w-4" />
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={mode === 'create' ? handleCreate : handleEdit}
                      disabled={saving}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 shadow-md disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', boxShadow: '0 4px 14px 0 rgba(79,70,229,0.35)' }}
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {saving ? 'Guardando...' : mode === 'create' ? 'Crear usuario' : 'Guardar cambios'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
