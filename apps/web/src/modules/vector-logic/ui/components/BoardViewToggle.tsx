import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@worksuite/i18n';

interface Props {
  boardId: string;
  active: 'board' | 'gantt';
}

/**
 * Two-tab segmented control to switch a board's view between the
 * regular Kanban board and the Gantt timeline. Used in both view
 * headers so the user always sees where they are and can flip
 * with one click.
 *
 * Click on the inactive tab navigates to the matching URL — keeping
 * URL the source of truth, no extra view state in the views.
 */
export function BoardViewToggle({ boardId, active }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const onBoard = () => {
    if (active !== 'board') navigate(`/vector-logic/board/${boardId}`);
  };
  const onGantt = () => {
    if (active !== 'gantt') navigate(`/vector-logic/board/${boardId}/gantt`);
  };

  return (
    <div style={{
      display: 'inline-flex',
      background: 'var(--sf2)',
      border: '1px solid var(--bd)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      <Tab active={active === 'board'} onClick={onBoard} icon="view_kanban" label={t('vectorLogic.ganttSwitchToBoard')} />
      <Tab active={active === 'gantt'} onClick={onGantt} icon="view_timeline" label={t('vectorLogic.ganttSwitchToGantt')} />
    </div>
  );
}

function Tab({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', border: 'none',
        background: active ? 'var(--ac)' : 'transparent',
        color: active ? 'var(--ac-on)' : 'var(--tx)',
        cursor: active ? 'default' : 'pointer',
        fontSize: 'var(--fs-2xs)', fontWeight: 700,
        letterSpacing: '.04em', textTransform: 'uppercase',
        fontFamily: 'inherit',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-xs)' }}>{icon}</span>
      {label}
    </button>
  );
}
