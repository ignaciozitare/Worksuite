import React, { useState, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { DateRangePicker } from '@worksuite/ui';
import { MOCK_PROJECTS_FALLBACK } from '@/shared/lib/fallbackData';
import { CalendarView } from './CalendarView';
import { DayView } from './DayView';
import { TasksView } from './TasksView';

/* ─── Types ────────────────────────────────────────────────────────────── */

interface JiraTrackerPageProps {
  view: string;
  filters: any;
  worklogs: Record<string, any[]>;
  users: any[];
  jiraIssues: any[];
  jiraProjects: any[];
  jiraUsers: string[];
  jiraUserFilter: string;
  activeDay: string;
  onApplyFilters: (f: any) => void;
  onExport: (f: any) => void;
  onDayClick: (d: string) => void;
  onOpenLog: (opts?: any) => void;
  onDeleteWorklog: (date: string, id: string) => void;
  onDateChange: (d: string) => void;
  onProjectChange: (pk: string) => void;
  onJiraUserFilter: (email: string) => void;
  onNavigate: (view: string) => void;
}

/* ─── Scoped styles ────────────────────────────────────────────────────── */

const JT_CSS = `
/* ── Layout ─────────────────────────────────────────────────────────── */
.jt-page{display:flex;flex:1;height:100%;overflow:hidden;background:var(--bg)}

/* ── Left sidebar — glass ───────────────────────────────────────────── */
.jt-sidebar{
  width:240px;min-width:240px;align-self:stretch;
  background:rgba(14,14,14,.6);
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border-right:1px solid rgba(255,255,255,.05);
  display:flex;flex-direction:column;padding:16px;gap:4px;
  overflow-y:auto;overflow-x:hidden;z-index:10;
}
[data-theme="light"] .jt-sidebar{
  background:var(--sf);backdrop-filter:none;-webkit-backdrop-filter:none;
  border-right:1px solid var(--bd);
}
.jt-sidebar::-webkit-scrollbar{width:4px}
.jt-sidebar::-webkit-scrollbar-thumb{background:var(--bd);border-radius:4px}

/* ── Nav items ──────────────────────────────────────────────────────── */
.jt-nav-item{
  display:flex;align-items:center;gap:10px;
  padding:8px 12px;border-radius:8px;
  cursor:pointer;transition:all .15s ease;
  font:500 13px/1 'Inter',sans-serif;
  color:var(--tx);opacity:.6;
  border:none;background:none;width:100%;text-align:left;
}
.jt-nav-item:hover{opacity:.8;background:rgba(79,110,247,.08)}
.jt-nav-item.active{
  opacity:1;background:rgba(79,110,247,.1);
  color:var(--ac2);font-weight:600;
}
[data-theme="light"] .jt-nav-item.active{
  background:var(--ac-dim);color:var(--ac);
}

/* ── Gradient buttons ───────────────────────────────────────────────── */
.jt-gbtn{
  display:flex;align-items:center;justify-content:center;gap:8px;
  padding:10px 0;border-radius:8px;border:none;width:100%;
  font:600 12px/1 'Inter',sans-serif;cursor:pointer;
  transition:box-shadow .2s ease,transform .15s ease;
}
.jt-gbtn:active{transform:scale(.97)}
.jt-gbtn.primary{
  background:linear-gradient(225deg,var(--ac2),var(--ac));
  color:var(--ac-on);box-shadow:0 0 12px rgba(79,110,247,.2);
}
.jt-gbtn.primary:hover{box-shadow:0 0 20px rgba(79,110,247,.35)}
.jt-gbtn.export{
  background:linear-gradient(225deg,var(--green),var(--green-strong));
  color:#003d20;box-shadow:0 0 12px rgba(74,225,118,.2);
}
.jt-gbtn.export:hover{box-shadow:0 0 20px rgba(74,225,118,.35)}
[data-theme="light"] .jt-gbtn.export{color:#fff}

/* ── Right sidebar ──────────────────────────────────────────────────── */
.jt-right{
  display:flex;flex-direction:column;align-self:stretch;
  background:var(--sf-lowest);
  border-left:1px solid var(--bd);
  overflow:hidden;
  transition:width .2s ease,min-width .2s ease;
}
.jt-right.open{width:260px;min-width:260px}
.jt-right.closed{width:40px;min-width:40px}

/* ── Ticket cards (green filete + radial glow) ──────────────────────── */
.jt-ticket{
  border-radius:8px;background:var(--sf);
  border-left:3px solid var(--green-strong);
  padding:10px;cursor:grab;
  position:relative;overflow:hidden;
  transition:transform .15s ease,box-shadow .15s ease;
}
.jt-ticket::before{
  content:'';position:absolute;top:0;right:0;bottom:0;width:60%;
  background:radial-gradient(circle at right center,rgba(0,185,84,.14),transparent 70%);
  pointer-events:none;
}
.jt-ticket:hover{
  transform:translateY(-1px);
  box-shadow:0 4px 20px rgba(0,185,84,.08);
}
[data-theme="light"] .jt-ticket::before{
  background:radial-gradient(circle at right center,rgba(0,185,84,.07),transparent 70%);
}

/* ── Filter inputs ──────────────────────────────────────────────────── */
.jt-input{
  width:100%;padding:8px 10px;border-radius:8px;
  background:var(--sf-lowest);border:1px solid var(--bd);
  color:var(--tx);font:500 11px/1.4 'Inter',sans-serif;
  outline:none;transition:border-color .15s ease;
  appearance:none;-webkit-appearance:none;
}
.jt-input:focus{border-color:var(--ac)}
.jt-input::placeholder{color:var(--tx3)}
select.jt-input{
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238888a8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 8px center;
  padding-right:28px;cursor:pointer;
}

/* ── Project chips ──────────────────────────────────────────────────── */
.jt-pchip{
  display:inline-flex;align-items:center;gap:5px;
  padding:5px 12px;border-radius:6px;
  font:600 11px/1 'Inter',sans-serif;
  cursor:pointer;transition:all .15s ease;
  border:none;background:var(--sf2);color:var(--tx2);opacity:.5;
}
.jt-pchip.on{opacity:1;background:rgba(79,110,247,.1);color:var(--ac2)}
.jt-pchip:hover{opacity:.8}

/* ── Main content ───────────────────────────────────────────────────── */
.jt-main{flex:1;min-width:0;overflow:auto;display:flex;flex-direction:column}


`;

/* ─── Material icon helper ─────────────────────────────────────────────── */

function Icon({ name, size = 20, weight = 300, fill = false, style }: {
  name: string; size?: number; weight?: number; fill?: boolean; style?: React.CSSProperties;
}) {
  return (
    <span className="material-symbols-outlined" style={{
      fontSize: size, fontVariationSettings: `'wght' ${weight}, 'FILL' ${fill ? 1 : 0}`,
      lineHeight: 1, ...style,
    }}>{name}</span>
  );
}

/* ── Section label helper ─────────────────────────────────────────────── */

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: 'var(--tx3)',
      letterSpacing: '0.12em', textTransform: 'uppercase' as const,
      padding: '10px 0 6px', ...style,
    }}>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
/*  JiraTrackerPage                                                       */
/* ═══════════════════════════════════════════════════════════════════════ */

export function JiraTrackerPage({
  view, filters, worklogs, users, jiraIssues, jiraProjects,
  jiraUsers, jiraUserFilter, activeDay,
  onApplyFilters, onExport, onDayClick, onOpenLog,
  onDeleteWorklog, onDateChange, onProjectChange,
  onJiraUserFilter, onNavigate,
}: JiraTrackerPageProps) {

  return (
    <div className="jt-page">
      <style>{JT_CSS}</style>
      <LeftSidebar
        view={view}
        filters={filters}
        users={users}
        jiraProjects={jiraProjects}
        jiraUsers={jiraUsers}
        jiraUserFilter={jiraUserFilter}
        onApplyFilters={onApplyFilters}
        onExport={onExport}
        onProjectChange={onProjectChange}
        onJiraUserFilter={onJiraUserFilter}
        onNavigate={onNavigate}
      />
      <div className="jt-main">
        {view === 'calendar' && (
          <CalendarView filters={filters} worklogs={worklogs} onDayClick={onDayClick} onOpenLog={onOpenLog} />
        )}
        {view === 'day' && (
          <DayView date={activeDay} filters={filters} worklogs={worklogs} onDateChange={onDateChange} onOpenLog={onOpenLog} onDeleteWorklog={onDeleteWorklog} />
        )}
        {view === 'tasks' && (
          <TasksView filters={filters} onOpenLog={onOpenLog} worklogs={worklogs} jiraIssues={jiraIssues} jiraProjects={jiraProjects} />
        )}
      </div>
      <RightSidebar worklogs={worklogs} jiraIssues={jiraIssues} onOpenLog={onOpenLog} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
/*  Left Sidebar (Glassmorphic)                                           */
/* ═══════════════════════════════════════════════════════════════════════ */

interface LeftSidebarProps {
  view: string;
  filters: any;
  users: any[];
  jiraProjects: any[];
  jiraUsers: string[];
  jiraUserFilter: string;
  onApplyFilters: (f: any) => void;
  onExport: (f: any) => void;
  onProjectChange: (pk: string) => void;
  onJiraUserFilter: (email: string) => void;
  onNavigate: (view: string) => void;
}

function LeftSidebar({
  view, filters, users, jiraProjects, jiraUsers, jiraUserFilter,
  onApplyFilters, onExport, onProjectChange, onJiraUserFilter, onNavigate,
}: LeftSidebarProps) {
  const { t } = useTranslation();
  const projects = jiraProjects?.length ? jiraProjects : MOCK_PROJECTS_FALLBACK;

  const [local, setLocal] = useState(filters);
  const [spaceQ, setSpaceQ] = useState('');

  const filteredProjects = spaceQ.trim()
    ? projects.filter((p: any) =>
        p.key.toLowerCase().includes(spaceQ.toLowerCase()) ||
        p.name.toLowerCase().includes(spaceQ.toLowerCase()))
    : projects;

  const toggleProject = (k: string) => {
    const isAdding = !local.spaceKeys.includes(k);
    const newKeys = isAdding
      ? [...local.spaceKeys, k]
      : local.spaceKeys.filter((x: string) => x !== k);
    setLocal((f: any) => ({ ...f, spaceKeys: newKeys }));
    if (isAdding && onProjectChange) onProjectChange(k);
  };

  const navItems = [
    { id: 'calendar', icon: 'calendar_month', label: t('nav.calendar') },
    { id: 'day', icon: 'today', label: t('nav.dayView') },
    { id: 'tasks', icon: 'task_alt', label: t('nav.tasks') },
  ];

  return (
    <aside className="jt-sidebar">
      {/* ── Brand ──────────────────────────────────────────────── */}
      <div style={{ padding: '20px 4px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'var(--ac-dim)', border: '1px solid rgba(79,110,247,.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="query_stats" size={20} weight={300} style={{ color: 'var(--ac2)' }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx)', letterSpacing: '-0.01em' }}>
              Jira Tracker
            </div>
            <div style={{ fontSize: 9, color: 'var(--tx3)', letterSpacing: '0.1em', opacity: 0.5 }}>
              WORKLOGS
            </div>
          </div>
        </div>
      </div>

      {/* ── Navigation ─────────────────────────────────────────── */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 0' }}>
        {navItems.map(item => (
          <button
            key={item.id}
            className={`jt-nav-item ${view === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <Icon
              name={item.icon} size={20}
              weight={view === item.id ? 400 : 300}
              fill={view === item.id}
              style={{ color: view === item.id ? 'var(--ac2)' : 'inherit' }}
            />
            {item.label}
          </button>
        ))}
      </nav>

      {/* ── Separator ──────────────────────────────────────────── */}
      <div style={{ height: 1, background: 'rgba(255,255,255,.05)', margin: '2px 0' }} />

      {/* ── DATE RANGE ─────────────────────────────────────────── */}
      <SectionLabel>{t('jiraTracker.dateRange')}</SectionLabel>
      <div style={{ marginBottom: 8 }}>
        <DateRangePicker
          startValue={local.from}
          endValue={local.to}
          onChange={(start, end) => setLocal({ ...local, from: start.slice(0, 10), to: end.slice(0, 10) })}
          showTime={false}
          minDate="2020-01-01"
          labels={{ start: t('jiraTracker.from', 'Inicio'), end: t('jiraTracker.to', 'Fin') }}
        />
      </div>

      {/* ── FILTER BY USER ─────────────────────────────────────── */}
      <SectionLabel>{t('jiraTracker.filterByUser')}</SectionLabel>
      <select
        className="jt-input"
        value={jiraUserFilter}
        onChange={e => onJiraUserFilter(e.target.value)}
        style={{ marginBottom: 8 }}
      >
        <option value="">{t('jiraTracker.allUsers')}</option>
        {jiraUsers.map(u => <option key={u} value={u}>{u}</option>)}
      </select>

      {/* ── PROJECTS ───────────────────────────────────────────── */}
      <SectionLabel style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {t('jiraTracker.spaces', 'PROJECTS')}
        {local.spaceKeys.length > 0 && (
          <span style={{
            background: 'var(--ac)', color: 'var(--ac-on)',
            fontSize: 9, fontWeight: 700, padding: '1px 6px',
            borderRadius: 9999, minWidth: 16, textAlign: 'center' as const,
          }}>
            {local.spaceKeys.length}
          </span>
        )}
      </SectionLabel>

      <div style={{
        display: 'flex', flexWrap: 'wrap' as const, gap: 6,
        marginBottom: 6,
      }}>
        {filteredProjects.map((p: any) => {
          const on = local.spaceKeys.includes(p.key);
          return (
            <button
              key={p.key}
              className={`jt-pchip ${on ? 'on' : ''}`}
              onClick={() => toggleProject(p.key)}
            >
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: on ? 'var(--ac2)' : 'var(--tx3)',
              }} />
              {p.key}
            </button>
          );
        })}
      </div>

      {local.spaceKeys.length > 0 && (
        <button
          onClick={() => setLocal({ ...local, spaceKeys: [] })}
          style={{
            background: 'none', border: 'none', color: 'var(--tx3)',
            fontSize: 10, cursor: 'pointer', padding: '2px 0', marginBottom: 4,
            textDecoration: 'underline' as const, fontFamily: 'inherit',
          }}
        >
          {t('jiraTracker.clearSelection')}
        </button>
      )}

      {/* ── Hint ───────────────────────────────────────────────── */}
      <div style={{ fontSize: 10, color: 'var(--tx3)', lineHeight: 1.5, marginBottom: 4, opacity: 0.5 }}>
        Shift + Click = {t('jiraTracker.exportHint')}
      </div>

      {/* ── Action buttons ─────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginTop: 'auto', paddingTop: 8 }}>
        <button className="jt-gbtn primary" onClick={() => onApplyFilters(local)}>
          <Icon name="filter_alt" size={16} />
          {t('jiraTracker.applyFilters')}
        </button>
        <button className="jt-gbtn export" onClick={() => onExport(local)}>
          <Icon name="download" size={16} />
          {t('jiraTracker.exportCsv')}
        </button>
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
/*  Right Sidebar (Tasks)                                                 */
/* ═══════════════════════════════════════════════════════════════════════ */

interface RightSidebarProps {
  worklogs: Record<string, any[]>;
  jiraIssues: any[];
  onOpenLog: (opts: any) => void;
}

function RightSidebar({ worklogs, jiraIssues, onOpenLog }: RightSidebarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState('');

  /* Recent tasks from worklogs (for display when no search) */
  const recentTasks = useMemo(() => {
    const all: { issue: string; summary: string; date: string }[] = [];
    for (const [date, dayWls] of Object.entries(worklogs || {})) {
      for (const wl of dayWls) {
        all.push({ issue: wl.issue, summary: wl.summary || wl.issue, date });
      }
    }
    all.sort((a, b) => b.date.localeCompare(a.date));
    const seen = new Set<string>();
    const unique: typeof all = [];
    for (const item of all) {
      if (!seen.has(item.issue)) {
        seen.add(item.issue);
        unique.push(item);
      }
      if (unique.length >= 20) break;
    }
    return unique;
  }, [worklogs]);

  /* Search: when typing, search ALL jira issues; when empty, show recent */
  const displayed = useMemo(() => {
    if (!search.trim()) return recentTasks;
    const q = search.toLowerCase();
    // Search all jira issues
    const fromJira = (jiraIssues || [])
      .filter((i: any) =>
        i.key.toLowerCase().includes(q) ||
        (i.summary || '').toLowerCase().includes(q) ||
        (i.assignee || '').toLowerCase().includes(q))
      .slice(0, 30)
      .map((i: any) => ({ issue: i.key, summary: i.summary || i.key, date: '' }));
    return fromJira;
  }, [search, recentTasks, jiraIssues]);

  return (
    <div className={`jt-right ${open ? 'open' : 'closed'}`}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: open ? '16px 14px 12px' : '16px 6px 12px',
        flexShrink: 0,
      }}>
        {open && (
          <>
            <Icon name="task_alt" size={18} style={{ color: 'var(--ac2)' }} />
            <span style={{
              fontSize: 12, fontWeight: 700, color: 'var(--tx)',
              letterSpacing: '0.08em', flex: 1,
            }}>
              {t('jiraTracker.recentTasks')}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px',
              borderRadius: 9999, background: 'var(--ac-dim)', color: 'var(--ac2)',
            }}>
              {recentTasks.length}
            </span>
          </>
        )}
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            width: 28, height: 28, borderRadius: 6, border: 'none',
            background: 'var(--sf2)', color: 'var(--tx2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <Icon name={open ? 'chevron_right' : 'chevron_left'} size={18} />
        </button>
      </div>

      {open && (
        <>
          {/* ── Search ───────────────────────────────────────────── */}
          <div style={{ padding: '0 14px 10px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--sf)', borderRadius: 8,
              border: '1px solid var(--bd)', padding: '6px 10px',
            }}>
              <Icon name="search" size={16} style={{ color: 'var(--tx3)' }} />
              <input
                type="text"
                placeholder={t('jiraTracker.searchTickets', 'Search tickets...')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  background: 'none', border: 'none', outline: 'none',
                  color: 'var(--tx)', fontSize: 11, fontFamily: 'inherit',
                  width: '100%',
                }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{
                  background: 'none', border: 'none', color: 'var(--tx3)',
                  cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1,
                }}>×</button>
              )}
            </div>
          </div>

          {/* ── Ticket cards ─────────────────────────────────────── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {displayed.map(rt => (
              <div
                key={rt.issue}
                className="jt-ticket"
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('application/jira-issue', JSON.stringify({ issueKey: rt.issue, summary: rt.summary }));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onOpenLog({ issueKey: rt.issue })}
              >
                <div style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--ac2)',
                  fontFamily: 'var(--mono)', position: 'relative',
                }}>
                  {rt.issue}
                </div>
                <div style={{
                  fontSize: 11, color: 'var(--tx2)', marginTop: 3,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', position: 'relative',
                }}>
                  {rt.summary}
                </div>
              </div>
            ))}
            {displayed.length === 0 && (
              <div style={{
                fontSize: 11, color: 'var(--tx3)', textAlign: 'center',
                padding: '24px 0', opacity: 0.7,
              }}>
                {search ? t('jiraTracker.noResults', 'No results') : t('jiraTracker.noWorklogs2')}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
