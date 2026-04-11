// @ts-nocheck
/**
 * History view — sortable/filterable table of all releases.
 * Clicking a row opens the ReleaseDetail (via setDetail callback).
 */
import { useState } from 'react';
import { BugIcon } from '@worksuite/ui';
import { diffD } from './helpers';
import { SLabel, RepoChip } from './atoms';
import { SubtaskService } from '../../domain/services/SubtaskService';

export function History({ releases, tickets, setDetail, statusCfg, classifiedSubs = [] }) {
  const [sortBy, setSortBy] = useState('end_date');
  const [filterStatus, setFilterStatus] = useState([]);
  const tMap = Object.fromEntries(tickets.map(t => [t.key, t]));
  const activeF = filterStatus.length === 0;
  const sorted = [...releases]
    .filter(r => activeF || filterStatus.includes(r.status))
    .sort((a, b) => {
      if (sortBy === 'end_date')   return (b.end_date || '') > (a.end_date || '') ? 1 : -1;
      if (sortBy === 'start_date') return (b.start_date || '') > (a.start_date || '') ? 1 : -1;
      if (sortBy === 'bugs') {
        const aBugs = SubtaskService.count(classifiedSubs.filter(s => (a.ticket_ids || []).includes(s.parentKey))).bugs.open;
        const bBugs = SubtaskService.count(classifiedSubs.filter(s => (b.ticket_ids || []).includes(s.parentKey))).bugs.open;
        return bBugs - aBugs;
      }
      return 0;
    });
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, color: 'var(--dp-tx,#e6edf3)', fontWeight: 700 }}>Historial</h2>
        <span style={{ fontSize: 10, color: 'var(--dp-tx3,#334155)' }}>{sorted.length} releases</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <SLabel>Ordenar</SLabel>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ background: 'var(--dp-sf,#0b0f18)', border: '1px solid var(--dp-bd,#1e293b)', borderRadius: 4, padding: '4px 8px', fontSize: 10, color: 'var(--dp-tx2,#94a3b8)', outline: 'none' }}>
            <option value="end_date">Fecha fin</option>
            <option value="start_date">Fecha inicio</option>
            <option value="bugs">Bugs abiertos</option>
          </select>
        </div>
      </div>
      {/* Status filter */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {Object.entries(statusCfg).map(([name, cfg]) => {
          const on = filterStatus.includes(name);
          return <button key={name} onClick={() => setFilterStatus(f => f.includes(name) ? f.filter(x => x !== name) : [...f, name])}
            style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, background: on ? cfg.bg_color : 'transparent', color: on ? cfg.color : 'var(--dp-tx3,#64748b)', border: `1px solid ${on ? cfg.border : 'var(--dp-bd,#1e293b)'}`, transition: 'all .12s' }}>{name}</button>;
        })}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <thead><tr style={{ borderBottom: '1px solid var(--dp-bd,#0e1520)' }}>
          {['RELEASE', 'ESTADO', 'INICIO', 'FIN', 'DURACIÓN', 'TICKETS', 'BUGS', 'REPOS'].map(h => (
            <th key={h} style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--dp-tx3,#334155)', fontWeight: 600, letterSpacing: '.06em', fontSize: 9 }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {sorted.map(rel => {
            const relTickets = (rel.ticket_ids || []).map(k => tMap[k]).filter(Boolean);
            const relRepos = [...new Set(relTickets.flatMap(t => t.repos || []))];
            const dur = rel.start_date && rel.end_date ? diffD(rel.start_date, rel.end_date) : null;
            const cfg = statusCfg[rel.status] || { color: '#6b7280' };
            return (
              <tr key={rel.id} onClick={() => setDetail(rel.id)} style={{ borderBottom: '1px solid var(--dp-bd,#0d111a)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--dp-sf,#0b0f18)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '11px 12px' }}>
                  <div style={{ fontWeight: 700, color: '#38bdf8', fontSize: 11 }}>{rel.release_number || '—'}</div>
                  {rel.description && <div style={{ color: 'var(--dp-tx3,#334155)', fontSize: 9, marginTop: 1 }}>{rel.description}</div>}
                </td>
                <td style={{ padding: '11px 12px' }}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: cfg.color, background: cfg.bg_color || 'rgba(107,114,128,.12)', border: `1px solid ${cfg.border || '#1f2937'}` }}>{rel.status || 'Planned'}</span></td>
                <td style={{ padding: '11px 12px', color: 'var(--dp-tx2,#64748b)' }}>{rel.start_date || '—'}</td>
                <td style={{ padding: '11px 12px', color: 'var(--dp-tx2,#64748b)' }}>{rel.end_date || '—'}</td>
                <td style={{ padding: '11px 12px', color: 'var(--dp-tx,#94a3b8)', fontWeight: 600 }}>{dur != null ? `${dur}d` : '—'}</td>
                <td style={{ padding: '11px 12px', color: 'var(--dp-tx2,#64748b)' }}>{rel.ticket_ids?.length || 0}</td>
                <td style={{ padding: '11px 12px' }}>{(() => {
                  const relSubs = classifiedSubs.filter(s => (rel.ticket_ids || []).includes(s.parentKey));
                  const c = SubtaskService.count(relSubs);
                  return c.bugs.total > 0 ? <span style={{ color: c.bugs.open > 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}><BugIcon size={12} color="currentColor" />{c.bugs.closed}/{c.bugs.total}</span> : <span style={{ color: 'var(--dp-tx3,#64748b)' }}>—</span>;
                })()}</td>
                <td style={{ padding: '11px 12px' }}><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{relRepos.slice(0, 3).map(r => <RepoChip key={r} name={r} />)}{relRepos.length > 3 && <span style={{ fontSize: 9, color: 'var(--dp-tx3,#64748b)' }}>+{relRepos.length - 3}</span>}</div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
