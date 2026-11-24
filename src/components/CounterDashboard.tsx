import { ClipboardCheck, LogOut, Package } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PhysicalAuditPage } from '@/components/PhysicalAuditPage';

export function CounterDashboard() {
  const { userProfile, signOut } = useAuth();
  const userName = userProfile?.nombre_completo || userProfile?.email || 'Contador';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-indigo-900/10 bg-gradient-to-r from-indigo-800 via-indigo-700 to-indigo-600 text-white shadow-md">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-white/15 p-2">
              <Package className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold sm:text-base">Sistema de Inventario PXG INTERNO</h1>
              <p className="text-xs text-indigo-100">Perfil de contador · {userName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold transition hover:bg-white/20 sm:text-sm"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <section className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4">
          <nav aria-label="Secciones de contador" className="flex flex-wrap gap-2">
            <div
              aria-current="page"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm"
            >
              <ClipboardCheck className="h-4 w-4" />
              Auditoría física
            </div>
          </nav>
        </section>

        <PhysicalAuditPage counterOnly />
      </main>
    </div>
  );
}
