import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Login } from '@/components/Login';
import { Dashboard } from '@/components/Dashboard';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <Loader2 className="h-12 w-12 text-indigo-600 animate-spin" />
          <p className="mt-4 text-gray-500">Cargando...</p>
        </div>
      </div>
    );
  }

  return user ? <Dashboard /> : <Login />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
