import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/shared/hooks/useAuth';
import { LoginPage } from '@/modules/auth/LoginPage';
import WorkSuiteApp from './WorkSuiteApp';

function ProtectedRoute({ children }: { children: JSX.Element }): JSX.Element {
  const { token, isLoading } = useAuth();
  if (isLoading) return <div style={{ background: 'var(--bg, #0d0d10)', minHeight: '100vh' }} />;
  return token ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: JSX.Element }): JSX.Element {
  const { token, isLoading } = useAuth();
  if (isLoading) return <div style={{ background: 'var(--bg, #0d0d10)', minHeight: '100vh' }} />;
  return token ? <Navigate to="/jira-tracker/calendar" replace /> : children;
}

function Protected(): JSX.Element {
  return <ProtectedRoute><WorkSuiteApp /></ProtectedRoute>;
}

export function AppRouter(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

        {/* Jira Tracker */}
        <Route path="/jira-tracker/:view" element={<Protected />} />
        <Route path="/jira-tracker" element={<Navigate to="/jira-tracker/calendar" replace />} />

        {/* HotDesk */}
        <Route path="/hotdesk/:view" element={<Protected />} />
        <Route path="/hotdesk" element={<Navigate to="/hotdesk/map" replace />} />

        {/* RetroBoard */}
        <Route path="/retro" element={<Protected />} />

        {/* Deploy Planner */}
        <Route path="/deploy" element={<Protected />} />

        {/* Env Tracker */}
        <Route path="/envtracker" element={<Protected />} />

        {/* Admin */}
        <Route path="/admin" element={<Protected />} />

        {/* Default */}
        <Route path="/" element={<Navigate to="/jira-tracker/calendar" replace />} />
        <Route path="*" element={<Navigate to="/jira-tracker/calendar" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
