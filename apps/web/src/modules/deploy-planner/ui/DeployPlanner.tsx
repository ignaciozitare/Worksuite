// Deploy Planner — root view. Routes between Planning / Timeline / History /
// Metrics and delegates heavy rendering to small components under ./internal/.
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { extractReposFromTickets } from '@worksuite/jira-service';
import { RepoGroupService, type LinkedGroup } from '../domain/services/RepoGroupService';
import { SubtaskService, type ClassifiedSubtask } from '../domain/services/SubtaskService';
import type { SubtaskConfig } from '../domain/ports/SubtaskConfigPort';
import type { JiraSubtask } from '../domain/ports/SubtaskPort';
import type { JiraIssueRow } from '@/shared/domain/ports/JiraApiPort';
import {
  jiraApi, subtaskAdapter, subtaskConfigRepo,
  deployConfigRepo, releaseRawRepo,
} from '../container';
import { today, fmt, addD } from './internal/helpers';
import { Metrics } from './internal/Metrics';
import { History } from './internal/History';
import { Timeline } from './internal/Timeline';
import { ReleaseCard } from './internal/ReleaseCard';
import { ReleaseDetail } from './internal/ReleaseDetail';
import { DeployPlannerIcon } from './internal/atoms';
import { TaskSidebar } from './internal/TaskSidebar';
import type { Release, DpTicket, StatusCfg, StatusCfgEntry, DragState, VersionCfg, RepoGroupView } from './internal/types';

/* ─── Sidebar nav config ─────────────────────────────────────── */
const TAB_ICONS: Record<string, string> = {
  planning: 'event_note',
  timeline: 'timeline',
  history:  'history',
  metrics:  'analytics',
};

/* ─── CSS ────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap');
.dp *{box-sizing:border-box;margin:0;padding:0;}
.dp{font-family:'Inter',system-ui,-apple-system,sans-serif;background:var(--dp-bg,#131313);color:var(--dp-tx,#e5e2e1);height:100%;overflow:auto;}
.dp button,.dp select,.dp input,.dp textarea{font-family:'Inter',system-ui,-apple-system,sans-serif;}
.dp input[type=date]::-webkit-calendar-picker-indicator{filter:var(--dp-date-filter,invert(.4) sepia(1) hue-rotate(180deg));}
.dp ::-webkit-scrollbar{width:4px;height:4px;}
.dp ::-webkit-scrollbar-track{background:var(--dp-bg,#131313);}
.dp ::-webkit-scrollbar-thumb{background:#424754;border-radius:2px;}
.dp select option{background:var(--dp-sf,#1c1b1b);}
.dp .material-symbols-outlined{font-family:'Material Symbols Outlined';font-weight:300;font-style:normal;display:inline-block;line-height:1;text-transform:none;letter-spacing:normal;word-wrap:normal;white-space:nowrap;direction:ltr;-webkit-font-smoothing:antialiased;font-size:inherit;}
/* Dark (default) — Stitch / Carbon Logic */
.dp{
  --dp-bg:#131313; --dp-sf:#1c1b1b; --dp-sf2:#201f1f; --dp-sf3:#2a2a2a;
  --dp-tx:#e5e2e1; --dp-tx2:#c2c6d6; --dp-tx3:#8c909f;
  --dp-bd:#424754; --dp-date-filter:invert(.4) sepia(1) hue-rotate(180deg);
  --dp-primary:#adc6ff; --dp-primary-strong:#4d8eff;
  --dp-secondary:#4ae176; --dp-secondary-strong:#00b954;
  --dp-tertiary:#ddb7ff; --dp-tertiary-strong:#b76dff;
  --dp-danger:#ffb4ab; --dp-danger-strong:#ef4444;
  --dp-warning:#f59e0b;
}
/* Light mode — activated by data-theme="light" or .light class */
[data-theme="light"] .dp, .light .dp, .dp.light{
  --dp-bg:#f1f5f9; --dp-sf:#ffffff; --dp-sf2:#f8fafc; --dp-sf3:#e2e8f0;
  --dp-tx:#0f172a; --dp-tx2:#475569; --dp-tx3:#64748b;
  --dp-bd:#e2e8f0; --dp-date-filter:none;
  --dp-primary:#4d8eff; --dp-primary-strong:#2563eb;
}
[data-theme="light"] .dp ::-webkit-scrollbar-thumb, .light .dp ::-webkit-scrollbar-thumb, .dp.light ::-webkit-scrollbar-thumb{background:#cbd5e1;}
[data-theme="light"] .dp select option, .light .dp select option, .dp.light select option{background:#ffffff;}
/* Glass card utility */
.dp .glass-card{background:rgba(42,42,42,.6);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(66,71,84,.15);border-radius:8px;}
.dp .glass-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(173,198,255,.2),transparent);border-radius:8px 8px 0 0;}
.dp .ghost-border-top{position:relative;}
.dp .ghost-border-top::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(173,198,255,.2),transparent);border-radius:8px 8px 0 0;}
/* Sidebar */
/* Sidebar — sits inside the module container, not fixed to viewport */
.dp .dp-sidebar{position:sticky;top:0;width:240px;min-width:240px;height:100%;min-height:calc(100vh - 52px);align-self:stretch;background:rgba(14,14,14,.6);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-right:1px solid rgba(255,255,255,.05);box-shadow:0 0 60px rgba(77,142,255,.04);display:flex;flex-direction:column;padding:16px;gap:4px;z-index:30;overflow-y:auto;}
.dp .dp-sidebar-nav-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;font-size:13px;font-weight:500;letter-spacing:.02em;cursor:pointer;border:none;background:transparent;color:var(--dp-tx,#e5e2e1);opacity:.6;transition:all .2s;text-align:left;width:100%;font-family:inherit;}
.dp .dp-sidebar-nav-item:hover{opacity:1;background:var(--dp-sf,#1c1b1b);transform:translateX(2px);}
.dp .dp-sidebar-nav-item.active{opacity:1;color:#4d8eff;background:rgba(77,142,255,.1);font-weight:600;box-shadow:0 0 20px rgba(77,142,255,.1);}
.dp .dp-main{flex:1;min-width:0;height:100%;overflow:auto;}
@keyframes slideIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.anim-in{animation:slideIn .2s ease forwards;}
.fade-in{animation:fadeIn .15s ease;}
@keyframes spin{to{transform:rotate(360deg)}}
.spin{display:inline-block;animation:spin .8s linear infinite;}
`;

/* ─── Infra wiring moved to ../container.ts ──────────────────── */

/* ─── JIRA SYNC ──────────────────────────────────────────────── */
async function jiraTransition(
  issueKey: string,
  appStatus: string,
): Promise<{ ok: boolean; error?: string }> {
  // Map app status → Jira status name
  const statusMap: Record<string, string> = {
    in_progress: 'In Progress',
    in_review:   'In Review',
    done:        'Done',
    merged:      'Merged',
  };
  const targetName = statusMap[appStatus];
  if (!targetName) return { ok: false, error: 'Unknown status' };
  return jiraApi.transitionIssue(issueKey, targetName);
}

/* ─── Props ───────────────────────────────────────────────────── */
interface DeployPlannerProps {
  currentUser: { id: string };
}

type TabId = 'planning' | 'timeline' | 'history' | 'metrics';

interface TabDef {
  id: TabId;
  label: string;
  badge?: number;
}

/* ─── ROOT ───────────────────────────────────────────────────── */
export function DeployPlanner({ currentUser }: DeployPlannerProps) {
  const [tab, setTab] = useState<TabId>('planning');
  const [detail, setDetail] = useState<string | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [tickets, setTickets] = useState<DpTicket[]>([]);
  const [statusCfg, setStatusCfg] = useState<StatusCfg>({});
  const [repoGroups, setRepoGroups] = useState<RepoGroupView[]>([]);
  const [versionCfg, setVersionCfg] = useState<VersionCfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingJira, setFetchingJira] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [jiraBaseUrl, setJiraBaseUrl] = useState('');
  const [classifiedSubs, setClassifiedSubs] = useState<ClassifiedSubtask[]>([]);

  // Task sidebar collapse state — persisted in localStorage
  const [taskSidebarCollapsed, setTaskSidebarCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('dp-task-sidebar-collapsed') === 'true'; }
    catch { return false; }
  });
  const toggleTaskSidebar = useCallback(() => {
    setTaskSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('dp-task-sidebar-collapsed', String(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  // Light mode — read from html element class, watch for changes
  const [isLight, setIsLight] = useState(document.documentElement.classList.contains('light'));
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsLight(document.documentElement.classList.contains('light'));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => { void load(); }, []);

  async function load(): Promise<void> {
    setLoading(true);
    const [rels, statuses, deployJiraStatuses, groups, verCfg] = await Promise.all([
      releaseRawRepo.listRaw(),
      deployConfigRepo.findAllStatuses(),
      deployConfigRepo.getJiraDeployStatuses(),
      deployConfigRepo.findAllRepoGroups(),
      deployConfigRepo.getVersionConfig(),
    ]);
    setRepoGroups((groups ?? []).map(g => ({ id: g.id, name: g.name, repos: g.repos ?? [] })));
    setVersionCfg(
      verCfg
        ? { prefix: verCfg.prefix ?? 'v', segments: verCfg.segments ?? [], separator: verCfg.separator ?? '.' }
        : { prefix: 'v', segments: [{ name: 'major', value: 1 }, { name: 'minor', value: 0 }, { name: 'patch', value: 0 }], separator: '.' },
    );
    setReleases(rels ?? []);
    const cfg: StatusCfg = {};
    (statuses ?? []).forEach(s => {
      cfg[s.name] = {
        color: s.color,
        bg_color: s.bg_color,
        border: s.border,
        is_final: s.is_final,
        status_category: s.status_category ?? 'backlog',
        ord: s.ord,
      };
    });
    if (Object.keys(cfg).length === 0) {
      cfg['Planned']          = { color: '#6b7280', bg_color: 'rgba(107,114,128,.12)', border: '#1f2937', is_final: false, status_category: 'backlog' };
      cfg['Staging']          = { color: '#f59e0b', bg_color: 'rgba(245,158,11,.12)',  border: '#78350f', is_final: false, status_category: 'in_progress' };
      cfg['Merged to master'] = { color: '#a78bfa', bg_color: 'rgba(167,139,250,.12)', border: '#4c1d95', is_final: false, status_category: 'done' };
      cfg['Deployed']         = { color: '#34d399', bg_color: 'rgba(52,211,153,.12)',  border: '#064e3b', is_final: true,  status_category: 'approved' };
      cfg['Rollback']         = { color: '#f87171', bg_color: 'rgba(248,113,113,.12)', border: '#7f1d1d', is_final: true,  status_category: 'done' };
    }
    setStatusCfg(cfg);
    setLoading(false);
    // Load Jira connection + tickets in parallel
    void fetchJiraTickets(deployJiraStatuses, {
      prefix: verCfg?.prefix ?? 'v',
      segments: verCfg?.segments ?? [],
      separator: verCfg?.separator ?? '.',
      // Omit repo_jira_field when undefined so we stay compatible with
      // exactOptionalPropertyTypes.
      ...(verCfg?.repo_jira_field && { repo_jira_field: verCfg.repo_jira_field }),
    });
  }

  async function fetchJiraTickets(
    rawStatuses?: string,
    cfgOverride?: VersionCfg & { repo_jira_field?: string },
  ): Promise<void> {
    const cfg = cfgOverride ?? (versionCfg ? { ...versionCfg, repo_jira_field: undefined } : undefined);
    setFetchingJira(true);
    try {
      // Si no hay args (refresh manual), leer de DB
      let statusFilter = rawStatuses;
      if (statusFilter === undefined) {
        statusFilter = await deployConfigRepo.getJiraDeployStatuses();
      }
      const targetStatuses = (statusFilter || 'Ready to Production')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

      // Paso 1: obtener proyectos + conexión Jira en paralelo
      const [projectRows, connection] = await Promise.all([
        jiraApi.listProjects(),
        jiraApi.getConnection(),
      ]);
      const projects = projectRows
        .map(p => p.key ?? (p as { id?: string }).id)
        .filter((k): k is string => Boolean(k));
      // Set Jira base URL from connection
      if (connection?.base_url) setJiraBaseUrl(connection.base_url.replace(/\/$/, ''));

      if (projects.length === 0) throw new Error('No hay proyectos Jira configurados');

      // Paso 2: cargar issues de cada proyecto con el campo repo configurado
      const repoFieldName = cfg?.repo_jira_field || 'components';
      const extraFields = repoFieldName !== 'components' ? repoFieldName : undefined;
      const allIssues: JiraIssueRow[] = [];
      await Promise.all(
        projects.map(async project => {
          try {
            const issues = await jiraApi.listIssues(project, extraFields);
            allIssues.push(...issues);
          } catch {
            /* proyecto sin acceso, ignorar */
          }
        }),
      );

      // Paso 3: filtrar por los estados configurados en Admin → Deploy Planner
      const filtered = allIssues.filter(i => {
        const fields = (i.fields ?? {}) as { status?: { name?: string } };
        const issueStatus = ((i.status as string | undefined) ?? fields.status?.name ?? '').toLowerCase();
        return targetStatuses.some(s => issueStatus.includes(s) || s.includes(issueStatus));
      });

      const newTickets: DpTicket[] = filtered.map(i => {
        const fields = (i.fields ?? {}) as {
          summary?: string;
          assignee?: { displayName?: string };
          priority?: { name?: string };
          issuetype?: { name?: string };
          status?: { name?: string };
        };
        // Use shared extraction util (handles array/string/object shapes + comma-split).
        // `extractReposFromTickets` accepts raw issues; we also fall back to `components`
        // to preserve the legacy behaviour of this view.
        let repos = extractReposFromTickets([i], repoFieldName);
        if (repos.length === 0 && repoFieldName !== 'components') {
          repos = extractReposFromTickets([i], 'components');
        }
        return {
          key:      (i.key as string) || (i.id as string) || '',
          summary:  (i.summary as string | undefined) ?? fields.summary ?? '',
          assignee: (i.assignee as string | undefined) ?? fields.assignee?.displayName ?? '—',
          priority: (i.priority as string | undefined) ?? fields.priority?.name ?? 'Medium',
          type:     (i.type as string | undefined)     ?? fields.issuetype?.name ?? 'Task',
          status:   (i.status as string | undefined)   ?? fields.status?.name ?? '',
          repos,
        };
      });

      setTickets(newTickets);

      if (newTickets.length === 0) {
        console.warn(`Jira: ${allIssues.length} issues cargados de ${projects.length} proyectos, ninguno coincide con estados: "${statusFilter}"`);
      }

      // Load subtask config + subtasks for all tickets
      try {
        const stConfigs: SubtaskConfig[] = await subtaskConfigRepo.findAll();
        if (stConfigs.length > 0 && newTickets.length > 0) {
          const parentKeys = newTickets.map(t => t.key);
          const rawSubs: JiraSubtask[] = await subtaskAdapter.getSubtasks(parentKeys);
          setClassifiedSubs(SubtaskService.classify(rawSubs, stConfigs));
        }
      } catch (e) {
        console.warn('Subtask load error:', (e as Error).message);
      }
    } catch (e) {
      console.warn('Jira fetch error:', (e as Error).message);
    }
    setFetchingJira(false);
  }

  const upd = async (id: string, patch: Partial<Release>): Promise<void> => {
    setReleases(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)));
    await releaseRawRepo.updateRaw(id, patch);
  };

  const addRelease = async (): Promise<void> => {
    const last = releases[releases.length - 1];
    const firstStatus = Object.keys(statusCfg)[0] ?? 'Planned';
    const baseDate = last?.end_date ?? fmt(today);
    const newRel: Partial<Release> = {
      release_number:  '',
      description:     '',
      status:          firstStatus,
      start_date:      last ? addD(baseDate, 2) : fmt(today),
      end_date:        last ? addD(baseDate, 7) : addD(fmt(today), 5),
      ticket_ids:      [],
      ticket_statuses: {},
      created_by:      currentUser.id,
    };
    const data = await releaseRawRepo.insertRaw(newRel);
    if (data) setReleases(rs => [...rs, data]);
  };

  const delRelease = async (id: string): Promise<void> => {
    if (!confirm('¿Eliminar esta release?')) return;
    setReleases(rs => rs.filter(r => r.id !== id));
    await releaseRawRepo.deleteRaw(id);
  };

  const handleDrop = (targetId: string): void => {
    if (!drag || drag.fromId === targetId) return;
    // If dragged from sidebar, only add to target (no removal needed)
    if (drag.fromId === '__sidebar__') {
      const toRel = releases.find(r => r.id === targetId);
      if (toRel && !(toRel.ticket_ids ?? []).includes(drag.key)) {
        void upd(targetId, { ticket_ids: [...(toRel.ticket_ids ?? []), drag.key] });
      }
      setDrag(null);
      return;
    }
    const fromRel = releases.find(r => r.id === drag.fromId);
    if (!fromRel) return;
    void upd(drag.fromId, { ticket_ids: (fromRel.ticket_ids ?? []).filter(x => x !== drag.key) });
    const toRel = releases.find(r => r.id === targetId);
    if (toRel && !(toRel.ticket_ids ?? []).includes(drag.key)) {
      void upd(targetId, { ticket_ids: [...(toRel.ticket_ids ?? []), drag.key] });
    }
    setDrag(null);
  };

  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const activeF = filterStatus.length === 0;
  const filteredRels = releases.filter(r => activeF || filterStatus.includes(r.status));
  const hidden = releases.filter(r => !activeF && !filterStatus.includes(r.status)).length;

  // Compute linked groups for visual grouping + is_final blocking
  const getCat = (status: string): StatusCfgEntry['status_category'] =>
    statusCfg[status]?.status_category ?? 'backlog';
  const linkedGroups: LinkedGroup[] = RepoGroupService.findLinkedGroups(
    repoGroups,
    releases.map(r => ({
      id:             r.id,
      ticketIds:      r.ticket_ids ?? [],
      status:         r.status || 'Planned',
      statusCategory: getCat(r.status || 'Planned') ?? 'backlog',
    })),
    tickets.map(t => ({ key: t.key, repos: t.repos ?? [] })),
  );

  // Order visible: group members together
  const visible = ((): Release[] => {
    if (!linkedGroups.length) return filteredRels;
    const ordered: Release[] = [];
    const used = new Set<string>();
    linkedGroups.forEach(lg => {
      const members = filteredRels.filter(r => lg.releaseIds.includes(r.id));
      members.forEach(r => {
        if (!used.has(r.id)) { ordered.push(r); used.add(r.id); }
      });
    });
    filteredRels.forEach(r => { if (!used.has(r.id)) ordered.push(r); });
    return ordered;
  })();

  const planningBadge = releases.filter(r => !statusCfg[r.status]?.is_final).length;
  const historyBadge  = releases.filter(r => statusCfg[r.status]?.is_final).length;
  const TABS: TabDef[] = [
    { id: 'planning', label: 'Planning', ...(planningBadge > 0 && { badge: planningBadge }) },
    { id: 'timeline', label: 'Timeline' },
    { id: 'history',  label: 'History',  ...(historyBadge  > 0 && { badge: historyBadge  }) },
    { id: 'metrics',  label: 'Metrics' },
  ];

  const detailRel = detail ? releases.find(r => r.id === detail) ?? null : null;
  const allReleaseNumbers = releases.map(r => r.release_number).filter((n): n is string => Boolean(n));

  return (
    <div className={`dp${isLight ? ' light' : ''}`} style={{ display: 'flex', height: '100%' }}>
      <style>{CSS}</style>

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="dp-sidebar">
        {/* Brand header */}
        <div style={{ padding: '24px 12px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <DeployPlannerIcon size={40} />
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--dp-tx,#e5e2e1)', letterSpacing: '-0.01em', lineHeight: 1 }}>Deploy Planner</h1>
            <p style={{ fontSize: 10, color: 'var(--dp-tx,#e5e2e1)', opacity: .4, fontWeight: 700, letterSpacing: '.1em', marginTop: 4 }}>
              {releases.length > 0 ? `${releases.length} RELEASES` : 'PIPELINE'}
            </p>
          </div>
        </div>

        {/* New Release CTA */}
        <div style={{ padding: '8px 8px 16px' }}>
          <button
            onClick={() => void addRelease()}
            style={{
              width: '100%', background: 'linear-gradient(135deg,#adc6ff,#4d8eff)', color: '#00285d',
              fontWeight: 600, padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontFamily: 'inherit', fontSize: 13, letterSpacing: '.02em',
              boxShadow: '0 4px 20px rgba(77,142,255,.12)',
              transition: 'all .2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'drop-shadow(0 0 12px rgba(77,142,255,.3))')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_circle</span>
            New Release
          </button>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1 }}>
          {TABS.map(t => {
            const active = (detail ? false : tab === t.id);
            return (
              <button
                key={t.id}
                className={`dp-sidebar-nav-item${active ? ' active' : ''}`}
                onClick={() => { setTab(t.id); setDetail(null); }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{TAB_ICONS[t.id]}</span>
                <span>{t.label}</span>
                {t.badge !== undefined && t.badge > 0 && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 9, padding: '1px 7px', borderRadius: 10,
                    background: active ? 'rgba(77,142,255,.2)' : 'rgba(255,255,255,.06)',
                    color: active ? '#4d8eff' : 'var(--dp-tx3,#8c909f)', fontWeight: 700,
                  }}>{t.badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Jira sync status (footer) */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--dp-tx3,#8c909f)', flex: 1 }}>
            {fetchingJira
              ? <><span className="spin" style={{ marginRight: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>sync</span>
                </span>Syncing…</>
              : `${tickets.length} tickets`}
          </span>
          <button
            onClick={() => void fetchJiraTickets()}
            disabled={fetchingJira}
            title="Recargar tickets de Jira"
            style={{ background: 'var(--dp-sf3,#2a2a2a)', border: '1px solid rgba(66,71,84,.15)', borderRadius: 6, width: 28, height: 28, color: 'var(--dp-tx2,#c2c6d6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>refresh</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────── */}
      <div className="dp-main" style={{ padding: 28 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--dp-tx3,#8c909f)', fontSize: 13 }}>Cargando…</div>
        ) : detailRel ? (
          <ReleaseDetail
            rel={detailRel}
            tickets={tickets}
            statusCfg={statusCfg}
            repoGroups={repoGroups}
            allReleases={releases}
            isLight={isLight}
            onBack={() => setDetail(null)}
            onUpdRelease={patch => { if (detail) void upd(detail, patch); }}
            classifiedSubs={classifiedSubs}
            jiraBaseUrl={jiraBaseUrl}
            onPersistTicketStatuses={(id, ticketStatuses) => releaseRawRepo.updateRaw(id, { ticket_statuses: ticketStatuses })}
            jiraTransition={jiraTransition}
            onRefreshSubtasks={async () => {
              try {
                const stConfigs = await subtaskConfigRepo.findAll();
                const parentKeys = tickets.map(t => t.key);
                const rawSubs = await subtaskAdapter.getSubtasks(parentKeys);
                setClassifiedSubs(SubtaskService.classify(rawSubs, stConfigs));
              } catch (e) {
                console.warn('Refresh subtasks error:', (e as Error).message);
              }
            }}
          />
        ) : (
          <>
            {tab === 'planning' && (
              <div style={{ position: 'relative' }}>
                {/* Loading overlay */}
                {fetchingJira && tickets.length === 0 && (
                  <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(19,19,19,.92)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 8, minHeight: 200 }}>
                    <div className="spin" style={{ fontSize: 24, color: 'var(--dp-primary,#adc6ff)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 28 }}>sync</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--dp-tx,#e5e2e1)', fontWeight: 600, letterSpacing: '-0.01em' }}>Cargando tickets de Jira…</div>
                    <div style={{ fontSize: 11, color: 'var(--dp-tx3,#8c909f)' }}>Conectando con proyectos y sincronizando issues</div>
                  </div>
                )}
                {/* Stitch header */}
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--dp-primary,#adc6ff)', marginBottom: 6 }}>PRODUCTION PIPELINE</div>
                  <h1 style={{ fontSize: 28, fontWeight: 600, color: 'var(--dp-tx,#e5e2e1)', letterSpacing: '-0.02em', marginBottom: 6 }}>Planning Board</h1>
                  <p style={{ fontSize: 13, color: 'var(--dp-tx3,#8c909f)', letterSpacing: '0.01em' }}>
                    Organiza releases, asigna tickets y coordina deploys a producción.
                  </p>
                </div>
                {/* Stat cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 28 }}>
                  {[
                    { label: 'ACTIVE RELEASES', value: releases.filter(r => !statusCfg[r.status]?.is_final).length, icon: 'rocket_launch', color: 'var(--dp-primary,#adc6ff)' },
                    { label: 'SCHEDULED TODAY', value: releases.filter(r => r.end_date === fmt(today)).length, icon: 'today', color: 'var(--dp-warning,#f59e0b)' },
                    { label: 'SUCCESS RATE', value: `${releases.filter(r => statusCfg[r.status]?.is_final).length ? Math.round(releases.filter(r => r.status === 'Deployed').length / Math.max(releases.filter(r => statusCfg[r.status]?.is_final).length, 1) * 100) : 0}%`, icon: 'trending_up', color: 'var(--dp-secondary,#4ae176)' },
                    { label: 'PENDING TICKETS', value: tickets.length, icon: 'confirmation_number', color: 'var(--dp-tertiary,#ddb7ff)' },
                  ].map(s => (
                    <div key={s.label} className="glass-card ghost-border-top" style={{ position: 'relative', padding: '16px 18px', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: s.color }}>{s.icon}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--dp-tx3,#8c909f)' }}>{s.label}</span>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: s.color, lineHeight: 1, letterSpacing: '-0.02em' }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--dp-tx3,#8c909f)', marginRight: 8 }}>
                    {releases.length} releases · {tickets.length} tickets
                    {fetchingJira && tickets.length > 0 && <span className="spin" style={{ marginLeft: 6, display: 'inline-block' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>sync</span>
                    </span>}
                  </span>
                  {Object.entries(statusCfg).map(([name, cfg]) => {
                    const on = filterStatus.includes(name);
                    return (
                      <button
                        key={name}
                        onClick={() => setFilterStatus(f => f.includes(name) ? f.filter(x => x !== name) : [...f, name])}
                        style={{
                          fontSize: 10, padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                          background: on ? cfg.bg_color : 'transparent',
                          color: on ? cfg.color : 'var(--dp-tx3,#8c909f)',
                          border: `1px solid ${on ? cfg.border : 'rgba(66,71,84,.15)'}`,
                          transition: 'all .12s',
                        }}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
                {hidden > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--dp-tx3,#8c909f)', marginBottom: 14 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 4 }}>filter_alt</span>
                    {hidden} release{hidden > 1 ? 's' : ''} oculta{hidden > 1 ? 's' : ''} por filtros — actívalas arriba o ve a History.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  {/* Render cards with group frames */}
                  {(() => {
                    const rendered = new Set<string>();
                    const elements: ReactNode[] = [];
                    // First render grouped cards with frames
                    linkedGroups.forEach(lg => {
                      const groupCards = visible.filter(r => lg.releaseIds.includes(r.id) && !rendered.has(r.id));
                      if (groupCards.length < 2) return;
                      groupCards.forEach(r => rendered.add(r.id));
                      const allDone = lg.allDoneOrApproved;
                      elements.push(
                        <div
                          key={`group-${lg.group.id}`}
                          style={{
                            display: 'flex', gap: 14, flexWrap: 'wrap', padding: 10,
                            border: `2px solid ${allDone ? '#22c55e' : '#f59e0b'}`,
                            borderRadius: 10,
                            background: allDone ? 'rgba(34,197,94,.04)' : 'rgba(245,158,11,.04)',
                            position: 'relative',
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute', top: -9, left: 14, fontSize: 8, fontWeight: 700,
                              color: allDone ? '#22c55e' : '#f59e0b',
                              background: 'var(--dp-bg,#131313)',
                              padding: '0 6px', letterSpacing: '.05em', textTransform: 'uppercase',
                            }}
                          >
                            {lg.group.name}
                          </span>
                          {groupCards.map(rel => (
                            <ReleaseCard
                              key={rel.id}
                              rel={rel}
                              statusCfg={statusCfg}
                              tickets={tickets}
                              onOpen={setDetail}
                              onUpd={upd}
                              onDelete={delRelease}
                              onDrop={handleDrop}
                              setDrag={setDrag}
                              drag={drag}
                              allReleases={releases}
                              repoGroups={repoGroups}
                              versionCfg={versionCfg}
                              allReleaseNumbers={allReleaseNumbers}
                              jiraBaseUrl={jiraBaseUrl}
                              linkedGroups={linkedGroups}
                              classifiedSubs={classifiedSubs}
                            />
                          ))}
                        </div>,
                      );
                    });
                    // Then render ungrouped cards
                    visible.filter(r => !rendered.has(r.id)).forEach(rel => {
                      elements.push(
                        <ReleaseCard
                          key={rel.id}
                          rel={rel}
                          statusCfg={statusCfg}
                          tickets={tickets}
                          onOpen={setDetail}
                          onUpd={upd}
                          onDelete={delRelease}
                          onDrop={handleDrop}
                          setDrag={setDrag}
                          drag={drag}
                          allReleases={releases}
                          repoGroups={repoGroups}
                          versionCfg={versionCfg}
                          allReleaseNumbers={allReleaseNumbers}
                          jiraBaseUrl={jiraBaseUrl}
                          linkedGroups={linkedGroups}
                          classifiedSubs={classifiedSubs}
                        />,
                      );
                    });
                    return elements;
                  })()}
                  <div
                    onClick={() => void addRelease()}
                    style={{ width: 320, minHeight: 140, background: 'transparent', border: '2px dashed rgba(66,71,84,.3)', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', color: 'var(--dp-tx3,#8c909f)', fontSize: 12, transition: 'all .2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--dp-primary,#adc6ff)'; e.currentTarget.style.background = 'rgba(77,142,255,.04)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(66,71,84,.3)'; e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--dp-primary,#adc6ff)' }}>add_circle</span>
                    <span style={{ fontSize: 11, letterSpacing: '0.01em' }}>Nueva release</span>
                  </div>
                </div>
              </div>
            )}
            {tab === 'timeline' && (
              <Timeline releases={releases} tickets={tickets} upd={upd} setDetail={setDetail} statusCfg={statusCfg} repoGroups={repoGroups} />
            )}
            {tab === 'history' && (
              <History releases={releases} tickets={tickets} setDetail={setDetail} statusCfg={statusCfg} classifiedSubs={classifiedSubs} />
            )}
            {tab === 'metrics' && (
              <Metrics releases={releases} tickets={tickets} statusCfg={statusCfg} classifiedSubs={classifiedSubs} />
            )}
          </>
        )}
      </div>

      {/* ── Task Sidebar (right) ───────────────────────── */}
      <TaskSidebar
        tickets={tickets}
        releases={releases}
        jiraBaseUrl={jiraBaseUrl}
        collapsed={taskSidebarCollapsed}
        onToggle={toggleTaskSidebar}
        onRefresh={() => void fetchJiraTickets()}
        refreshing={fetchingJira}
        drag={drag}
        setDrag={setDrag}
      />
    </div>
  );
}
