import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/shared/hooks/useAuth';
import { LoginPage } from '@/modules/auth/LoginPage';
import { UIKit } from '@/shared/ui/UIKit';
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

        {/* Chrono */}
        <Route path="/chrono" element={<Protected />} />
        <Route path="/chrono-admin" element={<Protected />} />

        {/* Vector Logic — sub-paths persist the active view across reloads:
            /vector-logic/board/:boardId  → BoardView for that board
            /vector-logic/backlog         → BacklogHistory
            /vector-logic/detections      → AI Detections
            /vector-logic/chat            → Chat
            (root)                        → routes to the user's default board */}
        <Route path="/vector-logic/*" element={<Protected />} />

        {/* Profile */}
        <Route path="/profile" element={<Protected />} />

        {/* Admin */}
        <Route path="/admin" element={<Protected />} />

        {/* UI Kit */}
        <Route path="/ui-kit" element={<ProtectedRoute><UIKit /></ProtectedRoute>} />

        {/* Default */}
        <Route path="/" element={<Navigate to="/jira-tracker/calendar" replace />} />
        <Route path="*" element={<Navigate to="/jira-tracker/calendar" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
