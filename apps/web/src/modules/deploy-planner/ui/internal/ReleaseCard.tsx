/**
 * ReleaseCard — draggable card shown in the Planning board.
 *
 * Handles: inline edit of release number (with VersionPicker), description,
 * status (with done-state blocking via RepoGroupService), dates, tickets
 * (add/remove/drag), repo chips, conflict detection by repo group overlap,
 * and bug/test counters from classified subtasks.
 */
import { useState } from 'react';
import { DateRangePicker, BugIcon } from '@worksuite/ui';
import { RepoGroupService, type LinkedGroup, type ReleaseForGrouping } from '../../domain/services/RepoGroupService';
import { SubtaskService, type ClassifiedSubtask } from '../../domain/services/SubtaskService';
import { datesOverlap } from './helpers';
import { RepoChip } from './atoms';
import { VersionPicker } from './VersionPicker';
import type { Release, DpTicket, StatusCfg, RepoGroupView, DragState, VersionCfg } from './types';

interface ReleaseCardProps {
  rel: Release;
  statusCfg: StatusCfg;
  tickets: DpTicket[];
  onOpen: (id: string) => void;
  onUpd: (id: string, patch: Partial<Release>) => void | Promise<void>;
  onDelete: (id: string) => void;
  onDrop: (targetId: string) => void;
  setDrag: (drag: DragState | null) => void;
  drag: DragState | null;
  allReleases: Release[];
  repoGroups: RepoGroupView[];
  versionCfg: VersionCfg | null;
  allReleaseNumbers: string[];
  jiraBaseUrl?: string;
  linkedGroups?: LinkedGroup[];
  classifiedSubs?: ClassifiedSubtask[];
}

interface Conflict {
  repo: string;
  groupName: string;
  otherRelease: string;
}

const PRIORITY_COLOR: Record<string, string> = {
  Highest: 'var(--dp-danger-strong,var(--danger-strong))',
  High:    'var(--dp-warning,var(--amber))',
  Medium:  'var(--dp-primary-strong,var(--ac))',
  Low:     'var(--dp-tx3,var(--tx3))',
};

// Shape that RepoGroupService.canTransitionToDone expects — we map from
// the UI `Release` rows into it once and reuse the list.
function toReleasesForGrouping(releases: Release[], statusCfg: StatusCfg): ReleaseForGrouping[] {
  return releases.map(r => ({
    id: r.id,
    ticketIds: r.ticket_ids ?? [],
    status: r.status || 'Planned',
    statusCategory: statusCfg[r.status || 'Planned']?.status_category ?? 'backlog',
  }));
}

export function ReleaseCard({
  rel, statusCfg, tickets, onOpen, onUpd, onDelete, onDrop, setDrag,
  allReleases, repoGroups, versionCfg, allReleaseNumbers,
  jiraBaseUrl = '', linkedGroups = [], classifiedSubs = [],
}: ReleaseCardProps) {
  const [addingTicket, setAddingTicket] = useState(false);
  const [search, setSearch] = useState('');
  const [showVersionPicker, setShowVersionPicker] = useState(false);
  const tMap = new Map(tickets.map(t => [t.key, t]));

  const cfg = statusCfg[rel.status] ?? { color: '#6b7280', bg_color: 'rgba(107,114,128,.12)', border: '#1f2937' };

  // Conflict detection using repo groups
  // A conflict exists when: another active release has a repo that belongs to the SAME group as one of our repos
  const myRepos = [...new Set((rel.ticket_ids ?? []).flatMap(k => tMap.get(k)?.repos ?? []))];

  const conflicts: Conflict[] = [];
  for (const group of repoGroups) {
    const myGroupRepos = myRepos.filter(r => group.repos.includes(r));
    if (myGroupRepos.length === 0) continue;
    for (const other of allReleases) {
      if (other.id === rel.id) continue;
      const isActive = other.status !== 'Deployed' && other.status !== 'Rollback';
      if (!isActive) continue;
      // Only conflict if date ranges overlap
      if (!datesOverlap(rel.start_date, rel.end_date, other.start_date, other.end_date)) continue;
      const otherRepos = [...new Set((other.ticket_ids ?? []).flatMap(k => tMap.get(k)?.repos ?? []))];
      const sharedGroupRepos = myGroupRepos.filter(r => otherRepos.includes(r));
      for (const repo of sharedGroupRepos) {
        if (!conflicts.find(c => c.repo === repo)) {
          conflicts.push({ repo, groupName: group.name, otherRelease: other.release_number || 'sin versión' });
        }
      }
    }
  }

  const relTickets = (rel.ticket_ids ?? [])
    .map(k => tMap.get(k))
    .filter((t): t is DpTicket => Boolean(t));
  const relRepos   = [...new Set(relTickets.flatMap(t => t.repos ?? []))];
  const unassigned = tickets.filter(t => !(rel.ticket_ids ?? []).includes(t.key));

  return (
    <div
      className="anim-in glass-card ghost-border-top"
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); onDrop(rel.id); }}
      onClick={() => onOpen(rel.id)}
      style={{
        width: 320,
        position: 'relative',
        background: 'var(--dp-sf,var(--sf))',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid var(--dp-bd,var(--bd))',
        borderLeft: `3px solid ${cfg.color}`,
        borderRadius: 8,
        padding: '16px 18px',
        flexShrink: 0,
        boxShadow: `0 4px 20px var(--shadow-base, rgba(0,0,0,.35)), 0 0 0 1px ${cfg.color}18`,
        transition: 'box-shadow .2s, transform .15s',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 30px var(--shadow-base, rgba(0,0,0,.4)), 0 0 15px ${cfg.color}25`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 4px 20px var(--shadow-base, rgba(0,0,0,.35)), 0 0 0 1px ${cfg.color}18`; }}
    >
      {/* Release number: click title opens detail, edit via input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span
          onClick={() => onOpen(rel.id)}
          style={{ flex: 1, fontSize: 18, fontWeight: 600, color: 'var(--dp-primary,#adc6ff)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}
        >
          {rel.release_number || <span style={{ color: 'var(--dp-tx3,#8c909f)' }}>sin versión</span>}
        </span>
        <button onClick={e => { e.stopPropagation(); onOpen(rel.id); }} title="Abrir detalle" style={{ background: 'none', border: 'none', color: 'var(--dp-tx3,#8c909f)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '2px 4px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete(rel.id); }} style={{ background: 'none', border: 'none', color: 'var(--dp-tx3,#8c909f)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
        </button>
      </div>

      {/* Version number input + generator */}
      <div style={{ position: 'relative', marginBottom: 6 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={rel.release_number || ''}
            onChange={e => onUpd(rel.id, { release_number: e.target.value })}
            placeholder="v1.0.0"
            style={{ flex: 1, background: 'var(--dp-sf2,#201f1f)', border: '1px solid var(--dp-bd,var(--bd))', borderRadius: '4px 0 0 4px', padding: '5px 10px', fontSize: 11, color: 'var(--dp-tx,#e5e2e1)', fontFamily: "'Inter', monospace", outline: 'none' }}
          />
          <button
            onClick={e => { e.stopPropagation(); setShowVersionPicker(v => !v); }}
            title="Generar número de versión"
            style={{ background: 'var(--dp-sf2,#201f1f)', border: '1px solid var(--dp-bd,var(--bd))', borderLeft: 'none', borderRadius: '0 4px 4px 0', padding: '0 10px', fontSize: 14, color: 'var(--dp-tx3,#8c909f)', cursor: 'pointer', lineHeight: 1 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>settings</span>
          </button>
        </div>
        {showVersionPicker && versionCfg && (
          <VersionPicker
            versionCfg={versionCfg}
            allReleaseNumbers={allReleaseNumbers}
            onSelect={v => { void onUpd(rel.id, { release_number: v }); setShowVersionPicker(false); }}
            onClose={() => setShowVersionPicker(false)}
          />
        )}
      </div>

      {/* Description — textarea with wrapping */}
      <textarea
        value={rel.description ?? ''}
        onChange={e => onUpd(rel.id, { description: e.target.value })}
        onClick={e => e.stopPropagation()}
        placeholder="Descripción de la release…"
        rows={rel.description && rel.description.length > 40 ? 3 : 2}
        style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--dp-bd,var(--bd))', fontSize: 11, color: 'var(--dp-tx2,var(--tx2))', fontFamily: 'inherit', outline: 'none', marginBottom: 12, paddingBottom: 6, resize: 'none', lineHeight: 1.5, letterSpacing: '0.01em' }}
      />

      {/* Status selector with is_final blocking */}
      <div style={{ marginBottom: 10 }}>
        <select
          value={rel.status || 'Planned'}
          onChange={e => {
            const newStatus = e.target.value;
            const isDone = statusCfg[newStatus]?.status_category === 'done';
            if (isDone && linkedGroups.length) {
              const check = RepoGroupService.canTransitionToDone(
                rel.id, linkedGroups,
                toReleasesForGrouping(allReleases, statusCfg),
              );
              if (!check.allowed) {
                alert(`🔒 No puedes pasar a "${newStatus}" porque hay releases vinculadas pendientes:\n${check.blockers.map(b => `• ${b.groupName}: release en "${b.status}"`).join('\n')}`);
                return;
              }
            }
            void onUpd(rel.id, { status: newStatus });
          }}
          onClick={e => e.stopPropagation()}
          style={{ background: cfg.bg_color, border: `1px solid ${cfg.border}`, borderRadius: 5, padding: '4px 10px', fontSize: 10, color: cfg.color, cursor: 'pointer', outline: 'none', fontWeight: 700, fontFamily: 'inherit' }}
        >
          {Object.entries(statusCfg).map(([name, v]) => {
            const isDoneCat = v.status_category === 'done';
            const blocked = isDoneCat && linkedGroups.length > 0 && !RepoGroupService.canTransitionToDone(
              rel.id, linkedGroups,
              toReleasesForGrouping(allReleases, statusCfg),
            ).allowed;
            return <option key={name} value={name} disabled={blocked}>{blocked ? '🔒 ' : ''}{name}</option>;
          })}
        </select>
      </div>

      {/* Dates — single calendar range picker */}
      <div style={{ marginBottom: 8 }} onClick={e => e.stopPropagation()}>
        <DateRangePicker
          startValue={rel.start_date ?? ''}
          endValue={rel.end_date ?? ''}
          onChange={(s: string, e: string) => {
            const startDate = s ? s.slice(0, 10) : '';
            const endDate = e ? e.slice(0, 10) : '';
            void onUpd(rel.id, { start_date: startDate, end_date: endDate });
          }}
          showTime={false}
          labels={{ start: 'Start', end: 'End' }}
        />
      </div>

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <div style={{ background: 'var(--red-dim)', border: '1px solid var(--dp-danger-strong,var(--danger-strong))', borderRadius: 4, padding: '6px 9px', fontSize: 10, color: 'var(--dp-danger,var(--danger))', marginBottom: 8 }}>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>Repos en conflicto:</div>
          {conflicts.map(c => (
            <div key={c.repo} style={{ marginTop: 2, color: 'var(--dp-danger,var(--danger))' }}>
              · <strong>{c.repo}</strong>
              <span style={{ color: 'var(--dp-tx3,var(--tx3))' }}> — también en {c.otherRelease} ({c.groupName})</span>
            </div>
          ))}
        </div>
      )}

      {/* Tickets */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
        {relTickets.map(t => {
          const pColor = PRIORITY_COLOR[t.priority] ?? '#8c909f';
          const noRepo = !t.repos || t.repos.length === 0;
          return (
            <div
              key={t.key}
              draggable
              onDragStart={() => setDrag({ key: t.key, fromId: rel.id })}
              onDragEnd={() => setDrag(null)}
              onClick={e => e.stopPropagation()}
              title={noRepo ? '⚠ Sin repositorio — asigna Components en Jira' : t.summary}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                background: 'var(--dp-sf2,#201f1f)',
                border: noRepo ? '1px solid rgba(239,68,68,.5)' : '1px solid var(--dp-bd,var(--bd))',
                borderLeft: `2px solid ${noRepo ? '#ef4444' : pColor}`,
                borderRadius: 6, cursor: 'grab', fontSize: 10,
              }}
            >
              {noRepo && <span style={{ color: '#ef4444', fontSize: 10, flexShrink: 0 }}>⚠</span>}
              <span style={{ color: 'var(--dp-primary,#adc6ff)', fontWeight: 700, flexShrink: 0 }}>{t.key}</span>
              <span style={{ color: noRepo ? '#ef4444' : 'var(--dp-tx2,#c2c6d6)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.summary.slice(0, 28)}{t.summary.length > 28 ? '…' : ''}
              </span>
              <span style={{ color: 'var(--dp-tx3,#8c909f)', flexShrink: 0, fontSize: 9 }}>
                {t.assignee?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '—'}
              </span>
              {jiraBaseUrl && (
                <a
                  href={`${jiraBaseUrl}/browse/${t.key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => e.stopPropagation()}
                  style={{ color: 'var(--dp-tx3,#8c909f)', fontSize: 10, flexShrink: 0, textDecoration: 'none', lineHeight: 1, padding: '0 2px' }}
                  title={`Open ${t.key} in Jira`}
                >
                  ↗
                </a>
              )}
              <button
                onClick={e => { e.stopPropagation(); void onUpd(rel.id, { ticket_ids: (rel.ticket_ids ?? []).filter(x => x !== t.key) }); }}
                style={{ background: 'none', border: 'none', color: 'var(--dp-tx3,#8c909f)', cursor: 'pointer', fontSize: 12, lineHeight: 1, flexShrink: 0 }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* Warning: tickets sin repo */}
      {relTickets.some(t => !t.repos || t.repos.length === 0) && (
        <div style={{ fontSize: 9, color: 'var(--dp-danger-strong,var(--danger-strong))', marginBottom: 6, padding: '3px 6px', background: 'var(--red-dim)', borderRadius: 3, border: '1px solid var(--dp-danger-strong,var(--danger-strong))' }}>
          ⚠ {relTickets.filter(t => !t.repos || t.repos.length === 0).length} ticket{relTickets.filter(t => !t.repos || t.repos.length === 0).length > 1 ? 's' : ''} sin repositorio — asigna Components en Jira
        </div>
      )}

      {/* Add ticket */}
      {addingTicket ? (
        <div style={{ marginBottom: 8 }}>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar ticket…"
            style={{ width: '100%', background: 'var(--dp-sf2,#201f1f)', border: '1px solid var(--dp-primary-strong,#4d8eff)', borderRadius: 6, padding: '6px 10px', fontSize: 10, color: 'var(--dp-tx,#e5e2e1)', outline: 'none', marginBottom: 3 }}
            onBlur={() => { setTimeout(() => { setAddingTicket(false); setSearch(''); }, 150); }}
          />
          {unassigned.filter(t => !search || (t.key + t.summary).toLowerCase().includes(search.toLowerCase())).slice(0, 5).map(t => (
            <div
              key={t.key}
              onMouseDown={() => { void onUpd(rel.id, { ticket_ids: [...(rel.ticket_ids ?? []), t.key] }); setAddingTicket(false); setSearch(''); }}
              style={{ padding: '4px 8px', fontSize: 10, cursor: 'pointer', color: 'var(--dp-tx2,#c2c6d6)', display: 'flex', gap: 8, borderRadius: 3 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--dp-sf,#1c1b1b)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: 'var(--dp-primary,#adc6ff)', fontWeight: 700, flexShrink: 0 }}>{t.key}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.summary}</span>
            </div>
          ))}
        </div>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); setAddingTicket(true); }}
          style={{ width: '100%', background: 'transparent', border: '1px dashed var(--dp-bd,var(--bd))', borderRadius: 6, padding: '6px', fontSize: 10, color: 'var(--dp-tx3,var(--tx3))', cursor: 'pointer', marginBottom: 10, transition: 'all .15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = cfg.color; e.currentTarget.style.color = cfg.color; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--dp-bd,var(--bd))'; e.currentTarget.style.color = 'var(--dp-tx3,var(--tx3))'; }}
        >
          + ticket
        </button>
      )}

      {/* Bug/Test counters */}
      {(() => {
        const relSubs = classifiedSubs.filter(s => (rel.ticket_ids ?? []).includes(s.parentKey));
        const counts = SubtaskService.count(relSubs);
        if (counts.bugs.total === 0 && counts.tests.total === 0) return null;
        return (
          <div style={{ display: 'flex', gap: 8, fontSize: 10, paddingTop: 6, borderTop: '1px solid var(--dp-bd,var(--bd))', marginBottom: 4 }}>
            {counts.bugs.total > 0 && (
              <span style={{ color: counts.bugs.open > 0 ? 'var(--dp-danger-strong,var(--danger-strong))' : 'var(--dp-secondary,var(--green))', fontWeight: 600 }}>
                <BugIcon size={12} color="currentColor" />{counts.bugs.closed}/{counts.bugs.total}
              </span>
            )}
            {counts.tests.total > 0 && (
              <span style={{ color: counts.tests.open > 0 ? 'var(--dp-primary-strong,var(--ac))' : 'var(--dp-secondary,var(--green))', fontWeight: 600 }}>
                🧪 {counts.tests.closed}/{counts.tests.total}
              </span>
            )}
          </div>
        );
      })()}

      {/* Repo chips */}
      {relRepos.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingTop: 4 }}>
          {relRepos.map(r => <RepoChip key={r} name={r} />)}
        </div>
      )}
    </div>
  );
}
