// @ts-nocheck
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

export function Timeline({ releases, tickets, upd, setDetail, statusCfg, repoGroups = [] }) {
  const [filterStatus, setFilterStatus] = useState([]);
  const tMap = Object.fromEntries(tickets.map(t => [t.key, t]));
  const activeF = filterStatus.length === 0;
  const filteredRels = releases.filter(r => activeF || filterStatus.includes(r.status));

  // Map releases to GanttBar format
  const bars = filteredRels.filter(r => r.start_date && r.end_date).map(rel => {
    const cfg = statusCfg[rel.status] || { color: '#6b7280', bg_color: 'rgba(107,114,128,.12)' };
    const dur = diffD(rel.start_date, rel.end_date);
    return {
      id: rel.id,
      label: rel.release_number || '—',
      startDate: rel.start_date,
      endDate: rel.end_date,
      color: cfg.color,
      bgColor: cfg.bg_color || 'rgba(107,114,128,.12)',
      status: rel.status || 'Planned',
      meta: `${dur}d · ${rel.ticket_ids?.length || 0} tickets`,
    };
  });

  // Map repoGroups to GanttGroup format
  const groups = (repoGroups || []).map(g => {
    // Find releases that have tickets touching repos in this group
    const relIds = releases.filter(rel => {
      const relTickets = (rel.ticket_ids || []).map(k => tMap[k]).filter(Boolean);
      const relRepos = [...new Set(relTickets.flatMap(t => t.repos || []))];
      return relRepos.some(r => (g.repos || []).includes(r));
    }).map(r => r.id);
    const allDoneOrApproved = relIds.every(id => {
      const rel = releases.find(r => r.id === id);
      const cat = statusCfg[rel?.status]?.status_category;
      return cat === 'done' || cat === 'approved';
    });
    return {
      id: g.id,
      label: g.name,
      color: allDoneOrApproved ? '#22c55e' : '#f59e0b',
      barIds: relIds,
    };
  }).filter(g => g.barIds.length >= 2);

  const handleBarMove = (id, startDate, endDate) => {
    upd(id, { start_date: startDate, end_date: endDate });
  };

  const legend = Object.entries(statusCfg).map(([name, cfg]) => ({ name, color: cfg.color }));

  return (
    <div>
      {/* Status filter */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
        {Object.entries(statusCfg).map(([name, cfg]) => {
          const on = filterStatus.includes(name);
          return <button key={name} onClick={() => setFilterStatus(f => f.includes(name) ? f.filter(x => x !== name) : [...f, name])}
            style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, background: on ? cfg.bg_color : 'transparent', color: on ? cfg.color : 'var(--dp-tx3,#64748b)', border: `1px solid ${on ? cfg.border : 'var(--dp-bd,#1e293b)'}`, transition: 'all .12s' }}>{name}</button>;
        })}
      </div>
      <GanttTimeline
        bars={bars}
        groups={groups}
        onBarMove={handleBarMove}
        onBarClick={(id) => setDetail(id)}
      />
      {/* Legend */}
      <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {legend.map(l => (
          <div key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--dp-tx3,var(--tx3,#64748b))' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />{l.name}
          </div>
        ))}
      </div>
    </div>
  );
}
