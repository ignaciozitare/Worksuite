import React, { useState, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { TimeParser } from '../domain/services/TimeParser';
import { WorklogService } from '../domain/services/WorklogService';
import { MOCK_ISSUES_FALLBACK, MOCK_PROJECTS_FALLBACK } from '@/shared/lib/fallbackData';

interface TasksViewProps {
  filters: any;
  onOpenLog: (opts: any) => void;
  worklogs: Record<string, any[]>;
  jiraIssues?: any[];
  jiraProjects?: any[];
}

export function TasksView({ filters, onOpenLog, worklogs, jiraIssues, jiraProjects }: TasksViewProps) {
  const { t } = useTranslation();
  const issues = jiraIssues || MOCK_ISSUES_FALLBACK;

  const [tf, stf] = useState<string[]>([]);
  const [sr, ssr] = useState("");
  const [so, sso] = useState({key:"key",dir:"asc"});
  const [recentOpen, setRecentOpen] = useState(true);

  // ── Filter worklogs by date range + author ──────────────────────────────────
  const rangeWorklogs = useMemo(() => {
    return WorklogService.filterByRange(worklogs, filters.from, filters.to, filters.authorId || null);
  }, [worklogs, filters.from, filters.to, filters.authorId]);

  // ── Hours by issue ONLY within the filtered range ───────────────────────────
  const hoursByIssue = useMemo(() => {
    const map: Record<string, number> = {};
    for (const dayWls of Object.values(rangeWorklogs)) {
      for (const wl of dayWls) {
        map[wl.issue] = (map[wl.issue] || 0) + wl.seconds;
      }
    }
    return map;
  }, [rangeWorklogs]);

  // ── Only show issues that have worklogs in the range ────────────────────────
  const filteredIssues = useMemo(() => {
    // Start with issues that have hours in the range
    let l = issues.filter(i => hoursByIssue[i.key] > 0);
    // Apply project filter
    if (filters.spaceKeys.length) l = l.filter(i => filters.spaceKeys.includes(i.project));
    // Apply type filter
    if (tf.length) l = l.filter(i => tf.includes(i.type));
    // Apply search
    if (sr) {
      const q = sr.toLowerCase();
      l = l.filter(i =>
        i.key.toLowerCase().includes(q) ||
        i.summary.toLowerCase().includes(q) ||
        (i.assignee || "").toLowerCase().includes(q)
      );
    }
    // Sort
    return [...l].sort((a, b) => {
      const d = so.dir === "asc" ? 1 : -1;
      if (so.key === "hours") return ((hoursByIssue[a.key] || 0) - (hoursByIssue[b.key] || 0)) * d;
      return (a[so.key] ?? "").localeCompare(b[so.key] ?? "") * d;
    });
  }, [issues, filters, tf, sr, so, hoursByIssue]);

  // ── Stats from filtered range ───────────────────────────────────────────────
  const stats = useMemo(() => {
    const aWls = Object.values(rangeWorklogs).flat();
    const totalH = TimeParser.toHours(aWls.reduce((s, w) => s + w.seconds, 0));
    const actD = Object.keys(rangeWorklogs).length;
    return { totalH, actD };
  }, [rangeWorklogs]);

  // ── Recent 20 tasks (independent of filters) ───────────────────────────────
  const recentTasks = useMemo(() => {
    const all: { issue: string; summary: string; date: string; seconds: number }[] = [];
    for (const [date, dayWls] of Object.entries(worklogs || {})) {
      for (const wl of dayWls) {
        all.push({ issue: wl.issue, summary: wl.summary || wl.issue, date, seconds: wl.seconds });
      }
    }
    // Sort by date desc, then deduplicate by issue key (keep most recent)
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

  const ts = (k: string) => sso(s => s.key === k ? { ...s, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" });
  const A = ({ k }: { k: string }) => so.key !== k ? <span style={{ fontSize: 9, color: "var(--tx3)" }}>⇅</span> : <span style={{ fontSize: 9, color: "var(--ac2)" }}>{so.dir === "asc" ? "↑" : "↓"}</span>;
  const pc = (p: string) => p === "Critical" ? "p-crit" : p === "High" ? "p-high" : p === "Medium" ? "p-med" : "p-low";
  const pt = [...new Set(filteredIssues.map(i => i.type))];

  const sc = (s: string) => {
    const sl = (s || '').toLowerCase();
    if (sl.includes('done') || sl.includes('cerrad') || sl.includes('complet') || sl.includes('resuelto')) return 's-done';
    if (sl.includes('progress') || sl.includes('curso') || sl.includes('proceso') || sl.includes('review') || sl.includes('testing')) return 's-prog';
    return 's-todo';
  };

  return (
    <div style={{ display: 'flex', gap: 0, height: '100%' }}>
      {/* ── Main content ──────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tk-h">
          <div className="tk-t">{t("nav.tasks")}</div>
          <div className="c-bdg">{filteredIssues.length}</div>
          <button className="btn-log" style={{ marginLeft: "auto" }} onClick={() => onOpenLog({})}>{t("jiraTracker.logHours")}</button>
        </div>
        <div className="cal-stats" style={{ marginBottom: 12 }}>
          <div className="chip">{t("jiraTracker.totalLabel")}: <strong>{stats.totalH.toFixed(1)}h</strong></div>
          <div className="chip">{t("jiraTracker.activeDays")}: <strong>{stats.actD}</strong></div>
          {stats.actD > 0 && <div className="chip">{t("jiraTracker.avgLabel")}: <strong>{(stats.totalH / stats.actD).toFixed(1)}{t("jiraTracker.perDay")}</strong></div>}
        </div>
        <div className="f-row">
          <input className="fi" style={{ maxWidth: 220 }} type="search" placeholder={t("jiraTracker.searchPlaceholder")} value={sr} onChange={e => ssr(e.target.value)} />
          {pt.map(ty => <button key={ty} className={`pill ${tf.includes(ty) ? "on" : ""}`} onClick={() => stf(f => f.includes(ty) ? f.filter(x => x !== ty) : [...f, ty])}>{ty}</button>)}
          {tf.length > 0 && <button className="btn-g" onClick={() => stf([])}>{t("jiraTracker.clearFilter")}</button>}
        </div>
        {filteredIssues.length === 0 && <div className="empty"><div className="empty-i">🔍</div><div>{t("common.noResults")}</div></div>}
        {filteredIssues.length > 0 && <div style={{ overflowX: "auto" }}><table><thead><tr>
          <th onClick={() => ts("key")}>{t("jiraTracker.colKey")} <A k="key" /></th>
          <th onClick={() => ts("summary")}>{t("jiraTracker.colSummary")} <A k="summary" /></th>
          <th>{t("jiraTracker.colType")}</th>
          <th onClick={() => ts("status")}>{t("jiraTracker.colStatus")} <A k="status" /></th>
          <th onClick={() => ts("priority")}>{t("jiraTracker.colPriority")} <A k="priority" /></th>
          <th>{t("jiraTracker.colProject")}</th>
          <th>{t("jiraTracker.colAssignee")}</th>
          <th>{t("jiraTracker.colEpic")}</th>
          <th onClick={() => ts("hours")} title="Horas en el rango seleccionado">{t("jiraTracker.colTime")} <A k="hours" /></th>
          <th>{t("jiraTracker.colAction")}</th>
        </tr></thead><tbody>{filteredIssues.map((i, idx) => {
          return <tr key={i.key || idx}>
            <td><span className="ik">{i.key}</span></td>
            <td><div className="ism">{i.summary}</div><div style={{ marginTop: 2 }}>{(i.labels || []).slice(0, 3).map((l: string) => <span key={l} className="tag">{l}</span>)}</div></td>
            <td><span className="t-pill">{i.type}</span></td>
            <td><span className={`s-b ${sc(i.status)}`}>{i.status}</span></td>
            <td><span className={pc(i.priority)}>{i.priority}</span></td>
            <td><span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--tx3)" }}>{i.project}</span></td>
            <td style={{ fontSize: 11 }}>{i.assignee}</td>
            <td><span className="er">{i.epic}</span></td>
            <td className="hc">{TimeParser.format(hoursByIssue[i.key] || 0)}</td>
            <td><button className="btn-log btn-log-sm" onClick={() => onOpenLog({ issueKey: i.key })}>{t("jiraTracker.btnHours")}</button></td>
          </tr>;
        })}</tbody></table></div>}
      </div>

      {/* ── Right sidebar: recent tasks ───────────────────────────── */}
      <div style={{
        width: recentOpen ? 220 : 32, flexShrink: 0, transition: 'width .2s',
        borderLeft: '1px solid var(--bd)', background: 'var(--sf)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <button onClick={() => setRecentOpen(v => !v)} style={{
          background: 'none', border: 'none', borderBottom: '1px solid var(--bd)',
          cursor: 'pointer', padding: '10px 8px', color: 'var(--tx3)',
          fontSize: 11, fontWeight: 700, fontFamily: 'inherit', textAlign: 'center',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        }}>
          {recentOpen ? '›' : '‹'}
          {recentOpen && <span style={{ letterSpacing: '.04em', textTransform: 'uppercase' }}>Recientes</span>}
        </button>
        {recentOpen && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px' }}>
            {recentTasks.map(rt => (
              <div key={rt.issue}
                onClick={() => onOpenLog({ issueKey: rt.issue })}
                style={{
                  padding: '8px 8px', borderRadius: 6, cursor: 'pointer',
                  marginBottom: 4, transition: 'background .1s',
                  borderLeft: '2px solid var(--ac,#4f6ef7)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--sf2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ac2,#7c9aff)', fontFamily: 'var(--mono)' }}>{rt.issue}</div>
                <div style={{ fontSize: 10, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{rt.summary}</div>
                <div style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2, opacity: 0.7 }}>{rt.date}</div>
              </div>
            ))}
            {recentTasks.length === 0 && (
              <div style={{ fontSize: 10, color: 'var(--tx3)', textAlign: 'center', padding: '16px 0' }}>Sin imputaciones</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
