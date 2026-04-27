/**
 * Metrics view — aggregate stats over releases, tickets, bugs and tests.
 * Pure presentational: all data comes from props.
 */
import { diffD } from './helpers';
import { SLabel } from './atoms';
import { SubtaskService, type ClassifiedSubtask } from '../../domain/services/SubtaskService';
import type { Release, DpTicket, StatusCfg } from './types';

interface MetricsProps {
  releases: Release[];
  tickets: DpTicket[];
  statusCfg: StatusCfg;
  classifiedSubs?: ClassifiedSubtask[];
}

export function Metrics({ releases, tickets, statusCfg, classifiedSubs = [] }: MetricsProps) {
  const tMap = new Map(tickets.map(t => [t.key, t]));
  const finalNames = Object.entries(statusCfg).filter(([, v]) => v.is_final).map(([n]) => n);
  const deployed  = releases.filter(r => r.status === 'Deployed');
  const rollbacks = releases.filter(r => r.status === 'Rollback');
  const finished  = releases.filter(r => finalNames.includes(r.status));
  const durations = finished
    .filter((r): r is Release & { start_date: string; end_date: string } =>
      r.start_date != null && r.end_date != null,
    )
    .map(r => diffD(r.start_date, r.end_date));
  const avgDur = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const successRate = finished.length ? Math.round(deployed.length / finished.length * 100) : 0;
  const allKeys = [...new Set(releases.flatMap(r => r.ticket_ids ?? []))];
  const tpr = releases.length ? (allKeys.length / releases.length).toFixed(1) : '0';
  const allRepos = [...new Set(allKeys.flatMap(k => tMap.get(k)?.repos ?? []))];

  const byMonth: Record<string, number> = {};
  releases.forEach(r => {
    if (!r.end_date) return;
    const m = r.end_date.slice(0, 7);
    byMonth[m] = (byMonth[m] ?? 0) + 1;
  });
  const months = Object.entries(byMonth).sort();
  const maxM = Math.max(...Object.values(byMonth), 1);

  const byType: Record<string, number> = {};
  allKeys.forEach(k => {
    const t = tMap.get(k);
    if (t) byType[t.type || 'Task'] = (byType[t.type || 'Task'] ?? 0) + 1;
  });
  const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1]);

  const repoCounts: Record<string, number> = {};
  allKeys.forEach(k => {
    (tMap.get(k)?.repos ?? []).forEach(r => { repoCounts[r] = (repoCounts[r] ?? 0) + 1; });
  });
  const repoEntries = Object.entries(repoCounts).sort((a, b) => b[1] - a[1]);
  const maxR = Math.max(...Object.values(repoCounts), 1);

  const totalCounts = SubtaskService.count(classifiedSubs);
  const bugRate = totalCounts.bugs.total > 0 ? Math.round(totalCounts.bugs.closed / totalCounts.bugs.total * 100) : 0;
  const testRate = totalCounts.tests.total > 0 ? Math.round(totalCounts.tests.closed / totalCounts.tests.total * 100) : 0;

  interface Stat { l: string; v: string | number; s: string; c: string; }
  const stats: Stat[] = [
    { l: 'TOTAL RELEASES',  v: releases.length,    s: `${deployed.length} deployed · ${rollbacks.length} rollbacks`, c: 'var(--dp-tx)' },
    { l: 'DURACIÓN MEDIA',  v: `${avgDur}d`,        s: 'inicio → fin',                                                 c: 'var(--dp-tx)' },
    { l: 'TASA DE ÉXITO',   v: `${successRate}%`,   s: `${deployed.length}/${finished.length} finalizadas`,            c: '#34d399' },
    { l: 'TICKETS/RELEASE', v: tpr,                 s: 'media',                                                         c: '#adc6ff' },
    { l: 'REPOS ÚNICOS',    v: allRepos.length,     s: 'repositorios',                                                  c: '#a78bfa' },
    { l: 'BUGS',            v: `${totalCounts.bugs.closed}/${totalCounts.bugs.total}`,   s: `${bugRate}% resueltos`,     c: '#ef4444' },
    { l: 'TESTS',           v: `${totalCounts.tests.closed}/${totalCounts.tests.total}`, s: `${testRate}% completados`, c: '#3b82f6' },
  ];

  const TCOL: Record<string, string> = { Bug: '#f59e0b', Story: '#34d399', Task: '#3b82f6', Epic: '#a78bfa' };

  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-sm)', color: 'var(--dp-tx)', fontWeight: 700, marginBottom: 20 }}>Métricas</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 22 }}>
        {stats.map(s => (
          <div key={s.l} style={{ background: 'var(--dp-sf)', border: '1px solid var(--dp-bd)', borderRadius: 8, padding: '13px 15px' }}>
            <SLabel style={{ marginBottom: 7 }}>{s.l}</SLabel>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: s.c, lineHeight: 1 }}>{s.v}</div>
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3)', marginTop: 4 }}>{s.s}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={{ background: 'var(--dp-sf)', border: '1px solid var(--dp-bd)', borderRadius: 8, padding: '15px 17px' }}>
          <SLabel style={{ marginBottom: 12 }}>RELEASES POR MES</SLabel>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 72, borderBottom: '1px solid var(--dp-bd)', paddingBottom: 3 }}>
            {months.map(([m, v]) => (
              <div key={m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={{ background: '#3b82f6', width: '100%', height: Math.round(v / maxM * 64), borderRadius: '2px 2px 0 0', minHeight: 4 }} />
                <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3)' }}>{v}</span>
              </div>
            ))}
            {months.length === 0 && <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3)', width: '100%', textAlign: 'center' }}>Sin datos</div>}
          </div>
          {months.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
              {months.map(([m]) => <div key={m} style={{ flex: 1, fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3)', textAlign: 'center' }}>{m.slice(5)}</div>)}
            </div>
          )}
        </div>
        <div style={{ background: 'var(--dp-sf)', border: '1px solid var(--dp-bd)', borderRadius: 8, padding: '15px 17px' }}>
          <SLabel style={{ marginBottom: 12 }}>TICKETS POR TIPO</SLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {typeEntries.map(([type, count]) => {
              const color = TCOL[type] ?? '#64748b';
              return (
                <div key={type}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx2)' }}>{type}</span>
                    <span style={{ fontSize: 'var(--fs-2xs)', color, fontWeight: 700 }}>{count} ({Math.round(count / Math.max(allKeys.length, 1) * 100)}%)</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--dp-bd)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.round(count / Math.max(...Object.values(byType), 1) * 100)}%`, background: color, borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
            {typeEntries.length === 0 && <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3)' }}>Sin datos</div>}
          </div>
        </div>
      </div>
      <div style={{ background: 'var(--dp-sf)', border: '1px solid var(--dp-bd)', borderRadius: 8, padding: '15px 17px' }}>
        <SLabel style={{ marginBottom: 12 }}>REPOS MÁS DESPLEGADOS</SLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {repoEntries.map(([repo, count]) => (
            <div key={repo} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx2)', width: 120, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{repo}</span>
              <div style={{ flex: 1, height: 3, background: 'var(--dp-bd)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(count / maxR * 100)}%`, background: '#3b82f6', borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3)', width: 14, textAlign: 'right' }}>{count}</span>
            </div>
          ))}
          {repoEntries.length === 0 && <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3)' }}>Sin datos</div>}
        </div>
      </div>
    </div>
  );
}
