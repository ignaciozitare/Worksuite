import React, { useState, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { TimeParser } from '../domain/services/TimeParser';
import { WorklogService } from '../domain/services/WorklogService';
import { MOCK_ISSUES_FALLBACK } from '@/shared/lib/fallbackData';

/* ─── Icon helper ──────────────────────────────────────────────────────── */

function Icon({ name, size = 20, weight = 300, style }: {
  name: string; size?: number; weight?: number; style?: React.CSSProperties;
}) {
  return (
    <span className="material-symbols-outlined" style={{
      fontSize: size, fontVariationSettings: `'wght' ${weight}`,
      lineHeight: 1, ...style,
    }}>{name}</span>
  );
}

/* ─── Scoped styles ────────────────────────────────────────────────────── */

const TASKS_CSS = `
.tv-row{transition:background .1s ease}
.tv-row:hover{background:var(--sf2)}
.tv-pill-filter{
  padding:4px 10px;border-radius:9999px;border:none;
  font:500 var(--fs-2xs)/1 'Inter',sans-serif;cursor:pointer;
  transition:all .15s ease;
}
.tv-pill-filter.on{background:var(--glow);border:1px solid rgba(79,110,247,.28);color:var(--ac2)}
.tv-pill-filter.off{background:var(--sf2);border:1px solid transparent;color:var(--tx3)}
.tv-pill-filter:hover{opacity:.85}
`;

/* ─── Types ────────────────────────────────────────────────────────────── */

interface TasksViewProps {
  filters: any;
  onOpenLog: (opts: any) => void;
  worklogs: Record<string, any[]>;
  jiraIssues?: any[];
  jiraProjects?: any[];
}

/* ═══════════════════════════════════════════════════════════════════════ */
/*  TasksView                                                              */
/* ═══════════════════════════════════════════════════════════════════════ */

export function TasksView({ filters, onOpenLog, worklogs, jiraIssues }: TasksViewProps) {
  const { t } = useTranslation();
  const issues = jiraIssues || MOCK_ISSUES_FALLBACK;

  const [tf, stf] = useState<string[]>([]);
  const [sr, ssr] = useState('');
  const [so, sso] = useState({ key: 'key', dir: 'asc' });

  // ── Filter worklogs by date range + author ──────────────────────────
  const rangeWorklogs = useMemo(() => {
    return WorklogService.filterByRange(worklogs, filters.from, filters.to, filters.authorId || null);
  }, [worklogs, filters.from, filters.to, filters.authorId]);

  // ── Hours by issue in range ─────────────────────────────────────────
  const hoursByIssue = useMemo(() => {
    const map: Record<string, number> = {};
    for (const dayWls of Object.values(rangeWorklogs)) {
      for (const wl of dayWls) {
        map[wl.issue] = (map[wl.issue] || 0) + wl.seconds;
      }
    }
    return map;
  }, [rangeWorklogs]);

  // ── Filtered & sorted issues ────────────────────────────────────────
  const filteredIssues = useMemo(() => {
    let l = issues.filter((i: any) => hoursByIssue[i.key] > 0);
    if (filters.spaceKeys.length) l = l.filter((i: any) => filters.spaceKeys.includes(i.project));
    if (tf.length) l = l.filter((i: any) => tf.includes(i.type));
    if (sr) {
      const q = sr.toLowerCase();
      l = l.filter((i: any) =>
        i.key.toLowerCase().includes(q) ||
        i.summary.toLowerCase().includes(q) ||
        (i.assignee || '').toLowerCase().includes(q)
      );
    }
    return [...l].sort((a: any, b: any) => {
      const d = so.dir === 'asc' ? 1 : -1;
      if (so.key === 'hours') return ((hoursByIssue[a.key] || 0) - (hoursByIssue[b.key] || 0)) * d;
      return (a[so.key] ?? '').localeCompare(b[so.key] ?? '') * d;
    });
  }, [issues, filters, tf, sr, so, hoursByIssue]);

  // ── Stats ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const aWls = Object.values(rangeWorklogs).flat();
    const totalH = TimeParser.toHours(aWls.reduce((s, w) => s + w.seconds, 0));
    const activeTasks = Object.keys(hoursByIssue).length;
    const topProject = (() => {
      const byP: Record<string, number> = {};
      for (const wls of Object.values(rangeWorklogs)) {
        for (const w of wls) {
          const p = (issues.find((i: any) => i.key === w.issue) as any)?.project || '—';
          byP[p] = (byP[p] || 0) + w.seconds;
        }
      }
      let top = '—'; let max = 0;
      for (const [p, s] of Object.entries(byP)) { if (s > max) { max = s; top = p; } }
      return top;
    })();
    return { totalH, activeTasks, topProject };
  }, [rangeWorklogs, hoursByIssue, issues]);

  const toggleSort = (k: string) => sso(s => s.key === k ? { ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' });
  const allTypes = [...new Set(issues.filter((i: any) => hoursByIssue[i.key] > 0).map((i: any) => i.type))];

  // ── Status / priority helpers ───────────────────────────────────────
  const statusColor = (s: string) => {
    const sl = (s || '').toLowerCase();
    if (sl.includes('done') || sl.includes('cerrad') || sl.includes('complet') || sl.includes('resuelto')) return { bg: 'var(--green-dim)', color: 'var(--green)' };
    if (sl.includes('progress') || sl.includes('curso') || sl.includes('proceso') || sl.includes('review') || sl.includes('testing')) return { bg: 'var(--ac-dim)', color: 'var(--ac2)' };
    return { bg: 'var(--amber-dim)', color: 'var(--amber)' };
  };

  const priorityColor = (p: string) => {
    if (p === 'Critical') return { bg: 'var(--red-dim)', color: 'var(--red)' };
    if (p === 'High') return { bg: 'var(--amber-dim)', color: 'var(--amber)' };
    if (p === 'Medium') return { bg: 'var(--ac-dim)', color: 'var(--ac2)' };
    return { bg: 'var(--sf2)', color: 'var(--tx3)' };
  };

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <style>{TASKS_CSS}</style>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--tx)' }}>
          {t('nav.tasks')}
        </span>
        <span style={{
          fontSize: 'var(--fs-2xs)', fontWeight: 700, padding: '2px 10px',
          borderRadius: 9999, background: 'var(--ac)', color: 'var(--ac-on)',
        }}>
          {filteredIssues.length}
        </span>
        <button onClick={() => onOpenLog({})} style={{
          marginLeft: 'auto', padding: '6px 16px', borderRadius: 6, border: 'none',
          background: 'var(--ac)', color: 'var(--ac-on)', fontSize: 'var(--fs-2xs)',
          fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          {t('jiraTracker.logHours')}
        </button>
      </div>

      {/* ── Bento Stats ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12 }}>
        <StatCard label={t('jiraTracker.totalHours', 'TOTAL HOURS')} value={`${stats.totalH.toFixed(1)}h`} color="var(--ac)" icon="schedule" />
        <StatCard label={t('jiraTracker.activeTasks', 'ACTIVE TASKS')} value={stats.activeTasks} color="var(--green)" icon="task_alt" />
        <StatCard label={t('jiraTracker.topProject', 'TOP PROJECT')} value={stats.topProject} color="var(--purple)" icon="folder" />
      </div>

      {/* ── Filters ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bg)', border: '1px solid var(--bd)',
          borderRadius: 5, padding: '5px 10px', maxWidth: 220,
        }}>
          <Icon name="search" size={16} style={{ color: 'var(--tx3)' }} />
          <input
            type="search"
            placeholder={t('jiraTracker.searchPlaceholder')}
            value={sr}
            onChange={e => ssr(e.target.value)}
            style={{
              background: 'none', border: 'none', outline: 'none',
              color: 'var(--tx)', fontSize: 'var(--fs-2xs)', fontFamily: 'inherit', width: 140,
            }}
          />
        </div>

        {/* Type pills */}
        <button
          className={`tv-pill-filter ${tf.length === 0 ? 'on' : 'off'}`}
          onClick={() => stf([])}
        >
          {t('jiraTracker.all', 'All')}
        </button>
        {allTypes.map(ty => (
          <button
            key={ty}
            className={`tv-pill-filter ${tf.includes(ty) ? 'on' : 'off'}`}
            onClick={() => stf(f => f.includes(ty) ? f.filter(x => x !== ty) : [...f, ty])}
          >
            {ty}
          </button>
        ))}
      </div>

      {/* ── Empty state ────────────────────────────────────────────── */}
      {filteredIssues.length === 0 && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
          color: 'var(--tx3)', opacity: 0.7,
        }}>
          <Icon name="search_off" size={36} weight={200} style={{ color: 'var(--tx3)' }} />
          <span style={{ fontSize: 'var(--fs-xs)' }}>{t('common.noResults')}</span>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────── */}
      {filteredIssues.length > 0 && (
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', minHeight: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-xs)', tableLayout: 'auto' }}>
            <thead>
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                    style={{
                      ...thStyle,
                      cursor: col.sortable ? 'pointer' : 'default',
                      position: 'sticky', top: 0, zIndex: 1,
                    }}
                  >
                    {col.label(t)}
                    {col.sortable && (
                      <span style={{ marginLeft: 4, fontSize: 'var(--fs-2xs)', color: so.key === col.key ? 'var(--ac2)' : 'var(--tx3)' }}>
                        {so.key === col.key ? (so.dir === 'asc' ? '↑' : '↓') : '⇅'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredIssues.map((i: any, idx: number) => {
                const sc = statusColor(i.status);
                const pri = priorityColor(i.priority);
                return (
                  <tr key={i.key || idx} className="tv-row">
                    <td style={tdStyle}>
                      <span style={{ color: 'var(--ac2)', fontSize: 'var(--fs-2xs)', fontWeight: 600, fontFamily: 'var(--mono)' }}>{i.key}</span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ color: 'var(--tx2)', fontSize: 'var(--fs-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
                        {i.summary}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: 'var(--fs-2xs)', padding: '2px 6px', borderRadius: 4,
                        border: '1px solid var(--bd2)', color: 'var(--tx2)',
                      }}>{i.type}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: 'var(--fs-2xs)', fontWeight: 600, padding: '2px 8px',
                        borderRadius: 9999, background: sc.bg, color: sc.color,
                      }}>{i.status}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: 'var(--fs-2xs)', fontWeight: 600, padding: '2px 8px',
                        borderRadius: 9999, background: pri.bg, color: pri.color,
                      }}>{i.priority}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>{i.project}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--purple)', fontWeight: 500 }}>{i.epicName || i.epic || '—'}</span>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--green)', fontWeight: 500 }}>
                      {TimeParser.format(hoursByIssue[i.key] || 0)}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <button onClick={() => onOpenLog({ issueKey: i.key })} style={{
                        padding: '3px 10px', borderRadius: 5, border: 'none',
                        background: 'var(--ac)', color: 'var(--ac-on)',
                        fontSize: 'var(--fs-2xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        marginRight: 6,
                      }}>
                        {t('jiraTracker.btnHours')}
                      </button>
                      <button onClick={() => onOpenLog({ issueKey: i.key, editWorklog: { id: '', issue: i.key, seconds: hoursByIssue[i.key] || 0, started: '09:00', description: '' } })} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 'var(--icon-xs)', color: 'var(--tx)', padding: '2px 4px',
                      }} title={t('common.edit', 'Edit')}>✎</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Stat card ────────────────────────────────────────────────────────── */

function StatCard({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: string }) {
  return (
    <div style={{
      flex: 1, borderRadius: 8, background: 'var(--sf)',
      padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={14} weight={300} style={{ color, opacity: 0.7 }} />
        <span style={{
          fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--tx3)',
          letterSpacing: '0.05em', textTransform: 'uppercase',
        }}>{label}</span>
      </div>
      <div style={{
        fontSize: 'var(--fs-xl)', fontWeight: 600, color, letterSpacing: '-0.02em', lineHeight: 1,
      }}>{value}</div>
    </div>
  );
}

/* ─── Column definitions ───────────────────────────────────────────────── */

const columns = [
  { key: 'key', sortable: true, label: (t: any) => t('jiraTracker.colKey') },
  { key: 'summary', sortable: true, label: (t: any) => t('jiraTracker.colSummary') },
  { key: 'type', sortable: false, label: (t: any) => t('jiraTracker.colType') },
  { key: 'status', sortable: true, label: (t: any) => t('jiraTracker.colStatus') },
  { key: 'priority', sortable: true, label: (t: any) => t('jiraTracker.colPriority') },
  { key: 'project', sortable: false, label: (t: any) => t('jiraTracker.colProject') },
  { key: 'epic', sortable: true, label: (t: any) => t('jiraTracker.colEpic') },
  { key: 'hours', sortable: true, label: (t: any) => t('jiraTracker.colTime') },
  { key: 'action', sortable: false, label: () => '' },
];

/* ─── Shared styles ────────────────────────────────────────────────────── */

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left',
  fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--tx3)',
  letterSpacing: '0.05em', textTransform: 'uppercase',
  background: 'var(--sf)', borderBottom: '1px solid var(--bd)',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 10px', borderBottom: '1px solid var(--bd)',
  verticalAlign: 'middle',
};
