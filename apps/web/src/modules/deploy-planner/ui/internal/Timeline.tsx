/**
 * Timeline view — Gantt chart of releases with group frames.
 *
 * Note: this is the Deploy Planner's own Gantt, built on top of
 * @worksuite/ui's GanttTimeline. It's separate from the sibling
 * `DeployTimeline.tsx`, which is a different visualization reused by
 * the Environments module.
 */
import { useState } from 'react';
import { GanttTimeline } from '@worksuite/ui';
import { diffD } from './helpers';
import type { Release, DpTicket, StatusCfg, RepoGroupView } from './types';

interface TimelineProps {
  releases: Release[];
  tickets: DpTicket[];
  upd: (id: string, patch: Partial<Release>) => void | Promise<void>;
  setDetail: (id: string) => void;
  statusCfg: StatusCfg;
  repoGroups?: RepoGroupView[];
}

interface GanttBar {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  color: string;
  bgColor: string;
  status: string;
  meta: string;
}

interface GanttGroup {
  id: string;
  label: string;
  color: string;
  barIds: string[];
}

export function Timeline({ releases, tickets, upd, setDetail, statusCfg, repoGroups = [] }: TimelineProps) {
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const tMap = new Map(tickets.map(t => [t.key, t]));
  const activeF = filterStatus.length === 0;
  const filteredRels = releases.filter(r => activeF || filterStatus.includes(r.status));

  // Map releases to GanttBar format (drops releases with missing dates)
  const bars: GanttBar[] = filteredRels
    .filter((r): r is Release & { start_date: string; end_date: string } =>
      r.start_date != null && r.end_date != null,
    )
    .map(rel => {
      const cfg = statusCfg[rel.status] ?? { color: '#6b7280', bg_color: 'rgba(107,114,128,.12)', border: '#1f2937' };
      const dur = diffD(rel.start_date, rel.end_date);
      return {
        id: rel.id,
        label: rel.release_number || '—',
        startDate: rel.start_date,
        endDate: rel.end_date,
        color: cfg.color,
        bgColor: cfg.bg_color ?? 'rgba(107,114,128,.12)',
        status: rel.status || 'Planned',
        meta: `${dur}d · ${rel.ticket_ids?.length ?? 0} tickets`,
      };
    });

  // Map repoGroups to GanttGroup format. Only keeps groups that end up
  // linking 2+ releases so the visual frame stays meaningful.
  const groups: GanttGroup[] = repoGroups
    .map(g => {
      const relIds = releases
        .filter(rel => {
          const relTickets = (rel.ticket_ids ?? [])
            .map(k => tMap.get(k))
            .filter((t): t is DpTicket => Boolean(t));
          const relRepos = new Set(relTickets.flatMap(t => t.repos ?? []));
          return (g.repos ?? []).some(r => relRepos.has(r));
        })
        .map(r => r.id);

      const allDoneOrApproved = relIds.every(id => {
        const rel = releases.find(r => r.id === id);
        const cat = rel ? statusCfg[rel.status]?.status_category : undefined;
        return cat === 'done' || cat === 'approved';
      });

      return {
        id: g.id,
        label: g.name,
        color: allDoneOrApproved ? '#22c55e' : '#f59e0b',
        barIds: relIds,
      };
    })
    .filter(g => g.barIds.length >= 2);

  const handleBarMove = (id: string, startDate: string, endDate: string) => {
    void upd(id, { start_date: startDate, end_date: endDate });
  };

  const legend = Object.entries(statusCfg).map(([name, cfg]) => ({ name, color: cfg.color }));

  return (
    <div>
      {/* Status filter */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
        {Object.entries(statusCfg).map(([name, cfg]) => {
          const on = filterStatus.includes(name);
          return (
            <button
              key={name}
              onClick={() => setFilterStatus(f => f.includes(name) ? f.filter(x => x !== name) : [...f, name])}
              style={{
                fontSize: 10, padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 600,
                background: on ? cfg.bg_color : 'transparent',
                color: on ? cfg.color : 'var(--dp-tx3,#8c909f)',
                border: `1px solid ${on ? cfg.border : 'var(--dp-bd,#424754)'}`,
                transition: 'all .12s',
              }}
            >
              {name}
            </button>
          );
        })}
      </div>
      <GanttTimeline
        bars={bars}
        groups={groups}
        onBarMove={handleBarMove}
        onBarClick={(id: string) => setDetail(id)}
      />
      {/* Legend */}
      <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {legend.map(l => (
          <div key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--dp-tx3,#8c909f)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />{l.name}
          </div>
        ))}
      </div>
    </div>
  );
}
