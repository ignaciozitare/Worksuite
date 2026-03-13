import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/shared/hooks/useAuth';
import { LoginPage } from '@/modules/auth/LoginPage';

// Lazy placeholder — will be replaced with real shell in next phase
function AppShell(): JSX.Element {
  const { user, logout } = useAuth();
  return (
    <div style={{ padding: 24, background: '#0d0d10', minHeight: '100vh', color: '#e4e4ef', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4f6ef7', boxShadow: '0 0 10px #4f6ef7' }} />
        <strong style={{ color: '#7b93ff', fontSize: 16 }}>WorkSuite</strong>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8888a8' }}>
          {user?.name} · {user?.role}
        </span>
        <button
          onClick={logout}
          style={{ background: 'transparent', border: '1px solid #2a2a38', borderRadius: 6, color: '#8888a8', padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>
          Logout
        </button>
      </div>
      <div style={{ background: '#141418', border: '1px solid #2a2a38', borderRadius: 12, padding: 24 }}>
        <p style={{ color: '#3ecf8e', fontWeight: 600 }}>✓ Authentication working</p>
        <p style={{ color: '#50506a', fontSize: 12, marginTop: 8 }}>
          Fase 1 complete. The full UI from the prototype will be connected here in Fase 2.
        </p>
        <pre style={{ marginTop: 16, fontSize: 11, color: '#8888a8', background: '#1b1b22', padding: 12, borderRadius: 6 }}>
          {JSON.stringify(user, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: JSX.Element }): JSX.Element {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
}

export function AppRouter(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}
