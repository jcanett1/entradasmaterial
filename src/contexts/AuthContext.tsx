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
     SIGN IN — busca en usuarioalmacen por email + password
  ============================================= */
  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    // Buscar usuario activo con ese email
    const { data, error } = await supabase
      .from('usuarioalmacen')
      .select('id, email, nombre_completo, departamento, rol, activo, password')
      .eq('email', email.trim().toLowerCase())
      .eq('activo', true)
      .single();

    if (error || !data) {
      return { error: 'Correo o contraseña incorrectos' };
    }

    // Verificar contraseña — comparamos con la función RPC verify_password
    // Si no existe la función, comparamos directamente (texto plano como fallback)
    let passwordOk = false;

    const { data: verifyData, error: verifyError } = await supabase
      .rpc('verify_user_password', { p_email: email.trim().toLowerCase(), p_password: password });

    if (!verifyError && verifyData === true) {
      passwordOk = true;
    } else {
      // Fallback: comparación directa si la RPC no existe
      passwordOk = data.password === password;
    }

    if (!passwordOk) {
      return { error: 'Correo o contraseña incorrectos' };
    }

    const newSession: AlmacenSession = {
      id: data.id,
      email: data.email,
      nombre_completo: data.nombre_completo,
      rol: data.rol as 'admin' | 'supervisor' | 'operador',
      departamento: data.departamento,
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
