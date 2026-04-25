// WorkSuite — Root orchestrator (layout + routing)

import React, { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from './shared/lib/api';
import { useTranslation } from '@worksuite/i18n';
import { useAuth } from './shared/hooks/useAuth';
import { useWorkSuiteData, jiraSync } from './shared/hooks/useWorkSuiteData';
import { useWorklogs } from './shared/hooks/useWorklogs';
import { useHotDesk } from './shared/hooks/useHotDesk';
import './WorkSuiteApp.css';

// Module UI — eagerly loaded (always visible)
import { LogWorklogModal } from './modules/jira-tracker/ui';
import { JiraTrackerPage } from './modules/jira-tracker/ui/JiraTrackerPage';
import { ExportConfigModal, exportWithColumns } from './modules/jira-tracker/ui/ExportConfigModal';
import { BlueprintHDMap, HDTableView, HDReserveModal, HDMapView } from './modules/hotdesk/ui';
import { BuildingFloorSelectors } from './shared/admin';
import { NotificationsBell } from './shared/ui/NotificationsBell';
import { WorldClock } from './modules/vector-logic/ui/components/WorldClock';
import { TaskAlarmScheduler } from './modules/vector-logic/ui/TaskAlarmScheduler';
import { UserMenu } from './shared/ui/UserMenu';
import { AppSwitcher } from './shared/ui/AppSwitcher';
import { SupabaseNotificationRepo } from './shared/infra/SupabaseNotificationRepo';
import { SupabaseAdminUserRepo } from './shared/infra/SupabaseAdminUserRepo';
import { supabase as supabaseClient } from './shared/lib/supabaseClient';

const notificationRepo = new SupabaseNotificationRepo(supabaseClient);
const adminUserRepo = new SupabaseAdminUserRepo(supabaseClient);

// Module UI — lazy loaded (per-route)
const AdminShell = lazy(() => import('./shared/admin/AdminShell').then(m => ({ default: m.AdminShell })));
const RetroBoard = lazy(() => import(/* webpackChunkName: "retro" */ './modules/retro/ui/RetroBoard').then(m => ({ default: m.RetroBoard })));
const DeployPlanner = lazy(() => import('./modules/deploy-planner/ui/DeployPlanner').then(m => ({ default: m.DeployPlanner })));
const EnvTracker = lazy(() => import('./modules/environments/ui/EnvironmentsView').then(m => ({ default: m.EnvironmentsView })));
const ChronoPage = lazy(() => import('./modules/chrono').then(m => ({ default: m.ChronoPage })));
const ChronoAdminPage = lazy(() => import('./modules/chrono-admin').then(m => ({ default: m.ChronoAdminPage })));
const ProfilePage = lazy(() => import('./modules/profile').then(m => ({ default: m.ProfilePage })));
const VectorLogicPage = lazy(() => import('./modules/vector-logic').then(m => ({ default: m.VectorLogicPage })));

// Domain
import { CsvService } from './modules/jira-tracker/domain/services/CsvService';
import { TODAY } from './shared/lib/constants';

// ══════════════════════════════════════════════════════════════════

function WorkSuiteApp() {
  const { user: authUser, logout } = useAuth();
  const { t, locale, setLocale } = useTranslation();
  const [theme, setTheme] = useState("dark");

  // Routing
  const location = useLocation();
  const navigate = useNavigate();
  const { view: urlView } = useParams();

  const mod = location.pathname.startsWith('/hotdesk')       ? 'hd'
            : location.pathname.startsWith('/retro')         ? 'retro'
            : location.pathname.startsWith('/deploy')        ? 'deploy'
            : location.pathname.startsWith('/envtracker')    ? 'envtracker'
            : location.pathname.startsWith('/vector-logic')   ? 'vector-logic'
            : location.pathname.startsWith('/chrono-admin')  ? 'chrono-admin'
            : location.pathname.startsWith('/chrono')        ? 'chrono'
            : location.pathname.startsWith('/profile')       ? 'profile'
            : location.pathname.startsWith('/admin')         ? 'admin'
            : 'jt';

  const view = mod === 'admin' ? 'admin'
             : mod === 'retro' ? 'retro'
             : mod === 'deploy' ? 'deploy'
             : mod === 'envtracker' ? 'envtracker'
             : mod === 'vector-logic' ? 'vector-logic'
             : (urlView || 'calendar');

  // Data
  const {
    loadingData,
    worklogs, setWorklogs,
    users, setUsers,
    hd, setHd,
    jiraIssues, setJiraIssues,
    jiraProjects,
  } = useWorkSuiteData(authUser);

  const CURRENT_USER = authUser ? {
    id: authUser.id, name: authUser.name, email: authUser.email,
    avatar: authUser.avatar || (authUser.name || 'U').slice(0, 2).toUpperCase(),
    avatarUrl: authUser.avatarUrl ?? null,
    role: authUser.role, deskType: authUser.desk_type || 'hotdesk',
    active: authUser.active !== false,
    modules: authUser.modules || ["jt", "hd", "retro", "deploy"],
    export_presets: authUser.export_presets || [],
  } : { id: '', name: 'Loading...', email: '', avatar: '..', avatarUrl: null, role: 'user', deskType: 'hotdesk', active: true, modules: ["jt", "hd", "retro", "deploy"], export_presets: [] };

  // Toast
  const [toast, setToast] = useState<any>(null);
  const notify = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); }, []);

  // Jira Tracker state & handlers
  const [activeDay, setActiveDay] = useState(TODAY);
  const [filters, setFilters] = useState({
    from: TODAY.slice(0, 7) + '-01',
    to: TODAY.slice(0, 7) + '-' + new Date(parseInt(TODAY.slice(0, 4)), parseInt(TODAY.slice(5, 7)), 0).getDate().toString().padStart(2, '0'),
    authorId: '', spaceKeys: [], jql: ''
  });
  const [logModal, setLogModal] = useState<any>(null);
  const [sbOpen, setSbOpen] = useState(false);
  const [jiraUserFilter, setJiraUserFilter] = useState("");
  const jiraUsers = [...new Set(jiraIssues.flatMap((i: any) => [i.assignee, i.reporter].filter(Boolean)))].sort() as string[];

  const { openLogModal, handleSaveWorklog, handleDeleteWorklog, handleEditWorklog, loadJiraIssues } = useWorklogs({
    worklogs, setWorklogs, activeDay, currentUser: CURRENT_USER, notify,
  });

  const handleOpenLog = useCallback((opts: any = {}) => {
    setLogModal({ ...openLogModal(opts), editWorklog: opts.editWorklog || null, originalDate: opts.originalDate || null });
  }, [openLogModal]);

  const handleSaveOrEdit = useCallback(async (date: string, wl: any) => {
    if (wl.isEdit && logModal?.originalDate && logModal?.editWorklog?.id) {
      await handleEditWorklog(logModal.originalDate, logModal.editWorklog.id, date, wl);
    } else {
      await handleSaveWorklog(date, wl);
    }
  }, [handleSaveWorklog, handleEditWorklog, logModal]);

  const [exportModal, setExportModal] = useState<any>(null);
  const [exportPresets, setExportPresets] = useState<any[]>(CURRENT_USER?.export_presets ?? []);
  const handleExport = (f: any) => setExportModal(f);
  const handleExportConfirm = (columns: string[], filename: string) => {
    if (!exportModal) return;
    exportWithColumns(worklogs, exportModal.from, exportModal.to, exportModal.authorId || null, exportModal.spaceKeys, columns, filename);
    setExportModal(null);
  };
  const handleDayClick = (d: string) => { setActiveDay(d); navigate('/jira-tracker/day'); };
  const handleLoadJiraIssues = useCallback((pk: string) => loadJiraIssues(pk, setJiraIssues), [loadJiraIssues, setJiraIssues]);

  // Reload issues when Jira user filter changes
  useEffect(() => {
    if (!jiraProjects.length) return;
    const reload = async () => {
      const allIssues: any[] = [];
      for (const p of jiraProjects) {
        try {
          const issues = await jiraSync.loadIssues(p.key, [], jiraUserFilter || undefined);
          allIssues.push(...issues);
        } catch {}
      }
      setJiraIssues(allIssues.map((i: any, idx: number) => ({
        id: idx + 1, key: i.key, summary: i.summary, type: i.type,
        status: i.status, statusCategory: i.statusCategory ?? '', priority: i.priority ?? 'Medium',
        project: i.project, assignee: i.assignee ?? '', reporter: i.reporter ?? '',
        epic: i.epic ?? '—', epicName: i.epicName ?? '—', hours: 0, labels: i.labels ?? [],
      })));
    };
    reload();
  }, [jiraUserFilter, jiraProjects]);

  // HotDesk state & handlers
  const [hdModal, setHdModal] = useState<any>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<any>(null);
  const [selectedBlueprint, setSelectedBlueprint] = useState<any>(null);
  const [hdFloorSeatIds, setHdFloorSeatIds] = useState<string[]>([]);

  const { handleSeatClick, handleConfirm: hdConfirm, handleRelease: hdRelease, handleConfirmPresence: hdConfirmPresence, handleDelegate: hdDelegate } = useHotDesk({
    hd, setHd, currentUser: CURRENT_USER, notify, t,
  });

  const handleHdSeatClick = useCallback((seatId: string, date: string = TODAY) => {
    const result = handleSeatClick(seatId, date);
    if (result) setHdModal(result);
  }, [handleSeatClick]);

  const handleHdConfirm = useCallback(async (seatId: string, dates: string[]) => {
    await hdConfirm(seatId, dates);
    setHdModal(null);
  }, [hdConfirm]);

  const handleHdRelease = useCallback(async (seatId: string, date: string) => {
    await hdRelease(seatId, date);
    setHdModal(null);
  }, [hdRelease]);

  const handleHdConfirmPresence = useCallback(async (seatId: string, date: string) => {
    await hdConfirmPresence(seatId, date);
    setHdModal(null);
  }, [hdConfirmPresence]);

  const handleHdDelegate = useCallback(async (seatId: string, dates: string[], targetUserId: string) => {
    await hdDelegate(seatId, dates, targetUserId);
    setHdModal(null);
  }, [hdDelegate]);

  const handleBuildingFloorChange = useCallback((b: any, fl: any) => {
    setSelectedBuilding(b);
    setSelectedBlueprint(fl);
  }, []);

  // Nav items
  const isAdmin = CURRENT_USER.role === 'admin';
  const jtNavItems = [
    { id: 'calendar', label: t('nav.calendar') },
    { id: 'day', label: t('nav.dayView') },
    { id: 'tasks', label: t('nav.tasks') },
  ];
  const hdNavItems = [
    { id: 'map', label: t('nav.officeMap') },
    { id: 'table', label: t('nav.monthlyView') },
  ];
  const currentNavItems = mod === 'jt' ? jtNavItems : hdNavItems;

  // Loading
  if (loadingData) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--tx3)', fontSize: 13, fontFamily: 'Inter, sans-serif' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ac)', boxShadow: '0 0 12px var(--ac)', margin: '0 auto 12px', animation: 'pulse 1.5s ease infinite' }} />
          {t('common.loading')}
        </div>
      </div>
    );
  }

  if (!authUser) return null;

  // ── Render ──────────────────────────────────────────────────────

  return (
    <>
      <TaskAlarmScheduler currentUser={CURRENT_USER} />
      <div data-theme={theme} style={{ height: "100vh", overflow: "hidden", background: "var(--bg)", color: "var(--tx)" }}>
        <div className="shell">

          {/* ── Top bar ─────────────────────────────────────────── */}
          <header className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <AppSwitcher
                currentMod={mod}
                userModules={CURRENT_USER.modules || ["jt", "hd", "retro", "deploy"]}
                onNavigate={navigate}
              />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ac2)' }}>WorkSuite</span>
              {!window.location.hostname.startsWith('worksuite-phi') && (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: 'var(--ac)',
                  letterSpacing: '0.05em', padding: '2px 6px',
                  borderRadius: 4, background: 'var(--ac-dim)',
                }}>PREVIEW</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                title={theme === "dark" ? t("theme.switchToLight") : t("theme.switchToDark")}
                className="tb-icon-btn"
              >
                <span className="material-symbols-outlined" style={{
                  fontSize: 16, color: 'var(--tx2)',
                  fontVariationSettings: "'wght' 300",
                }}>{theme === "dark" ? "dark_mode" : "light_mode"}</span>
              </button>
              <button
                className="tb-icon-btn"
                onClick={() => setLocale(locale === "en" ? "es" : "en")}
                style={{ padding: '4px 8px' }}
              >
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx2)' }}>{locale.toUpperCase()}</span>
              </button>
              <WorldClock currentUser={CURRENT_USER} />
              <NotificationsBell userId={CURRENT_USER.id} repo={notificationRepo} />
              <UserMenu user={CURRENT_USER} onLogout={logout} />
            </div>
          </header>

          {/* ── Sub-nav (JT uses sidebar nav instead) ─────────── */}
          {mod !== "jt" && mod !== "retro" && mod !== "deploy" && mod !== "envtracker" && mod !== "chrono" && mod !== "chrono-admin" && mod !== "vector-logic" && mod !== "profile" && mod !== "hd" && mod !== "admin" && (
            <nav className="nav-bar">
              {currentNavItems.map(item => (
                <button key={item.id}
                  className={`n-btn ${view === item.id ? (mod === "hd" ? "active-hd" : "active") : ""}`}
                  onClick={() => navigate(`/hotdesk/${item.id}`)}>
                  {item.label}
                </button>
              ))}
              {mod === "hd" && view !== "admin" && (
                <>
                  <div className="n-sep" />
                  <BuildingFloorSelectors selectedBuilding={selectedBuilding} selectedBlueprint={selectedBlueprint} onChange={handleBuildingFloorChange} />
                </>
              )}
            </nav>
          )}

          {/* ── Body ────────────────────────────────────────────── */}
          <div className="body">
            {mod === "jt" && view !== "admin" && (
              <JiraTrackerPage
                view={view}
                filters={filters}
                worklogs={worklogs}
                users={users}
                jiraIssues={jiraIssues}
                jiraProjects={jiraProjects}
                jiraUsers={jiraUsers}
                jiraUserFilter={jiraUserFilter}
                activeDay={activeDay}
                onApplyFilters={f => { setFilters(f); setSbOpen(false); }}
                onExport={handleExport}
                onDayClick={handleDayClick}
                onOpenLog={handleOpenLog}
                onDeleteWorklog={handleDeleteWorklog}
                onDateChange={setActiveDay}
                onProjectChange={handleLoadJiraIssues}
                onJiraUserFilter={setJiraUserFilter}
                onNavigate={v => navigate(`/jira-tracker/${v}`)}
              />
            )}
            {mod === "hd" && (view === "map" || view === "table") && (
              <main className="content" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <HDMapView
                  hd={hd}
                  onSeat={sid => handleHdSeatClick(sid, TODAY)}
                  currentUser={CURRENT_USER}
                  onConfirmPresence={handleHdConfirmPresence}
                  view={view as 'map' | 'table'}
                  onViewChange={v => navigate(`/hotdesk/${v}`)}
                  buildingFloorSelector={<BuildingFloorSelectors selectedBuilding={selectedBuilding} selectedBlueprint={selectedBlueprint} onChange={handleBuildingFloorChange} />}
                  building={selectedBuilding}
                  floorSeatIds={hdFloorSeatIds}
                >
                  {view === 'map' ? (
                    selectedBlueprint
                      ? <BlueprintHDMap hd={hd} onSeat={sid => handleHdSeatClick(sid, TODAY)} currentUser={CURRENT_USER} blueprint={selectedBlueprint} theme={theme} onFloorSeats={setHdFloorSeatIds} />
                      : null
                  ) : (
                    <HDTableView hd={hd} onCell={(sid, date) => handleHdSeatClick(sid, date)} currentUser={CURRENT_USER} blueprint={selectedBlueprint} theme={theme} />
                  )}
                </HDMapView>
              </main>
            )}
            <Suspense fallback={<main className="content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)' }}>Loading…</main>}>
              {mod === "retro" && view !== "admin" && (
                <main className="content" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
                  <RetroBoard currentUser={CURRENT_USER} wsUsers={users} lang={locale} />
                </main>
              )}
              {mod === "deploy" && view !== "admin" && (
                <main className="content" style={{ padding: 0, overflow: "auto" }}>
                  <DeployPlanner currentUser={CURRENT_USER} />
                </main>
              )}
              {mod === "envtracker" && view !== "admin" && (
                <main className="content" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
                  <EnvTracker currentUser={CURRENT_USER} wsUsers={users} />
                </main>
              )}
              {mod === "chrono" && (
                <main className="content" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
                  <ChronoPage currentUser={CURRENT_USER} />
                </main>
              )}
              {mod === "chrono-admin" && (
                <main className="content" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
                  <ChronoAdminPage currentUser={CURRENT_USER} />
                </main>
              )}
              {mod === "vector-logic" && (
                <main className="content" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
                  <VectorLogicPage currentUser={CURRENT_USER} wsUsers={users} />
                </main>
              )}
              {mod === "profile" && (
                <main className="content" style={{ padding: 0, overflow: "auto" }}>
                  <ProfilePage />
                </main>
              )}
              {view === "admin" && <AdminShell users={users} setUsers={setUsers} hd={hd} setHd={setHd} currentUser={CURRENT_USER} theme={theme} />}
            </Suspense>
          </div>
        </div>
      </div>

      {/* ── Modals & Toast ────────────────────────────────────── */}
      {logModal && (
        <LogWorklogModal initialDate={logModal.date} initialIssueKey={logModal.issueKey} editWorklog={logModal.editWorklog} onClose={() => setLogModal(null)} onSave={handleSaveOrEdit} currentUser={CURRENT_USER} jiraIssues={jiraIssues} />
      )}
      {exportModal && (
        <ExportConfigModal
          onClose={() => setExportModal(null)}
          onExport={handleExportConfirm}
          currentUserId={CURRENT_USER?.id ?? ''}
          initialPresets={exportPresets}
          onPresetsChange={setExportPresets}
          adminUserRepo={adminUserRepo}
          dateFrom={exportModal.from}
          dateTo={exportModal.to}
        />
      )}
      {hdModal && (
        <HDReserveModal seatId={hdModal.seatId} initDate={hdModal.date} hd={hd} onConfirm={handleHdConfirm} onRelease={handleHdRelease} onClose={() => setHdModal(null)} currentUser={CURRENT_USER} wsUsers={users} onConfirmPresence={handleHdConfirmPresence} onDelegate={handleHdDelegate} />
      )}
      {toast && (
        <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9999, padding: "11px 18px", borderRadius: "var(--r2)", fontSize: 13, fontWeight: 500, background: "var(--sf)", border: "1px solid var(--bd2)", color: "var(--tx)", boxShadow: "var(--shadow)", animation: "fadeIn .2s ease" }}>
          {toast}
        </div>
      )}
    </>
  );
}

export default WorkSuiteApp;
