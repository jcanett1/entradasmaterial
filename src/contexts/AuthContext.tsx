import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, getLocalSession, setLocalSession, clearLocalSession } from '@/lib/supabase';
import type { AlmacenSession } from '@/lib/supabase';

/* =============================================
   TIPOS
============================================= */
interface AuthContextType {
  session: AlmacenSession | null;
  loading: boolean;
  userRol: 'admin' | 'supervisor' | 'operador' | null;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/* =============================================
   PROVIDER
============================================= */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AlmacenSession | null>(null);
  const [loading, setLoading] = useState(true);

  /* ---- Restaurar sesión desde localStorage ---- */
  useEffect(() => {
    const saved = getLocalSession();
    if (saved) setSession(saved);
    setLoading(false);
  }, []);

  /* =============================================
     SIGN IN
     Usa .limit(1) en lugar de .single() para evitar
     el error 406 cuando no hay resultados.
  ============================================= */
  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const emailNorm = email.trim().toLowerCase();

    // Buscar usuario por email — usamos limit(1) para evitar error 406
    const { data, error: fetchError } = await supabase
      .from('usuarioalmacen')
      .select('id, email, nombre_completo, departamento, rol, activo, password')
      .eq('email', emailNorm)
      .limit(1);

    // Error de red o de Supabase
    if (fetchError) {
      console.error('Supabase fetch error:', fetchError);
      return { error: 'Error al conectar con el servidor. Intenta de nuevo.' };
    }

    // Sin resultados — usuario no existe
    if (!data || data.length === 0) {
      return { error: 'Correo o contraseña incorrectos' };
    }

    const user = data[0];

    // Usuario inactivo
    if (!user.activo) {
      return { error: 'Tu cuenta está desactivada. Contacta al administrador.' };
    }

    // Verificar contraseña
    if (user.password !== password) {
      return { error: 'Correo o contraseña incorrectos' };
    }

    // Login exitoso — guardar sesión
    const newSession: AlmacenSession = {
      id: user.id,
      email: user.email,
      nombre_completo: user.nombre_completo,
      rol: user.rol as 'admin' | 'supervisor' | 'operador',
      departamento: user.departamento,
    };

    setLocalSession(newSession);
    setSession(newSession);
    return { error: null };
  };

  /* =============================================
     SIGN OUT
  ============================================= */
  const signOut = () => {
    clearLocalSession();
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        userRol: session?.rol ?? null,
        isAdmin: session?.rol === 'admin',
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/* =============================================
   HOOK
============================================= */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
