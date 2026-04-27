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
import { SubtaskService, type ClassifiedSubtask } from '../../domain/services/SubtaskService';
import { datesOverlap } from './helpers';
import { TICKET_STATUS_CFG, TICKET_STATUSES, MERGE_READY } from './constants';
import { SLabel } from './atoms';
import type { Release, DpTicket, StatusCfg, RepoGroupView } from './types';

interface MergeBlocker {
  repo: string;
  groupName: string;
  otherRelease: string;
  otherStatus: string;
}

interface JiraTransitionResult {
  ok: boolean;
  error?: string;
}

interface ReleaseDetailProps {
  rel: Release;
  tickets: DpTicket[];
  statusCfg: StatusCfg;
  repoGroups: RepoGroupView[];
  allReleases: Release[];
  onBack: () => void;
  onUpdRelease: (patch: Partial<Release>) => void | Promise<void>;
  isLight?: boolean;
  classifiedSubs?: ClassifiedSubtask[];
  jiraBaseUrl?: string;
  onRefreshSubtasks?: () => void | Promise<void>;
  /** Persists a partial patch for the release (snake_case shape). */
  onPersistTicketStatuses?: (id: string, ticketStatuses: Record<string, string>) => void | Promise<void>;
  /** Pushes a ticket transition to Jira. Returns {ok, error?}. */
  jiraTransition?: (issueKey: string, appStatus: string) => Promise<JiraTransitionResult>;
}

const PRIORITY_COLOR: Record<string, string> = {
  Highest: '#ef4444',
  High:    '#f97316',
  Medium:  '#3b82f6',
  Low:     '#6b7280',
};

export function ReleaseDetail({
  rel,
  tickets,
  statusCfg,
  repoGroups,
  allReleases,
  onBack,
  onUpdRelease,
  classifiedSubs = [],
  jiraBaseUrl = '',
  onRefreshSubtasks,
  onPersistTicketStatuses,
  jiraTransition,
}: ReleaseDetailProps) {
  const [ticketStatuses, setTicketStatuses] = useState<Record<string, string>>(rel.ticket_statuses || {});
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});

  // Group tickets by repo
  const relTickets = (rel.ticket_ids ?? [])
    .map(k => tickets.find(t => t.key === k))
    .filter((t): t is DpTicket => Boolean(t));
  const tMap = new Map(tickets.map(t => [t.key, t]));
  const allRepos = [...new Set(relTickets.flatMap(t => t.repos ?? []))].sort();
  const byRepo: Record<string, DpTicket[]> = {};
  allRepos.forEach(r => { byRepo[r] = relTickets.filter(t => t.repos?.includes(r)); });

  const getStatus = (key: string): string => ticketStatuses[key] ?? 'in_progress';

  // Detect which repos are blocked by other active releases (via repo groups).
  // Blocks the "Merged to master" status specifically. Computed here so the
  // value is available for future UI hooks; today it's only part of the
  // reasoning surface for maintenance.
  const mergeBlockers: MergeBlocker[] = [];
  for (const group of repoGroups) {
    const myGroupRepos = allRepos.filter(r => group.repos.includes(r));
    if (myGroupRepos.length === 0) continue;
    for (const other of allReleases) {
      if (other.id === rel.id) continue;
      if (other.status === 'Deployed' || other.status === 'Rollback') continue;
      // Only block if date ranges overlap
      if (!datesOverlap(rel.start_date, rel.end_date, other.start_date, other.end_date)) continue;
      const otherRepos = [...new Set((other.ticket_ids ?? []).flatMap(k => tMap.get(k)?.repos ?? []))];
      for (const repo of myGroupRepos) {
        if (otherRepos.includes(repo) && !mergeBlockers.find(b => b.repo === repo)) {
          mergeBlockers.push({
            repo,
            groupName: group.name,
            otherRelease: other.release_number || 'sin versión',
            otherStatus: other.status || 'Planned',
          });
        }
      }
    }
  }
  // Reference so ts doesn't flag the unused variable even though we keep the
  // computation wired for future UI hooks.
  void mergeBlockers;

  const handleStatusChange = async (key: string, newStatus: string) => {
    // Optimistic update
    const updated = { ...ticketStatuses, [key]: newStatus };
    setTicketStatuses(updated);
    setSyncing(s => ({ ...s, [key]: true }));

    // Persist via callback so we stay decoupled from the Supabase client
    if (onPersistTicketStatuses) {
      await onPersistTicketStatuses(rel.id, updated);
    }
    void onUpdRelease({ ticket_statuses: updated });

    // Sync to Jira (optional)
    if (jiraTransition) {
      const result = await jiraTransition(key, newStatus);
      if (!result?.ok) console.warn(`Jira sync failed for ${key}: ${result?.error}`);
    }
    setSyncing(s => ({ ...s, [key]: false }));
  };

  // Final state check
  const allReady = allRepos.every(r => (byRepo[r] ?? []).every(t => MERGE_READY.includes(getStatus(t.key))));
  const readyCount = relTickets.filter(t => MERGE_READY.includes(getStatus(t.key))).length;

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--dp-tx3)', cursor: 'pointer', fontSize: 'var(--fs-2xs)', marginBottom: 12, padding: 0, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
          ← Volver a Planning
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3)', letterSpacing: '.1em', textTransform: 'uppercase' }}>Release</span>
              {rel.start_date && rel.end_date && (
                <>
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-bd)' }}>·</span>
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3)' }}>{rel.start_date} → {rel.end_date}</span>
                </>
              )}
            </div>
            <h1 style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--dp-tx)', marginBottom: 4 }}>{rel.release_number || 'Sin versión'}</h1>
            {rel.description && <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx2)' }}>{rel.description}</p>}
          </div>
          {/* Global progress */}
          <div style={{ background: 'var(--dp-sf)', border: '1px solid var(--dp-bd)', borderRadius: 8, padding: '12px 16px', minWidth: 150, textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: allReady ? '#34d399' : 'var(--dp-tx)', lineHeight: 1 }}>
              {readyCount}<span style={{ fontSize: 'var(--fs-xs)', color: 'var(--dp-tx3)' }}>/{relTickets.length}</span>
            </div>
            <SLabel style={{ marginTop: 4 }}>Tickets listos</SLabel>
            <div style={{ height: 3, background: 'var(--dp-bd)', borderRadius: 2, overflow: 'hidden', marginTop: 7 }}>
              <div style={{ width: `${relTickets.length ? readyCount / relTickets.length * 100 : 0}%`, height: '100%', background: allReady ? '#34d399' : '#3b82f6', borderRadius: 2, transition: 'width .4s ease' }} />
            </div>
          </div>
        </div>

        {/* Repo pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {allRepos.map(repo => {
            const rTickets = byRepo[repo] ?? [];
            const ready = rTickets.filter(t => MERGE_READY.includes(getStatus(t.key))).length;
            const ok = ready === rTickets.length;
            return (
              <div
                key={repo}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20,
                  background: ok ? 'rgba(52,211,153,.08)' : 'var(--dp-sf2,rgba(77,142,255,.06))',
                  border: `1px solid ${ok ? 'rgba(52,211,153,.3)' : 'var(--dp-bd)'}`,
                  fontSize: 'var(--fs-2xs)', color: ok ? '#34d399' : 'var(--dp-tx3)',
                }}
              >
                {ok ? '✓' : '○'} {repo} <span style={{ color: 'var(--dp-tx3)', fontSize: 'var(--fs-2xs)' }}>{ready}/{rTickets.length}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--dp-bd)', marginBottom: 24 }} />

      {/* Repo cards */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 28 }}>
        {/* Empty state — tickets not loaded from Jira yet */}
        {allRepos.length === 0 && (
          <div style={{ width: '100%', padding: '32px 24px', background: 'var(--dp-sf)', border: '1px dashed var(--dp-bd)', borderRadius: 8, textAlign: 'center' }}>
            {(rel.ticket_ids ?? []).length === 0 ? (
              <>
                <div style={{ fontSize: 'var(--fs-lg)', marginBottom: 8 }}>📋</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--dp-tx2)', marginBottom: 4 }}>Sin tickets asignados</div>
                <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3)' }}>Ve a Planning y arrastra tickets a esta release</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 'var(--fs-lg)', marginBottom: 8 }}>🔄</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--dp-tx2)', marginBottom: 4 }}>{(rel.ticket_ids ?? []).length} tickets asignados — sin datos de repo</div>
                <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3)' }}>
                  Los tickets necesitan el campo <strong style={{ color: 'var(--dp-tx2)' }}>Components</strong> en Jira para agruparse por repositorio.<br />
                  Revisa que los tickets tienen componentes asignados en Jira.
                </div>
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(rel.ticket_ids ?? []).map(k => (
                    <div key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--dp-sf2)', border: '1px solid var(--dp-bd)', borderRadius: 6, fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx2)' }}>
                      <span style={{ color: 'var(--dp-primary)', fontWeight: 700 }}>{k}</span>
                      <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3)' }}>sin componente</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {allRepos.map(repo => {
          const rTickets = byRepo[repo] ?? [];
          const ready = rTickets.filter(t => MERGE_READY.includes(getStatus(t.key))).length;
          const allOk = ready === rTickets.length;
          const someOk = ready > 0;
          const borderColor = allOk ? '#34d399' : someOk ? '#f59e0b' : 'var(--dp-bd)';
          const topColor = allOk ? '#34d399' : someOk ? '#f59e0b' : 'var(--dp-tx3)';
          return (
            <div key={repo} className="anim-in" style={{ width: 300, background: 'var(--dp-sf)', border: `1px solid ${borderColor}`, borderTop: `2px solid ${topColor}`, borderRadius: 8, flexShrink: 0, transition: 'border-color .3s' }}>
              {/* Repo header */}
              <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--dp-bd)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: 5, background: allOk ? 'rgba(52,211,153,.15)' : 'rgba(77,142,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-2xs)', color: allOk ? '#34d399' : 'var(--dp-primary)' }}>{allOk ? '✓' : '⬡'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--dp-tx)' }}>{repo}</div>
                  <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3)', marginTop: 1 }}>{ready}/{rTickets.length} listos</div>
                </div>
                <div style={{ width: 44, height: 4, background: 'var(--dp-bd)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${rTickets.length ? ready / rTickets.length * 100 : 0}%`, height: '100%', background: allOk ? '#34d399' : someOk ? '#f59e0b' : '#8c909f', borderRadius: 2, transition: 'width .4s' }} />
                </div>
                {allOk && <span style={{ fontSize: 'var(--fs-2xs)', color: '#34d399', fontWeight: 700 }}>LISTO</span>}
              </div>

              {/* Tickets */}
              {rTickets.map((ticket, i) => {
                const st = getStatus(ticket.key);
                const stCfg = TICKET_STATUS_CFG[st] ?? TICKET_STATUS_CFG['in_progress']!;
                const isReady = MERGE_READY.includes(st);
                const isSyncing = syncing[ticket.key];
                return (
                  <div key={ticket.key} style={{ padding: '10px 14px', borderBottom: i < rTickets.length - 1 ? '1px solid var(--dp-bd)' : 'none', opacity: isReady ? .7 : 1, transition: 'opacity .2s' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLOR[ticket.priority] ?? '#64748b', marginTop: 4, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                          <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--dp-primary)', flexShrink: 0 }}>{ticket.key}</span>
                          <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3)', background: 'var(--dp-sf2)', border: '1px solid var(--dp-bd)', borderRadius: 3, padding: '0 4px', flexShrink: 0 }}>{ticket.type || 'Task'}</span>
                          {isSyncing && <span className="spin" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-primary)' }}>⟳</span>}
                        </div>
                        <div style={{ fontSize: 'var(--fs-2xs)', color: isReady ? 'var(--dp-tx3)' : 'var(--dp-tx2)', lineHeight: 1.4, textDecoration: isReady ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{ticket.summary}</div>
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3)' }}>👤 {ticket.assignee || '—'}</div>
                      </div>
                    </div>
                    <select
                      value={st}
                      onChange={e => void handleStatusChange(ticket.key, e.target.value)}
                      style={{ width: '100%', background: stCfg.bg, border: `1px solid ${stCfg.color}40`, borderRadius: 4, padding: '4px 8px', fontSize: 'var(--fs-2xs)', color: stCfg.color, cursor: 'pointer', outline: 'none', fontWeight: 700, fontFamily: 'inherit', transition: 'all .2s' }}
                    >
                      {TICKET_STATUSES.map(s => {
                        const tsCfg = TICKET_STATUS_CFG[s];
                        return <option key={s} value={s}>{tsCfg?.icon} {tsCfg?.label}</option>;
                      })}
                    </select>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Release status info */}
      <div style={{ background: 'var(--dp-sf)', border: '1px solid var(--dp-bd)', borderRadius: 8, padding: '18px 20px' }}>
        <SLabel style={{ marginBottom: 12 }}>Estado de la Release</SLabel>

        {/* Tickets pendientes */}
        {!allReady && (
          <div style={{ padding: '8px 12px', background: 'rgba(248,113,113,.06)', border: '1px solid #7f1d1d', borderRadius: 6, fontSize: 'var(--fs-2xs)', color: '#f87171', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ Hay tickets pendientes en:</div>
            {allRepos.filter(r => (byRepo[r] ?? []).some(t => !MERGE_READY.includes(getStatus(t.key)))).map(r => {
              const pending = (byRepo[r] ?? []).filter(t => !MERGE_READY.includes(getStatus(t.key))).length;
              return <div key={r} style={{ marginTop: 2 }}>· <span style={{ color: '#ef4444' }}>{r}</span> — {pending} ticket{pending > 1 ? 's' : ''} pendiente{pending > 1 ? 's' : ''}</div>;
            })}
          </div>
        )}

        <div style={{ marginTop: 8, fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3)' }}>
          Estados configurables desde Admin → Deploy Config
        </div>
      </div>

      {/* ── Subtask table ──────────────────────────────────────── */}
      {(() => {
        const relSubs = classifiedSubs.filter(s => (rel.ticket_ids ?? []).includes(s.parentKey));
        if (!relSubs.length) return null;
        const counts = SubtaskService.count(relSubs);
        return (
          <div style={{ background: 'var(--dp-sf)', border: '1px solid var(--dp-bd)', borderRadius: 8, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <SLabel>Subtareas</SLabel>
              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx2)' }}>{relSubs.length} total</span>
              {counts.bugs.total > 0 && <span style={{ fontSize: 'var(--fs-2xs)', color: counts.bugs.open > 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}><BugIcon size={12} color="currentColor" />{counts.bugs.closed}/{counts.bugs.total}</span>}
              {counts.tests.total > 0 && <span style={{ fontSize: 'var(--fs-2xs)', color: counts.tests.open > 0 ? '#3b82f6' : '#22c55e', fontWeight: 600 }}>🧪 {counts.tests.closed}/{counts.tests.total}</span>}
              {onRefreshSubtasks && (
                <button
                  onClick={() => void onRefreshSubtasks()}
                  style={{ marginLeft: 'auto', background: 'var(--dp-sf2)', border: '1px solid var(--dp-bd)', borderRadius: 4, padding: '3px 10px', fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx2)', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  🔄 Actualizar
                </button>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-2xs)' }}>
              <thead><tr style={{ borderBottom: '1px solid var(--dp-bd)' }}>
                {['CLAVE', 'TIPO', 'RESUMEN', 'ESTADO', 'ASIGNADO', 'PADRE'].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--dp-tx3)', fontWeight: 600, letterSpacing: '.06em', fontSize: 'var(--fs-2xs)' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {relSubs.sort((a, b) => a.category.localeCompare(b.category) || a.type.localeCompare(b.type)).map(st => (
                  <tr key={st.key} style={{ borderBottom: '1px solid var(--dp-bd)' }}>
                    <td style={{ padding: '8px 10px' }}>{jiraBaseUrl
                      ? <a href={`${jiraBaseUrl}/browse/${st.key}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--dp-primary)', fontWeight: 700, textDecoration: 'none' }}>{st.key}</a>
                      : <span style={{ color: 'var(--dp-primary)', fontWeight: 700 }}>{st.key}</span>
                    }</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        padding: '2px 7px', borderRadius: 10, fontSize: 'var(--fs-2xs)', fontWeight: 600,
                        background: st.category === 'bug' ? 'rgba(239,68,68,.12)' : st.category === 'test' ? 'rgba(59,130,246,.12)' : 'rgba(100,116,139,.12)',
                        color: st.category === 'bug' ? '#ef4444' : st.category === 'test' ? '#3b82f6' : 'var(--dp-tx3)',
                      }}>
                        {st.category === 'bug' ? '🐛' : '🧪'} {st.type}{st.testType ? ` (${st.testType})` : ''}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--dp-tx)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.summary}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        padding: '2px 7px', borderRadius: 10, fontSize: 'var(--fs-2xs)', fontWeight: 600,
                        background: st.isClosed ? 'rgba(34,197,94,.12)' : 'rgba(245,158,11,.12)',
                        color: st.isClosed ? '#22c55e' : '#f59e0b',
                      }}>
                        {st.isClosed ? '✓' : '○'} {st.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--dp-tx2)' }}>{st.assignee || '—'}</td>
                    <td style={{ padding: '8px 10px' }}><span style={{ color: 'var(--dp-tx3)', fontFamily: 'monospace' }}>{st.parentKey}</span></td>
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
