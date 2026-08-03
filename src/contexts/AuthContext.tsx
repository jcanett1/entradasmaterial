import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { UsuarioAlmacen } from '@/lib/supabase';

/* =============================================
   TIPOS
============================================= */
interface AuthContextType {
  userProfile: UsuarioAlmacen | null;
  loading: boolean;
  userRol: 'admin' | 'supervisor' | 'operador' | null;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/* =============================================
   PROVIDER
============================================= */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userProfile, setUserProfile] = useState<UsuarioAlmacen | null>(null);
  const [loading, setLoading] = useState(true);

  /* ---- Cargar perfil extendido desde usuarioalmacen ---- */
  const fetchUserProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('usuarioalmacen')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      console.error('Error al cargar perfil de usuario:', error);
      setUserProfile(null);
    } else {
      // Verificar que el usuario esté activo
      if (!data.activo) {
        await supabase.auth.signOut();
        setUserProfile(null);
      } else {
        setUserProfile(data as UsuarioAlmacen);
      }
    }
    setLoading(false);
  };

  /* ---- Escuchar cambios de sesión de Supabase Auth ---- */
  useEffect(() => {
    // Obtener sesión activa al cargar la app
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Suscribirse a cambios (login, logout, refresh de token)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  /* =============================================
     SIGN IN — usa Supabase Auth nativo
  ============================================= */
  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      // Mensajes de error amigables en español
      if (error.message.includes('Invalid login credentials')) {
        return { error: 'Correo o contraseña incorrectos' };
      }
      if (error.message.includes('Email not confirmed')) {
        return { error: 'Debes confirmar tu correo electrónico antes de iniciar sesión' };
      }
      return { error: 'Error al conectar con el servidor. Intenta de nuevo.' };
    }

    return { error: null };
  };

  /* =============================================
     SIGN OUT
  ============================================= */
  const signOut = async () => {
    await supabase.auth.signOut();
    setUserProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        userProfile,
        loading,
        userRol: userProfile?.rol ?? null,
        isAdmin: userProfile?.rol === 'admin',
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
