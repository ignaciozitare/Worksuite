// @ts-nocheck
/**
 * ReleaseDetail — per-release repo cards view.
 *
 * Groups tickets by repo, lets the user bump per-ticket status (which
 * syncs to Jira via the `jiraTransition` prop), shows a progress summary
 * and a subtask table. It also detects repos blocked by overlapping
 * active releases (via repo groups).
 *
 * External side effects arrive through props so this view is decoupled
 * from the Supabase repo and the Jira API adapter.
 */
import { useState } from 'react';
import { BugIcon } from '@worksuite/ui';
import { SubtaskService } from '../../domain/services/SubtaskService';
import { datesOverlap } from './helpers';
import { TICKET_STATUS_CFG, TICKET_STATUSES, MERGE_READY } from './constants';
import { SLabel } from './atoms';

export function ReleaseDetail({
  rel,
  tickets,
  statusCfg,
  repoGroups,
  allReleases,
  onBack,
  onUpdRelease,
  isLight,
  classifiedSubs = [],
  jiraBaseUrl = '',
  onRefreshSubtasks,
  /** Persists a partial patch for the release (snake_case shape). */
  onPersistTicketStatuses,
  /** Pushes a ticket transition to Jira. Returns {ok, error?}. */
  jiraTransition,
}) {
  const [ticketStatuses, setTicketStatuses] = useState(rel.ticket_statuses || {});
  const [syncing, setSyncing] = useState({});
  const [closing, setClosing] = useState(false);
  const [targetStatus, setTargetStatus] = useState('');

  // Group tickets by repo
  const relTickets = (rel.ticket_ids || []).map(k => tickets.find(t => t.key === k)).filter(Boolean);
  const tMap       = Object.fromEntries(tickets.map(t => [t.key, t]));
  const allRepos   = [...new Set(relTickets.flatMap(t => t.repos || []))].sort();
  const byRepo     = {};
  allRepos.forEach(r => { byRepo[r] = relTickets.filter(t => t.repos?.includes(r)); });

  const getStatus = (key) => ticketStatuses[key] || 'in_progress';

  // Detect which repos are blocked by other active releases (via repo groups)
  // Blocks "Merged to master" status specifically
  const mergeBlockers = []; // { repo, groupName, otherRelease, otherStatus }
  for (const group of (repoGroups || [])) {
    const myGroupRepos = allRepos.filter(r => group.repos.includes(r));
    if (myGroupRepos.length === 0) continue;
    for (const other of (allReleases || [])) {
      if (other.id === rel.id) continue;
      if (other.status === 'Deployed' || other.status === 'Rollback') continue;
      // Only block if date ranges overlap
      if (!datesOverlap(rel.start_date, rel.end_date, other.start_date, other.end_date)) continue;
      const otherRepos = [...new Set((other.ticket_ids || []).flatMap(k => tMap[k]?.repos || []))];
      for (const repo of myGroupRepos) {
        if (otherRepos.includes(repo) && !mergeBlockers.find(b => b.repo === repo)) {
          mergeBlockers.push({ repo, groupName: group.name, otherRelease: other.release_number || 'sin versión', otherStatus: other.status || 'Planned' });
        }
      }
    }
  }

  const handleStatusChange = async (key, newStatus) => {
    // Optimistic update
    const updated = { ...ticketStatuses, [key]: newStatus };
    setTicketStatuses(updated);
    setSyncing(s => ({ ...s, [key]: true }));

    // Persist via callback so we stay decoupled from the Supabase client
    if (onPersistTicketStatuses) {
      await onPersistTicketStatuses(rel.id, updated);
    }
    onUpdRelease({ ticket_statuses: updated });

    // Sync to Jira (optional)
    if (jiraTransition) {
      const result = await jiraTransition(key, newStatus);
      if (!result?.ok) console.warn(`Jira sync failed for ${key}: ${result?.error}`);
    }
    setSyncing(s => ({ ...s, [key]: false }));
  };

  const handleCloseRelease = async () => {
    if (!targetStatus || closing) return;
    setClosing(true);
    await onUpdRelease({ status: targetStatus });
    setTimeout(() => { setClosing(false); onBack(); }, 600);
  };

  // Final state check
  const allReady = allRepos.every(r => (byRepo[r] || []).every(t => MERGE_READY.includes(getStatus(t.key))));
  const readyCount = relTickets.filter(t => MERGE_READY.includes(getStatus(t.key))).length;
  const finalStatuses = Object.entries(statusCfg).filter(([, v]) => v.is_final);

  const relCfg = statusCfg[rel.status] || { color: '#6b7280', bg_color: 'rgba(107,114,128,.12)', border: '#1f2937' };

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--dp-tx3,#64748b)', cursor: 'pointer', fontSize: 11, marginBottom: 12, padding: 0, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
          ← Volver a Planning
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: 'var(--dp-tx3,#334155)', letterSpacing: '.1em', textTransform: 'uppercase' }}>Release</span>
              {rel.start_date && rel.end_date && <><span style={{ fontSize: 9, color: 'var(--dp-bd,#1e293b)' }}>·</span><span style={{ fontSize: 9, color: 'var(--dp-tx3,#334155)' }}>{rel.start_date} → {rel.end_date}</span></>}
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--dp-tx,#e6edf3)', marginBottom: 4 }}>{rel.release_number || 'Sin versión'}</h1>
            {rel.description && <p style={{ fontSize: 11, color: 'var(--dp-tx2,#475569)' }}>{rel.description}</p>}
          </div>
          {/* Global progress */}
          <div style={{ background: 'var(--dp-sf,#0b0f18)', border: '1px solid var(--dp-bd,#1e293b)', borderRadius: 8, padding: '12px 16px', minWidth: 150, textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: allReady ? '#34d399' : 'var(--dp-tx,#e6edf3)', lineHeight: 1 }}>
              {readyCount}<span style={{ fontSize: 13, color: 'var(--dp-tx3,#334155)' }}>/{relTickets.length}</span>
            </div>
            <SLabel style={{ marginTop: 4 }}>Tickets listos</SLabel>
            <div style={{ height: 3, background: 'var(--dp-bd,#1e293b)', borderRadius: 2, overflow: 'hidden', marginTop: 7 }}>
              <div style={{ width: `${relTickets.length ? readyCount / relTickets.length * 100 : 0}%`, height: '100%', background: allReady ? '#34d399' : '#3b82f6', borderRadius: 2, transition: 'width .4s ease' }} />
            </div>
          </div>
        </div>

        {/* Repo pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {allRepos.map(repo => {
            const rTickets = byRepo[repo] || [], ready = rTickets.filter(t => MERGE_READY.includes(getStatus(t.key))).length, ok = ready === rTickets.length;
            return <div key={repo} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: ok ? 'rgba(52,211,153,.08)' : 'var(--dp-sf2,rgba(56,189,248,.06))', border: `1px solid ${ok ? 'rgba(52,211,153,.3)' : 'var(--dp-bd,#1e293b)'}`, fontSize: 10, color: ok ? '#34d399' : 'var(--dp-tx3,#64748b)' }}>
              {ok ? '✓' : '○'} {repo} <span style={{ color: 'var(--dp-tx3,#334155)', fontSize: 9 }}>{ready}/{rTickets.length}</span>
            </div>;
          })}
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--dp-bd,#0e1520)', marginBottom: 24 }} />

      {/* Repo cards */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 28 }}>
        {/* Empty state — tickets not loaded from Jira yet */}
        {allRepos.length === 0 && (
          <div style={{ width: '100%', padding: '32px 24px', background: 'var(--dp-sf,#0b0f18)', border: '1px dashed var(--dp-bd,#1e293b)', borderRadius: 8, textAlign: 'center' }}>
            {(rel.ticket_ids || []).length === 0 ? (
              <>
                <div style={{ fontSize: 20, marginBottom: 8 }}>📋</div>
                <div style={{ fontSize: 13, color: 'var(--dp-tx2,#94a3b8)', marginBottom: 4 }}>Sin tickets asignados</div>
                <div style={{ fontSize: 11, color: 'var(--dp-tx3,#475569)' }}>Ve a Planning y arrastra tickets a esta release</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 20, marginBottom: 8 }}>🔄</div>
                <div style={{ fontSize: 13, color: 'var(--dp-tx2,#94a3b8)', marginBottom: 4 }}>{(rel.ticket_ids || []).length} tickets asignados — sin datos de repo</div>
                <div style={{ fontSize: 11, color: 'var(--dp-tx3,#475569)' }}>
                  Los tickets necesitan el campo <strong style={{ color: 'var(--dp-tx2,#94a3b8)' }}>Components</strong> en Jira para agruparse por repositorio.<br />
                  Revisa que los tickets tienen componentes asignados en Jira.
                </div>
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(rel.ticket_ids || []).map(k => (
                    <div key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--dp-sf2,#07090f)', border: '1px solid var(--dp-bd,#1e293b)', borderRadius: 6, fontSize: 11, color: 'var(--dp-tx2,#94a3b8)' }}>
                      <span style={{ color: '#38bdf8', fontWeight: 700 }}>{k}</span>
                      <span style={{ fontSize: 9, color: 'var(--dp-tx3,#475569)' }}>sin componente</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {allRepos.map(repo => {
          const rTickets = byRepo[repo] || [];
          const ready = rTickets.filter(t => MERGE_READY.includes(getStatus(t.key))).length;
          const allOk = ready === rTickets.length;
          const someOk = ready > 0;
          const borderColor = allOk ? '#34d399' : someOk ? '#f59e0b' : 'var(--dp-bd,#1e293b)';
          const topColor = allOk ? '#34d399' : someOk ? '#f59e0b' : 'var(--dp-tx3,#334155)';
          return (
            <div key={repo} className="anim-in" style={{ width: 300, background: 'var(--dp-sf,#0b0f18)', border: `1px solid ${borderColor}`, borderTop: `2px solid ${topColor}`, borderRadius: 8, flexShrink: 0, transition: 'border-color .3s' }}>
              {/* Repo header */}
              <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--dp-bd,#0e1520)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: 5, background: allOk ? 'rgba(52,211,153,.15)' : 'rgba(56,189,248,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: allOk ? '#34d399' : '#38bdf8' }}>{allOk ? '✓' : '⬡'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dp-tx,#e6edf3)' }}>{repo}</div>
                  <div style={{ fontSize: 9, color: 'var(--dp-tx3,#334155)', marginTop: 1 }}>{ready}/{rTickets.length} listos</div>
                </div>
                <div style={{ width: 44, height: 4, background: 'var(--dp-bd,#1e293b)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${rTickets.length ? ready / rTickets.length * 100 : 0}%`, height: '100%', background: allOk ? '#34d399' : someOk ? '#f59e0b' : '#334155', borderRadius: 2, transition: 'width .4s' }} />
                </div>
                {allOk && <span style={{ fontSize: 9, color: '#34d399', fontWeight: 700 }}>LISTO</span>}
              </div>

              {/* Tickets */}
              {rTickets.map((ticket, i) => {
                const st = getStatus(ticket.key);
                const stCfg = TICKET_STATUS_CFG[st] || TICKET_STATUS_CFG.in_progress;
                const isReady = MERGE_READY.includes(st);
                const isSyncing = syncing[ticket.key];
                const PCOLOR = { Highest: '#ef4444', High: '#f97316', Medium: '#3b82f6', Low: '#6b7280' };
                return (
                  <div key={ticket.key} style={{ padding: '10px 14px', borderBottom: i < rTickets.length - 1 ? '1px solid var(--dp-bd,#0a0e14)' : 'none', opacity: isReady ? .7 : 1, transition: 'opacity .2s' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: PCOLOR[ticket.priority] || '#64748b', marginTop: 4, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#38bdf8', flexShrink: 0 }}>{ticket.key}</span>
                          <span style={{ fontSize: 9, color: 'var(--dp-tx3,#334155)', background: 'var(--dp-sf2,#0d111a)', border: '1px solid var(--dp-bd,#1e293b)', borderRadius: 3, padding: '0 4px', flexShrink: 0 }}>{ticket.type || 'Task'}</span>
                          {isSyncing && <span className="spin" style={{ fontSize: 10, color: '#38bdf8' }}>⟳</span>}
                        </div>
                        <div style={{ fontSize: 10, color: isReady ? 'var(--dp-tx3,#475569)' : 'var(--dp-tx2,#94a3b8)', lineHeight: 1.4, textDecoration: isReady ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{ticket.summary}</div>
                        <div style={{ fontSize: 9, color: 'var(--dp-tx3,#334155)' }}>👤 {ticket.assignee || '—'}</div>
                      </div>
                    </div>
                    <select value={st} onChange={e => handleStatusChange(ticket.key, e.target.value)}
                      style={{ width: '100%', background: stCfg.bg, border: `1px solid ${stCfg.color}40`, borderRadius: 4, padding: '4px 8px', fontSize: 10, color: stCfg.color, cursor: 'pointer', outline: 'none', fontWeight: 700, fontFamily: 'inherit', transition: 'all .2s' }}>
                      {TICKET_STATUSES.map(s => <option key={s} value={s}>{TICKET_STATUS_CFG[s].icon} {TICKET_STATUS_CFG[s].label}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Release status info */}
      <div style={{ background: 'var(--dp-sf,#0b0f18)', border: '1px solid var(--dp-bd,#1e293b)', borderRadius: 8, padding: '18px 20px' }}>
        <SLabel style={{ marginBottom: 12 }}>Estado de la Release</SLabel>

        {/* Tickets pendientes */}
        {!allReady && (
          <div style={{ padding: '8px 12px', background: 'rgba(248,113,113,.06)', border: '1px solid #7f1d1d', borderRadius: 6, fontSize: 10, color: '#f87171', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ Hay tickets pendientes en:</div>
            {allRepos.filter(r => (byRepo[r] || []).some(t => !MERGE_READY.includes(getStatus(t.key)))).map(r => {
              const pending = (byRepo[r] || []).filter(t => !MERGE_READY.includes(getStatus(t.key))).length;
              return <div key={r} style={{ marginTop: 2 }}>· <span style={{ color: '#ef4444' }}>{r}</span> — {pending} ticket{pending > 1 ? 's' : ''} pendiente{pending > 1 ? 's' : ''}</div>;
            })}
          </div>
        )}

        <div style={{ marginTop: 8, fontSize: 9, color: 'var(--dp-tx3,#64748b)' }}>
          Estados configurables desde Admin → Deploy Config
        </div>
      </div>

      {/* ── Subtask table ──────────────────────────────────────── */}
      {(() => {
        const relSubs = classifiedSubs.filter(s => (rel.ticket_ids || []).includes(s.parentKey));
        if (!relSubs.length) return null;
        const counts = SubtaskService.count(relSubs);
        return (
          <div style={{ background: 'var(--dp-sf,#0b0f18)', border: '1px solid var(--dp-bd,#1e293b)', borderRadius: 8, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <SLabel>Subtareas</SLabel>
              <span style={{ fontSize: 10, color: 'var(--dp-tx2,#94a3b8)' }}>{relSubs.length} total</span>
              {counts.bugs.total > 0 && <span style={{ fontSize: 10, color: counts.bugs.open > 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}><BugIcon size={12} color="currentColor" />{counts.bugs.closed}/{counts.bugs.total}</span>}
              {counts.tests.total > 0 && <span style={{ fontSize: 10, color: counts.tests.open > 0 ? '#3b82f6' : '#22c55e', fontWeight: 600 }}>🧪 {counts.tests.closed}/{counts.tests.total}</span>}
              {onRefreshSubtasks && <button onClick={onRefreshSubtasks}
                style={{ marginLeft: 'auto', background: 'var(--dp-sf2,#07090f)', border: '1px solid var(--dp-bd,#1e293b)', borderRadius: 4, padding: '3px 10px', fontSize: 9, color: 'var(--dp-tx2,#94a3b8)', cursor: 'pointer', fontFamily: 'inherit' }}>
                🔄 Actualizar
              </button>}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--dp-bd,#0e1520)' }}>
                {['CLAVE', 'TIPO', 'RESUMEN', 'ESTADO', 'ASIGNADO', 'PADRE'].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--dp-tx3,#64748b)', fontWeight: 600, letterSpacing: '.06em', fontSize: 9 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {relSubs.sort((a, b) => a.category.localeCompare(b.category) || a.type.localeCompare(b.type)).map(st => (
                  <tr key={st.key} style={{ borderBottom: '1px solid var(--dp-bd,#0d111a)' }}>
                    <td style={{ padding: '8px 10px' }}>{jiraBaseUrl
                      ? <a href={`${jiraBaseUrl}/browse/${st.key}`} target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', fontWeight: 700, textDecoration: 'none' }}>{st.key}</a>
                      : <span style={{ color: '#38bdf8', fontWeight: 700 }}>{st.key}</span>
                    }</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        padding: '2px 7px', borderRadius: 10, fontSize: 9, fontWeight: 600,
                        background: st.category === 'bug' ? 'rgba(239,68,68,.12)' : st.category === 'test' ? 'rgba(59,130,246,.12)' : 'rgba(100,116,139,.12)',
                        color: st.category === 'bug' ? '#ef4444' : st.category === 'test' ? '#3b82f6' : 'var(--dp-tx3,#64748b)',
                      }}>
                        {st.category === 'bug' ? '🐛' : '🧪'} {st.type}{st.testType ? ` (${st.testType})` : ''}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--dp-tx,#e6edf3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.summary}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        padding: '2px 7px', borderRadius: 10, fontSize: 9, fontWeight: 600,
                        background: st.isClosed ? 'rgba(34,197,94,.12)' : 'rgba(245,158,11,.12)',
                        color: st.isClosed ? '#22c55e' : '#f59e0b',
                      }}>
                        {st.isClosed ? '✓' : '○'} {st.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--dp-tx2,#94a3b8)' }}>{st.assignee || '—'}</td>
                    <td style={{ padding: '8px 10px' }}><span style={{ color: 'var(--dp-tx3,#64748b)', fontFamily: 'monospace' }}>{st.parentKey}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}
