// @ts-nocheck
import { useTranslation } from '@worksuite/i18n';
import type { Priority } from '../../domain/entities/Priority';

export type KanbanSortBy = 'manual' | 'priority' | 'assignee';

interface Assignee {
  id: string;
  name?: string;
  email: string;
}

interface Props {
  search: string;
  onSearchChange: (s: string) => void;

  filterAssignee: string;
  onFilterAssigneeChange: (v: string) => void;
  /** Assignees actually present in the board (so the dropdown only lists relevant users). */
  assignees: Assignee[];

  filterPriority: string;
  onFilterPriorityChange: (v: string) => void;
  priorities: Priority[];

  sortBy: KanbanSortBy;
  onSortByChange: (v: KanbanSortBy) => void;
}

/**
 * Runtime filter bar shared between Smart Kanban (Auto) and configurable
 * BoardView. Stateless — owners pass in current values + onChange.
 */
export function KanbanFilters({
  search, onSearchChange,
  filterAssignee, onFilterAssigneeChange, assignees,
  filterPriority, onFilterPriorityChange, priorities,
  sortBy, onSortByChange,
}: Props) {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <select value={filterAssignee} onChange={(e) => onFilterAssigneeChange(e.target.value)}
        title={t('vectorLogic.filterAssignee')}
        style={S.select}>
        <option value="all">{t('vectorLogic.allAssignees')}</option>
        <option value="unassigned">{t('vectorLogic.unassigned')}</option>
        {assignees.map(u => (
          <option key={u.id} value={u.id}>{u.name || u.email}</option>
        ))}
      </select>

      <select value={filterPriority} onChange={(e) => onFilterPriorityChange(e.target.value)}
        title={t('vectorLogic.filterPriority')}
        style={S.select}>
        <option value="all">{t('vectorLogic.allPriorities')}</option>
        {priorities.map(p => (
          <option key={p.id} value={p.name}>{p.name}</option>
        ))}
      </select>

      <select value={sortBy} onChange={(e) => onSortByChange(e.target.value as KanbanSortBy)}
        title={t('vectorLogic.sortBy')}
        style={S.select}>
        <option value="manual">{t('vectorLogic.sortManual')}</option>
        <option value="priority">{t('vectorLogic.sortPriority')}</option>
        <option value="assignee">{t('vectorLogic.sortAssignee')}</option>
      </select>

      <div style={S.searchBox}>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--tx3)' }}>search</span>
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('vectorLogic.searchKanban')}
          style={S.searchInput}
        />
        {search && (
          <button type="button"
            onClick={() => onSearchChange('')}
            aria-label={t('common.clear')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', display: 'flex', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
          </button>
        )}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  select: {
    background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 8,
    padding: '6px 10px', color: 'var(--tx)', fontSize: 11, fontWeight: 500,
    fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
  },
  searchBox: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 8,
    padding: '6px 10px', width: 200,
  },
  searchInput: {
    flex: 1, border: 'none', outline: 'none', background: 'transparent',
    color: 'var(--tx)', fontSize: 11, fontFamily: 'inherit',
  },
};
