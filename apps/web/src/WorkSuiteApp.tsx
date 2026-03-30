// @ts-nocheck
// WorkSuite — Fase 2 — Prototype connected to real Supabase + real Jira API

import React, {
  useState, useMemo, useCallback,
  createContext, useContext, useRef, useEffect,
  Component
} from "react";
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { createPortal } from "react-dom";
import { supabase } from './shared/lib/api';
import { useTranslation } from '@worksuite/i18n';
import { RetroBoard, AdminRetroTeams } from './RetroBoard';
import { DeployPlanner } from './modules/deploy-planner';
import EnvTracker, { AdminEnvEnvironments, AdminEnvRepositories, AdminEnvPolicy } from './EnvTracker';
import { useAuth } from './shared/hooks/useAuth';
import './WorkSuiteApp.css';
import { LogWorklogModal, JTFilterSidebar, CalendarView, DayView, TasksView } from './modules/jira-tracker/ui';
import { OfficeSVG, BlueprintMiniMap, SeatTooltip, HDMapView, HDTableView, HDReserveModal, BlueprintHDMap } from './modules/hotdesk/ui';
import { AdminShell } from './shared/admin';
import { TimeParser } from './modules/jira-tracker/domain/services/TimeParser';
import { WorklogService } from './modules/jira-tracker/domain/services/WorklogService';
import { CsvService } from './modules/jira-tracker/domain/services/CsvService';
import { DeskType, SeatStatusEnum as SeatStatus } from './modules/hotdesk/domain/entities/constants';
import { ReservationService } from './modules/hotdesk/domain/services/ReservationService';
import { makeAvatar, isValidEmail, daysInMonth, firstMonday, isoFromYMD, fmtMonthYear } from './shared/lib/utils';
import { PasswordStrength } from './shared/ui/PasswordStrength';
import { MiniCalendar } from './shared/ui/MiniCalendar';
import { TODAY, MONTHS_EN, MONTHS_ES, DAYS_EN, DAYS_ES } from './shared/lib/constants';
import { SEATS } from './modules/hotdesk/domain/entities/seats';
import { MOCK_USERS, MOCK_ISSUES_FALLBACK, MOCK_PROJECTS_FALLBACK, MOCK_WORKLOGS, INITIAL_HD_STATE } from './shared/lib/fallbackData';

// ── API helpers ────────────────────────────────────────────────────────────
const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

// ── Helpers to convert DB rows to UI format ────────────────────────────────

function dbWorklogToUI(row) {
  const seconds = row.seconds ?? 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const time = h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
  return {
    id: row.id,
    issue: row.issue_key,
    summary: row.issue_summary ?? row.issue_key,
    type: row.issue_type ?? 'Task',
    epic: row.epic_key ?? '—',
    epicName: row.epic_name ?? '—',
    project: row.project_key ?? '—',
    author: row.author_name,
    authorId: row.author_id,
    time,
    seconds,
    started: (row.started_at ?? '09:00').slice(0, 5),
    description: row.description ?? '',
    syncedToJira: row.synced_to_jira ?? false,
  };
}

function worklogsArrayToMap(rows) {
  const map = {};
  for (const row of rows) {
    const date = typeof row.date === 'string' ? row.date.slice(0, 10) : row.date;
    if (!map[date]) map[date] = [];
    map[date].push(dbWorklogToUI(row));
  }
  return map;
}


// DOMAIN LAYER — services imported from modules
// ══════════════════════════════════════════════════════════════════

const MODULES = [
  { id:"jt",     label:"Jira Tracker",  color:"var(--ac2)"   },
  { id:"hd",     label:"HotDesk",       color:"var(--green)" },
  { id:"retro",  label:"RetroBoard",    color:"#818cf8"      },
  { id:"deploy", label:"Deploy Planner",color:"#f59e0b"      },
  { id:"envtracker", label:"Environments",  color:"#22d3ee"      },
];

// i18n — Translations now provided by @worksuite/i18n via I18nProvider (see main.tsx)

const _memStore = {};
const StorageAdapter = {
  load()        { return _memStore["state"] ?? null; },
  save(state)   { _memStore["state"] = state; },
};

// Mock data, SEATS, TODAY, MONTHS/DAYS → imported from shared/lib/ and modules/
const MOCK_TODAY = TODAY;

// ══════════════════════════════════════════════════════════════════
// CONTEXT
// ══════════════════════════════════════════════════════════════════

const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

// ══════════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ══════════════════════════════════════════════════════════════════

// MONTHS_EN/ES, DAYS_EN/ES → imported from shared/lib/constants

// buildCalGrid, formatFullDate → moved to jira-tracker/ui/CalendarView and DayView
// LogWorklogModal, JTFilterSidebar, CalendarView, DayView, TasksView → imported from jira-tracker/ui

// ── Remaining inline helpers (used by HotDesk views) ──

function buildCalGrid(year, month) {
  const first = new Date(year,month,1), last = new Date(year,month+1,0);
  const so = (first.getDay()+6)%7, eo = (7-last.getDay())%7;
  const cells = [];
  for (let i = -so; i <= last.getDate()-1+eo; i++) {
    const d = new Date(year,month,1+i);
    cells.push({ date:d.toISOString().slice(0,10), day:d.getDate(), isCurrentMonth:d.getMonth()===month, isToday:d.toISOString().slice(0,10)===MOCK_TODAY });
  }
  return cells;
}

function formatFullDate(iso, lang) {
  const d = new Date(iso+"T00:00:00");
  const ms = lang==="es" ? MONTHS_ES : MONTHS_EN;
  if (lang==="es") {
    const dn = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
    return `${dn[d.getDay()]}, ${d.getDate()} de ${ms[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`;
  }
  const dn = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  return `${dn[d.getDay()]}, ${ms[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// makeAvatar, isValidEmail, daysInMonth, firstMonday, isoFromYMD, fmtMonthYear
// → imported from shared/lib/utils

// PasswordStrength, MiniCalendar → imported from shared/ui/



// ══════════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ══════════════════════════════════════════════════════════════════

function WorkSuiteApp() {
  const { user: authUser, logout } = useAuth();

  const { t, locale, setLocale } = useTranslation();
  const [theme, setTheme] = useState("dark");

  // ── Routing — derive mod/view from URL ────────────────────────
  const location = useLocation();
  const navigate = useNavigate();
  const { view: urlView } = useParams();

  const mod = location.pathname.startsWith('/hotdesk')      ? 'hd'
            : location.pathname.startsWith('/retro')        ? 'retro'
            : location.pathname.startsWith('/deploy')       ? 'deploy'
            : location.pathname.startsWith('/envtracker')   ? 'envtracker'
            : location.pathname.startsWith('/admin')        ? 'admin'
            : 'jt';
  const [loadingData, setLoadingData] = useState(true);
  const [activeDay, setActiveDay] = useState(TODAY);
  const [filters,   setFilters]   = useState({
    from: TODAY.slice(0, 7) + '-01',
    to:   TODAY.slice(0, 7) + '-' + new Date(parseInt(TODAY.slice(0,4)), parseInt(TODAY.slice(5,7)), 0).getDate().toString().padStart(2,'0'),
    authorId: '', spaceKeys: [], jql: ''
  });
  const [worklogs,  setWorklogs]  = useState({});
  const [logModal,  setLogModal]  = useState(null);
  const [hd,        setHd]        = useState({ fixed: {}, reservations: [] });
  const [hdModal,   setHdModal]   = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState(null); // {id, name}
  const [selectedBlueprint, setSelectedBlueprint] = useState(null); // {id, floor_name, layout}
  const [toast,     setToast]     = useState(null);
  const [users,     setUsers]     = useState([]);
  const view = mod === 'admin'      ? 'admin'
             : mod === 'retro'      ? 'retro'
             : mod === 'deploy'     ? 'deploy'
             : mod === 'envtracker' ? 'envtracker'
             : (urlView || 'calendar');
  const [sbOpen,    setSbOpen]    = useState(false);

  // ── Estado de issues y proyectos de Jira ──────────────────────
  const [jiraIssues,   setJiraIssues]   = useState(MOCK_ISSUES_FALLBACK);
  const [jiraProjects, setJiraProjects] = useState(MOCK_PROJECTS_FALLBACK);

  const CURRENT_USER = authUser ? {
    id:       authUser.id,
    name:     authUser.name,
    email:    authUser.email,
    avatar:   authUser.avatar || (authUser.name || 'U').slice(0,2).toUpperCase(),
    role:     authUser.role,
    deskType: authUser.desk_type || 'hotdesk',
    active:   authUser.active !== false,
    modules:  authUser.modules || ["jt","hd","retro","deploy"],
  } : { id: '', name: 'Loading...', email: '', avatar: '..', role: 'user', deskType: 'hotdesk', active: true, modules: ["jt","hd","retro","deploy"] };

  useEffect(() => {
    if (!authUser) { setLoadingData(false); return; }
    let cancelled = false;

    async function loadAll() {
      setLoadingData(true);
      try {
        const [wlRes, usersRes, seatsRes, resRes, fixedRes] = await Promise.all([
          supabase.from('worklogs').select('*').order('date', { ascending: false }),
          supabase.from('users').select('*').order('name'),
          supabase.from('seats').select('*').order('id'),
          supabase.from('seat_reservations').select('*'),
          supabase.from('fixed_assignments').select('*'),
        ]);

        if (cancelled) return;

        if (wlRes.data) setWorklogs(worklogsArrayToMap(wlRes.data));
        if (usersRes.data) setUsers(usersRes.data.map(u => ({
          id: u.id, name: u.name, email: u.email,
          avatar: u.avatar || u.name.slice(0,2).toUpperCase(),
          role: u.role, deskType: u.desk_type, active: u.active,
          modules: u.modules || ["jt","hd","retro","deploy"],
        })));

        const fixed = {};
        (fixedRes.data ?? []).forEach(fa => {
          const source = fa.user_name || fa.user_id || "";
          const resolved = usersRes.data?.find(u => u.id===source)?.name || source;
          fixed[fa.seat_id] = resolved;
        });
        const reservations = (resRes.data ?? []).map(r => ({
          seatId: r.seat_id, date: r.date.slice(0,10),
          userId: r.user_id, userName: r.user_name,
        }));
        setHd({ fixed, reservations });

        if (seatsRes.data?.length) {
          seatsRes.data.forEach(s => {
            const seat = SEATS.find(ss => ss.id === s.id);
            if (seat) { seat.x = s.x; seat.y = s.y; }
          });
        }

        // ── Cargar issues y proyectos reales de Jira ──────────────
        try {
          const authHeaders = await getAuthHeader();
          const headers = { ...authHeaders, 'Content-Type': 'application/json' };

          const projRes = await fetch(`${API_BASE}/jira/projects`, { headers });
          const projJson = await projRes.json();

          if (projJson.ok && projJson.data?.length) {
            if (cancelled) return;
            setJiraProjects(projJson.data.map(p => ({ key: p.key, name: p.name })));

            // Preferir ANDURIL si existe, si no el primero
            const preferred = projJson.data.find(p => p.key === 'ANDURIL') ?? projJson.data[0];
            const issRes = await fetch(`${API_BASE}/jira/issues?project=${preferred.key}`, { headers });
            const issJson = await issRes.json();

            if (issJson.ok && issJson.data?.length && !cancelled) {
              setJiraIssues(issJson.data.map((i, idx) => ({
                id:       idx + 1,
                key:      i.key,
                summary:  i.summary,
                type:     i.type,
                status:   i.status,
                priority: i.priority ?? 'Medium',
                project:  i.project,
                assignee: i.assignee ?? '',
                epic:     i.epic ?? '—',
                epicName: i.epicName ?? '—',
                hours:    0,
                labels:   i.labels ?? [],
              })));
            }
          }
        } catch (jiraErr) {
          // Jira no configurado — mantener fallback, no es error crítico
          console.info('Jira not configured or unreachable:', jiraErr);
        }

      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }

    void loadAll();
    return () => { cancelled = true; };
  }, [authUser?.id]);

  // t() now comes from useTranslation() via I18nProvider

  const activeDayRef = useRef(activeDay);
  useEffect(() => { activeDayRef.current = activeDay; }, [activeDay]);

  const openLogModal = useCallback(({ date, issueKey } = {}) => {
    setLogModal({ date: date || activeDayRef.current, issueKey: issueKey || '' });
  }, []);

  const handleSaveWorklog = useCallback(async (date, wl) => {
    setWorklogs(p => ({ ...p, [date]: [...(p[date] || []), wl] }));
    try {
      const { error } = await supabase.from('worklogs').insert({
        id: wl.id, issue_key: wl.issue, issue_summary: wl.summary,
        issue_type: wl.type, epic_key: wl.epic, epic_name: wl.epicName,
        project_key: wl.project, author_id: CURRENT_USER.id, author_name: CURRENT_USER.name,
        date, started_at: wl.started, seconds: wl.seconds, description: wl.description || '',
      });
      if (error) { console.error('Save worklog error:', error.message); return; }

      // ── Sync automático a Jira ──────────────────────────────────
      try {
        const startedAt = `${date}T${wl.started}:00.000+0000`;
        const headers = { ...await getAuthHeader(), 'Content-Type': 'application/json' };
        const syncRes = await fetch(`${API_BASE}/jira/worklogs/${wl.issue}/sync`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            worklogId:   wl.id,
            seconds:     wl.seconds,
            startedAt,
            description: wl.description || '',
          }),
        });
        const syncJson = await syncRes.json();
        if (syncJson.ok) {
          setWorklogs(p => ({
            ...p,
            [date]: (p[date] || []).map(w =>
              w.id === wl.id ? { ...w, syncedToJira: true } : w
            ),
          }));
          notify('✓ Worklog guardado y sincronizado con Jira');
        } else {
          notify('Worklog guardado (sync Jira: ' + (syncJson.error?.message || 'error') + ')');
        }
      } catch (syncErr) {
        console.error('Jira sync failed:', syncErr);
        notify('Worklog guardado (Jira no disponible)');
      }
    } catch (err) { console.error('Save worklog failed:', err); }
  }, [CURRENT_USER.id, CURRENT_USER.name]);

  const handleDeleteWorklog = useCallback(async (date, id) => {
    setWorklogs(p => {
      const u = (p[date] || []).filter(w => w.id !== id);
      if (!u.length) { const { [date]: _, ...r } = p; return r; }
      return { ...p, [date]: u };
    });
    try {
      const { error } = await supabase.from('worklogs').delete().eq('id', id);
      if (error) console.error('Delete worklog error:', error.message);
    } catch (err) { console.error('Delete worklog failed:', err); }
  }, []);

  const handleExport = f => CsvService.exportWorklogs(worklogs, f.from, f.to, f.authorId || null, f.spaceKeys);
  const handleDayClick = d => { setActiveDay(d); navigate('/jira-tracker/day'); };

  const loadJiraIssues = useCallback(async (projectKey) => {
    try {
      const headers = { ...await getAuthHeader(), 'Content-Type': 'application/json' };
      const res  = await fetch(`${API_BASE}/jira/issues?project=${projectKey}`, { headers });
      const json = await res.json();
      if (json.ok && json.data?.length) {
        setJiraIssues(json.data.map((i, idx) => ({
          id: idx + 1, key: i.key, summary: i.summary, type: i.type,
          status: i.status, priority: i.priority ?? 'Medium', project: i.project,
          assignee: i.assignee ?? '', epic: i.epic ?? '—', epicName: i.epicName ?? '—',
          hours: 0, labels: i.labels ?? [],
        })));
      }
    } catch (e) { console.error('loadJiraIssues failed:', e); }
  }, []);

  const notify = msg => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleHdSeatClick = (seatId, date = TODAY) => {
    const st = ReservationService.statusOf(seatId, date, hd.fixed, hd.reservations);
    if (st === SeatStatus.FIXED) { notify(t('hotdesk.noReserve')); return; }
    const res = ReservationService.resOf(seatId, date, hd.reservations);
    if (st === SeatStatus.OCCUPIED && res?.userId !== CURRENT_USER.id) { notify(t('hotdesk.alreadyOccupied')); return; }
    setHdModal({ seatId, date });
  };

  const handleHdConfirm = async (seatId, dates) => {
    if (!dates.length) return;
    setHd(h => ({
      ...h,
      reservations: [
        ...h.reservations.filter(r => !dates.includes(r.date) || r.seatId !== seatId),
        ...dates.map(d => ({ seatId, date: d, userId: CURRENT_USER.id, userName: CURRENT_USER.name })),
      ],
    }));
    setHdModal(null);
    notify(`✓ ${t('hotdesk.reservedOk')} — ${seatId}`);
    try {
      const rows = dates.map(d => ({
        id: `res-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        seat_id: seatId, user_id: CURRENT_USER.id, user_name: CURRENT_USER.name, date: d,
      }));
      const { error } = await supabase.from('seat_reservations').upsert(rows, { onConflict: 'seat_id,date' });
      if (error) console.error('Reserve error:', error.message);
    } catch (err) { console.error('Reserve failed:', err); }
  };

  const handleHdRelease = async (seatId, date) => {
    setHd(h => ({ ...h, reservations: h.reservations.filter(r => !(r.seatId === seatId && r.date === date)) }));
    setHdModal(null);
    notify(t('hotdesk.releasedOk'));
    try {
      const { error } = await supabase.from('seat_reservations')
        .delete().eq('seat_id', seatId).eq('date', date).eq('user_id', CURRENT_USER.id);
      if (error) console.error('Release error:', error.message);
    } catch (err) { console.error('Release failed:', err); }
  };

  const isAdmin = CURRENT_USER.role === 'admin';
  const jtNavItems = [
    { id: 'calendar', label: t('nav.calendar') },
    { id: 'day',      label: t('nav.dayView')      },
    { id: 'tasks',    label: t('nav.tasks')    },
  ];
  const hdNavItems = [
    { id: 'map',   label: t('nav.officeMap')   },
    { id: 'table', label: t('nav.monthlyView') },
  ];
  const currentNavItems = mod === 'jt' ? jtNavItems : hdNavItems;

  const handleBuildingFloorChange = useCallback((b, fl) => {
    setSelectedBuilding(b);
    setSelectedBlueprint(fl);
  }, []);

  if (loadingData) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0d10', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#50506a', fontSize: 13, fontFamily: 'Inter, sans-serif' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4f6ef7', boxShadow: '0 0 12px #4f6ef7', margin: '0 auto 12px', animation: 'pulse 1.5s ease infinite' }} />
          Loading WorkSuite…
        </div>
      </div>
    );
  }

  // Guard: if somehow rendered without auth, return null so parent can redirect
  if (!authUser) return null;

  return (
    <AppCtx.Provider value={{ locale, theme, jiraIssues, jiraProjects }}>
      {/* CSS loaded via import './WorkSuiteApp.css' */}
      <div data-theme={theme} style={{height:"100vh",overflow:"hidden",background:"var(--bg)",color:"var(--tx)"}}>
      <div className="shell">

        <header className="topbar">
          <div className="logo">
            <div className="logo-dot"/>
            <span style={{color:"var(--ac2)",fontWeight:700}}>Work</span><span style={{color:"var(--tx2)",fontWeight:300}}>Suite</span>
          </div>
          <div className="sw-group mod-group">
            {(CURRENT_USER.modules||["jt","hd","retro"]).includes("jt") && (
              <button className={`sw-btn ${mod==="jt"?"active":""}`} onClick={()=> navigate('/jira-tracker/calendar')}>📋 {t("nav.jiraTracker")}</button>
            )}
            {(CURRENT_USER.modules||["jt","hd","retro"]).includes("hd") && (
              <button className={`sw-btn ${mod==="hd"?"active-green":""}`} onClick={()=> navigate('/hotdesk/map')}>🪑 {t("nav.hotdesk")}</button>
            )}
            {(CURRENT_USER.modules||["jt","hd","retro","deploy"]).includes("retro") && (
              <button className={`sw-btn ${mod==="retro"?"active-retro":""}`} onClick={()=> navigate('/retro')}>🔁 RetroBoard</button>
            )}
            {(CURRENT_USER.modules||["jt","hd","retro","deploy"]).includes("deploy") && (
              <button className={`sw-btn ${mod==="deploy"?"active-deploy":""}`} onClick={()=> navigate('/deploy')}>🚀 Deploy Planner</button>
            )}
          </div>
          <div className="top-right">
            <div className="sw-group">
              <button className={`sw-btn ${theme==="dark"?"active-theme":""}`} onClick={()=>setTheme("dark")}>🌙</button>
              <button className={`sw-btn ${theme==="light"?"active-theme":""}`} onClick={()=>setTheme("light")}>☀️</button>
            </div>
            <div className="sw-group">
              <button className={`sw-btn ${locale==="en"?"active":""}`} onClick={()=>setLocale("en")}>EN</button>
              <button className={`sw-btn ${locale==="es"?"active":""}`} onClick={()=>setLocale("es")}>ES</button>
            </div>
            <div className="o-dot"/>
            <div className="avatar">{CURRENT_USER.avatar}</div>
            <span className="u-name">{CURRENT_USER.name}</span>
            <span className={`r-tag ${CURRENT_USER.role==="admin"?"r-admin":"r-user"}`}>{CURRENT_USER.role==="admin"?t("admin.roleAdmin"):t("admin.roleUser")}</span>
            <button onClick={()=> navigate('/admin')}
                style={{
                  background: view==="admin" ? "var(--ac)" : "rgba(79,110,247,.15)",
                  border: `1px solid ${view==="admin" ? "var(--ac)" : "rgba(79,110,247,.4)"}`,
                  borderRadius: "var(--r)",
                  color: view==="admin" ? "#fff" : "var(--ac2)",
                  fontSize: 11, fontWeight: 700, padding: "5px 12px",
                  cursor: "pointer", transition: "var(--ease)",
                  display: "flex", alignItems: "center", gap: 6,
                  boxShadow: view==="admin" ? "0 0 10px rgba(79,110,247,.3)" : "none",
                }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                {isAdmin ? 'Admin' : 'Config'}
              </button>
            <button onClick={logout} style={{background:"transparent",border:"1px solid var(--bd)",borderRadius:"var(--r)",color:"var(--tx3)",fontSize:10,padding:"3px 8px",cursor:"pointer",fontWeight:600}}>
              Logout
            </button>
          </div>
        </header>

        {mod !== "retro" && mod !== "deploy" && <nav className="nav-bar">
          {currentNavItems.map(item=>(
            <button key={item.id}
              className={`n-btn ${view===item.id?(mod==="hd"?"active-hd":"active"):""}`}
              onClick={()=> navigate(mod==='jt' ? `/jira-tracker/${item.id}` : `/hotdesk/${item.id}`)}>
              {item.label}
            </button>
          ))}
          {mod==="hd" && view!=="admin" && (
            <>
              <div className="n-sep"/>
              <BuildingFloorSelectors
                selectedBuilding={selectedBuilding}
                selectedBlueprint={selectedBlueprint}
                onChange={handleBuildingFloorChange}
              />
            </>
          )}

        </nav>}

        <div className="body">
          {mod==="jt" && view!=="admin" && (
            <JTFilterSidebar filters={filters} onApply={f=>{setFilters(f);setSbOpen(false);}} onExport={handleExport} mobileOpen={sbOpen} onMobileClose={()=>setSbOpen(false)} users={users} onProjectChange={loadJiraIssues} jiraProjects={jiraProjects}/>
          )}
          {mod==="jt" && view==="calendar" && (<main className="content"><CalendarView filters={filters} worklogs={worklogs} onDayClick={handleDayClick} onOpenLog={openLogModal}/></main>)}
          {mod==="jt" && view==="day"      && (<main className="content"><DayView date={activeDay} filters={filters} worklogs={worklogs} onDateChange={setActiveDay} onOpenLog={openLogModal} onDeleteWorklog={handleDeleteWorklog}/></main>)}
          {mod==="jt" && view==="tasks"    && (<main className="content"><TasksView filters={filters} onOpenLog={openLogModal} worklogs={worklogs} jiraIssues={jiraIssues} jiraProjects={jiraProjects}/></main>)}
          {mod==="hd" && view==="map"      && (
            <main className="content">
              {selectedBlueprint
                ? <BlueprintHDMap hd={hd} onSeat={sid=>handleHdSeatClick(sid,TODAY)} currentUser={CURRENT_USER} blueprint={selectedBlueprint} theme={theme}/>
                : <div style={{padding:32,textAlign:'center',color:'var(--tx3)',fontSize:13}}>Select a building and floor above to see the map</div>
              }
            </main>
          )}
          {mod==="hd" && view==="table"    && (
            <main className="content">
              <HDTableView hd={hd} onCell={(sid,date)=>handleHdSeatClick(sid,date)} currentUser={CURRENT_USER} blueprint={selectedBlueprint} theme={theme}/>
            </main>
          )}
          {mod==="retro" && view!=="admin" && (
            <main className="content" style={{padding:0,overflow:"hidden",display:"flex",flexDirection:"column",height:"100%"}}>
              <RetroBoard currentUser={CURRENT_USER} wsUsers={users} lang={locale}/>
            </main>
          )}
          {mod==="deploy" && view!=="admin" && (
            <main className="content" style={{padding:0,overflow:"auto"}}>
              <DeployPlanner currentUser={CURRENT_USER}/>
            </main>
          )}
          {mod==="envtracker" && view!=="admin" && (
            <main className="content" style={{padding:0,overflow:"hidden",display:"flex",flexDirection:"column",height:"100%"}}>
              <EnvTracker supabase={supabase} currentUser={CURRENT_USER} wsUsers={users}/>
            </main>
          )}
          {view==="admin" && (<AdminShell users={users} setUsers={setUsers} hd={hd} setHd={setHd} currentUser={CURRENT_USER} theme={theme}/>)}
        </div>
      </div>
      </div>

      {logModal && (
        <LogWorklogModal initialDate={logModal.date} initialIssueKey={logModal.issueKey} onClose={()=>setLogModal(null)} onSave={handleSaveWorklog} currentUser={CURRENT_USER} jiraIssues={jiraIssues}/>
      )}
      {hdModal && (
        <HDReserveModal seatId={hdModal.seatId} initDate={hdModal.date} hd={hd} onConfirm={handleHdConfirm} onRelease={handleHdRelease} onClose={()=>setHdModal(null)} currentUser={CURRENT_USER}/>
      )}
      {toast && (
        <div style={{position:"fixed",bottom:20,right:20,zIndex:9999,padding:"11px 18px",borderRadius:"var(--r2)",fontSize:13,fontWeight:500,background:"var(--sf)",border:"1px solid var(--bd2)",color:"var(--tx)",boxShadow:"var(--shadow)",animation:"fadeIn .2s ease"}}>
          {toast}
        </div>
      )}
    </AppCtx.Provider>
  );
}

export default WorkSuiteApp;
