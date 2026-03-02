import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Package, Mail, Lock, LogIn, AlertCircle, Eye, EyeOff } from 'lucide-react';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    } catch (err: any) {
      setError(err.message || 'Ha ocurrido un error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #f8fafc 50%, #ede9fe 100%)' }}
    >
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Banner superior */}
          <div
            className="px-8 py-8 flex flex-col items-center"
            style={{ background: 'linear-gradient(135deg, #3730a3 0%, #4f46e5 60%, #6366f1 100%)' }}
          >
            <div className="bg-white/20 p-4 rounded-2xl mb-4 backdrop-blur">
              <Package className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-wide">Sistema de Inventario</h1>
            <p className="text-indigo-200 mt-1 text-sm">Inicia sesión para continuar</p>
          </div>

          {/* Formulario */}
          <div className="px-8 py-8">
            {error && (
              <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-gray-50 transition-all"
                    placeholder="usuario@empresa.com"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-gray-50 transition-all"
                    placeholder="••••••••"
                    required
                    minLength={4}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl font-semibold text-white text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shadow-md mt-2"
                style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', boxShadow: '0 4px 14px 0 rgba(79,70,229,0.35)' }}
              >
                {loading ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    Iniciar sesión
                  </>
                )}
              </button>
            </form>

            <p className="text-center text-xs text-gray-400 mt-6">
              ¿No tienes acceso? Contacta al administrador del sistema.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
