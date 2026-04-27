/**
 * TaskSidebar — collapsible right panel showing all Jira tickets.
 *
 * Features:
 * - Debounced search (300ms)
 * - Ticket list sorted newest-first
 * - "Assigned" badge for tickets already in a release
 * - Click opens Jira URL in a new tab
 * - Drag handle for manual reorder
 * - Refresh button to re-fetch tickets
 * - Carbon Logic design system
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { DpTicket, Release, DragState } from './types';

export const SIDEBAR_SOURCE = '__sidebar__';

/* ─── Props ──────────────────────────────────────────────────── */
export interface TaskSidebarProps {
  tickets: DpTicket[];
  releases: Release[];
  jiraBaseUrl: string;
  collapsed: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
  drag: DragState | null;
  setDrag: (d: DragState | null) => void;
}

/* ─── Type → Material Symbol map ─────────────────────────────── */
const TYPE_ICONS: Record<string, string> = {
  Bug:         'bug_report',
  Story:       'auto_stories',
  Task:        'task_alt',
  Epic:        'bolt',
  Subtask:     'subdirectory_arrow_right',
  'Sub-task':  'subdirectory_arrow_right',
  Improvement: 'trending_up',
};

function typeIcon(type: string): string {
  return TYPE_ICONS[type] ?? 'confirmation_number';
}

/* ─── Status → semantic chip colors ──────────────────────────── */
function statusChipStyle(status: string): { color: string; bg: string } {
  const s = status.toLowerCase();
  if (s.includes('done') || s.includes('deployed') || s.includes('closed'))
    return { color: 'var(--dp-secondary)', bg: 'rgba(74,225,118,.1)' };
  if (s.includes('progress') || s.includes('review') || s.includes('staging'))
    return { color: 'var(--dp-warning)', bg: 'rgba(245,158,11,.1)' };
  if (s.includes('block') || s.includes('reject') || s.includes('rollback'))
    return { color: 'var(--dp-danger)', bg: 'rgba(255,180,171,.1)' };
  return { color: 'var(--dp-tx3)', bg: 'rgba(140,144,159,.08)' };
}

/* ─── Truncate helper ────────────────────────────────────────── */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/* ─── Component ──────────────────────────────────────────────── */
export function TaskSidebar({
  tickets,
  releases,
  jiraBaseUrl,
  collapsed,
  onToggle,
  onRefresh,
  refreshing = false,
  drag,
  setDrag,
}: TaskSidebarProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input 300ms
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [search]);

  // Build a set of ticket keys already assigned to any release
  const assignedKeys = useMemo(() => {
    const set = new Set<string>();
    releases.forEach(r => (r.ticket_ids ?? []).forEach(k => set.add(k)));
    return set;
  }, [releases]);

  // Filter & sort tickets: only unassigned, newest first
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const base = tickets.filter(t => {
      if (assignedKeys.has(t.key)) return false;
      if (!q) return true;
      return t.key.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q);
    });
    return [...base].reverse();
  }, [tickets, debouncedSearch, assignedKeys]);

  const handleClick = useCallback(
    (key: string) => {
      if (jiraBaseUrl) {
        window.open(`${jiraBaseUrl}/browse/${key}`, '_blank', 'noopener');
      }
    },
    [jiraBaseUrl],
  );

  /* ── Collapsed toggle button ─── */
  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        title={t('deployPlanner.taskSidebar.expand')}
        style={{
          position: 'sticky',
          top: 0,
          alignSelf: 'flex-start',
          width: 36,
          minWidth: 36,
          height: 36,
          marginTop: 28,
          marginRight: 8,
          background: 'var(--dp-sf)',
          border: '1px solid var(--dp-bd,var(--bd))',
          borderRadius: 8,
          color: 'var(--dp-tx2)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all .2s',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-md)' }}>chevron_left</span>
      </button>
    );
  }

  /* ── Expanded panel ─── */
  return (
    <aside
      style={{
        position: 'sticky',
        top: 0,
        width: 300,
        minWidth: 300,
        height: '100%',
        minHeight: 'calc(100vh - 52px)',
        alignSelf: 'stretch',
        background: 'var(--dp-bg,var(--bg))',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderLeft: '1px solid var(--dp-bd,var(--bd))',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ─── */}
      <div
        style={{
          padding: '16px 14px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid var(--dp-bd,var(--bd))',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 'var(--fs-md)', color: 'var(--dp-primary)' }}
        >
          confirmation_number
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 'var(--fs-xs)',
            fontWeight: 700,
            letterSpacing: '.05em',
            textTransform: 'uppercase',
            color: 'var(--dp-tx)',
          }}
        >
          {t('deployPlanner.taskSidebar.title')}
        </span>
        <span
          style={{
            fontSize: 'var(--fs-2xs)',
            padding: '2px 8px',
            borderRadius: 10,
            background: 'var(--dp-primary-dim, var(--ac-dim))',
            color: 'var(--dp-primary)',
            fontWeight: 700,
          }}
        >
          {filtered.length}
        </span>
        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          title={t('deployPlanner.taskSidebar.refresh')}
          style={{
            background: 'var(--dp-sf3)',
            border: '1px solid var(--dp-bd,var(--bd))',
            borderRadius: 6,
            width: 26,
            height: 26,
            color: 'var(--dp-tx2)',
            cursor: refreshing ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: refreshing ? 0.5 : 1,
          }}
        >
          <span
            className={`material-symbols-outlined${refreshing ? ' spin' : ''}`}
            style={{ fontSize: 'var(--fs-sm)' }}
          >
            refresh
          </span>
        </button>
        {/* Collapse */}
        <button
          onClick={onToggle}
          title={t('deployPlanner.taskSidebar.collapse')}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--dp-tx3)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 2,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-md)' }}>chevron_right</span>
        </button>
      </div>

      {/* ── Search ─── */}
      <div style={{ padding: '10px 14px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--dp-sf)',
            borderRadius: 8,
            padding: '0 10px',
            border: '1px solid var(--dp-bd,var(--bd))',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 'var(--fs-body)', color: 'var(--dp-tx3)' }}
          >
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('deployPlanner.taskSidebar.searchPlaceholder')}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--dp-tx)',
              fontSize: 'var(--fs-xs)',
              padding: '8px 0',
              fontFamily: 'inherit',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--dp-tx3)',
                display: 'flex',
                alignItems: 'center',
                padding: 0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-xs)' }}>close</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Ticket list ─── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 10px 10px',
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 16px',
              color: 'var(--dp-tx3)',
              fontSize: 'var(--fs-xs)',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 'var(--fs-xl)', display: 'block', marginBottom: 8, opacity: 0.4 }}
            >
              search_off
            </span>
            {t('deployPlanner.taskSidebar.noResults')}
          </div>
        ) : (
          filtered.map(ticket => {
            const chip = statusChipStyle(ticket.status);
            const isDragging = drag?.key === ticket.key;

            return (
              <div
                key={ticket.key}
                draggable
                onDragStart={e => {
                  setDrag({ key: ticket.key, fromId: SIDEBAR_SOURCE });
                  e.dataTransfer.effectAllowed = 'copy';
                  e.dataTransfer.setData('text/plain', ticket.key);
                }}
                onDragEnd={() => setDrag(null)}
                onClick={() => handleClick(ticket.key)}
                style={{
                  background: 'var(--sf3)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  borderLeft: `3px solid ${chip.color}`,
                  opacity: isDragging ? 0.4 : 1,
                  boxShadow: '0 1px 2px rgba(0,0,0,.2)',
                  marginBottom: 6,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(79,110,247,.08)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 14px rgba(79,110,247,.18)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--sf3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,.2)';
                }}
              >
                {/* Title */}
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--tx)', lineHeight: 1.35 }}>
                  {truncate(ticket.summary, 50)}
                </div>
                {/* Meta row */}
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--fs-2xs)', padding: '2px 6px', borderRadius: 3, background: 'var(--ac-dim)', color: 'var(--ac2)', fontWeight: 700, letterSpacing: '.05em' }}>{ticket.key}</span>
                  <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-xs)', color: 'var(--tx3)' }}>{typeIcon(ticket.type)}</span>
                  <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 600, padding: '2px 8px', borderRadius: 3, color: chip.color, background: chip.bg }}>{ticket.status}</span>
                  <div style={{ flex: 1 }} />
                  {ticket.assignee && (
                    <div title={ticket.assignee} style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg, var(--ac), var(--ac2))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-2xs)', fontWeight: 700, border: '1px solid rgba(255,255,255,.12)' }}>
                      {ticket.assignee.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
