import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/shared/hooks/useAuth';
import { LoginPage } from '@/modules/auth/LoginPage';
import WorkSuiteApp from './WorkSuiteApp';

function ProtectedRoute({ children }: { children: JSX.Element }): JSX.Element {
  const { token, isLoading } = useAuth();
  if (isLoading) return <div style={{ background: '#0d0d10', minHeight: '100vh' }} />;
  return token ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: JSX.Element }): JSX.Element {
  const { token, isLoading } = useAuth();
  if (isLoading) return <div style={{ background: '#0d0d10', minHeight: '100vh' }} />;
  return token ? <Navigate to="/" replace /> : children;
}

export function AppRouter(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/*" element={<ProtectedRoute><WorkSuiteApp /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
