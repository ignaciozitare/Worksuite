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
import type { DpTicket, Release } from './types';

/* ─── Props ──────────────────────────────────────────────────── */
export interface TaskSidebarProps {
  tickets: DpTicket[];
  releases: Release[];
  jiraBaseUrl: string;
  collapsed: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
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
    return { color: 'var(--dp-secondary,#4ae176)', bg: 'rgba(74,225,118,.1)' };
  if (s.includes('progress') || s.includes('review') || s.includes('staging'))
    return { color: 'var(--dp-warning,#f59e0b)', bg: 'rgba(245,158,11,.1)' };
  if (s.includes('block') || s.includes('reject') || s.includes('rollback'))
    return { color: 'var(--dp-danger,#ffb4ab)', bg: 'rgba(255,180,171,.1)' };
  return { color: 'var(--dp-tx3,#8c909f)', bg: 'rgba(140,144,159,.08)' };
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

  // Filter & sort tickets: newest first (reverse order = bottom of array first)
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const base = q
      ? tickets.filter(
          t =>
            t.key.toLowerCase().includes(q) ||
            t.summary.toLowerCase().includes(q) ||
            t.status.toLowerCase().includes(q) ||
            t.type.toLowerCase().includes(q),
        )
      : tickets;
    // Reverse for "newest first" (tickets come from Jira in creation order)
    return [...base].reverse();
  }, [tickets, debouncedSearch]);

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
          background: 'var(--dp-sf,#1c1b1b)',
          border: '1px solid rgba(66,71,84,.15)',
          borderRadius: 8,
          color: 'var(--dp-tx2,#c2c6d6)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all .2s',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span>
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
        background: 'rgba(14,14,14,.6)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderLeft: '1px solid rgba(255,255,255,.05)',
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
          borderBottom: '1px solid rgba(255,255,255,.05)',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 18, color: 'var(--dp-primary,#adc6ff)' }}
        >
          confirmation_number
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '.05em',
            textTransform: 'uppercase',
            color: 'var(--dp-tx,#e5e2e1)',
          }}
        >
          {t('deployPlanner.taskSidebar.title')}
        </span>
        <span
          style={{
            fontSize: 10,
            padding: '2px 8px',
            borderRadius: 10,
            background: 'rgba(77,142,255,.1)',
            color: 'var(--dp-primary,#adc6ff)',
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
            background: 'var(--dp-sf3,#2a2a2a)',
            border: '1px solid rgba(66,71,84,.15)',
            borderRadius: 6,
            width: 26,
            height: 26,
            color: 'var(--dp-tx2,#c2c6d6)',
            cursor: refreshing ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: refreshing ? 0.5 : 1,
          }}
        >
          <span
            className={`material-symbols-outlined${refreshing ? ' spin' : ''}`}
            style={{ fontSize: 14 }}
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
            color: 'var(--dp-tx3,#8c909f)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 2,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
        </button>
      </div>

      {/* ── Search ─── */}
      <div style={{ padding: '10px 14px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--dp-sf,#1c1b1b)',
            borderRadius: 8,
            padding: '0 10px',
            border: '1px solid rgba(66,71,84,.15)',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 16, color: 'var(--dp-tx3,#8c909f)' }}
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
              color: 'var(--dp-tx,#e5e2e1)',
              fontSize: 12,
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
                color: 'var(--dp-tx3,#8c909f)',
                display: 'flex',
                alignItems: 'center',
                padding: 0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
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
              color: 'var(--dp-tx3,#8c909f)',
              fontSize: 12,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.4 }}
            >
              search_off
            </span>
            {t('deployPlanner.taskSidebar.noResults')}
          </div>
        ) : (
          filtered.map(ticket => {
            const assigned = assignedKeys.has(ticket.key);
            const chip = statusChipStyle(ticket.status);

            return (
              <div
                key={ticket.key}
                onClick={() => handleClick(ticket.key)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '10px 8px',
                  borderRadius: 8,
                  cursor: jiraBaseUrl ? 'pointer' : 'default',
                  transition: 'background .15s',
                  opacity: assigned ? 0.5 : 1,
                  marginBottom: 2,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--dp-sf,#1c1b1b)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {/* Drag handle */}
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 14,
                    color: 'var(--dp-tx3,#8c909f)',
                    cursor: 'grab',
                    marginTop: 2,
                    opacity: 0.4,
                    flexShrink: 0,
                  }}
                >
                  drag_indicator
                </span>

                {/* Type icon */}
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 16,
                    color: 'var(--dp-primary,#adc6ff)',
                    marginTop: 1,
                    flexShrink: 0,
                  }}
                >
                  {typeIcon(ticket.type)}
                </span>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--dp-primary,#adc6ff)',
                        letterSpacing: '0.01em',
                        flexShrink: 0,
                      }}
                    >
                      {ticket.key}
                    </span>
                    {assigned && (
                      <span
                        style={{
                          fontSize: 8,
                          fontWeight: 700,
                          letterSpacing: '.06em',
                          textTransform: 'uppercase',
                          color: 'var(--dp-tertiary,#ddb7ff)',
                          background: 'rgba(221,183,255,.1)',
                          padding: '1px 6px',
                          borderRadius: 4,
                        }}
                      >
                        {t('deployPlanner.taskSidebar.assigned')}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--dp-tx2,#c2c6d6)',
                      lineHeight: 1.4,
                      marginBottom: 4,
                    }}
                  >
                    {truncate(ticket.summary, 60)}
                  </div>
                  {/* Status chip */}
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 4,
                      color: chip.color,
                      background: chip.bg,
                      display: 'inline-block',
                    }}
                  >
                    {ticket.status}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
