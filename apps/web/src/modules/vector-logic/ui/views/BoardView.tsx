// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { useDialog, UserAvatar } from '@worksuite/ui';
import {
  boardRepo, boardColumnRepo,
  stateRepo, taskRepo, taskTypeRepo, priorityRepo,
} from '../../container';
import type { KanbanBoard } from '../../domain/entities/KanbanBoard';
import type { BoardColumn } from '../../domain/entities/BoardColumn';
import type { State, StateCategory } from '../../domain/entities/State';
import type { Task } from '../../domain/entities/Task';
import type { TaskType } from '../../domain/entities/TaskType';
import type { Priority } from '../../domain/entities/Priority';

const CAT_COLORS: Record<StateCategory, string> = {
  BACKLOG:     'var(--tx3)',
  OPEN:        'var(--amber)',
  IN_PROGRESS: 'var(--ac)',
  DONE:        'var(--green)',
};

interface WSUser {
  id: string;
  name?: string;
  email: string;
  avatar?: string;
  avatarUrl?: string | null;
}

interface Props {
  boardId: string;
  currentUser: { id: string; name?: string; email: string; [k: string]: unknown };
  wsUsers?: WSUser[];
  onEditBoard: (boardId: string) => void;
}

export function BoardView({ boardId, currentUser, wsUsers = [], onEditBoard }: Props) {
  const { t } = useTranslation();
  const dialog = useDialog();

  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [allStates, setAllStates] = useState<State[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);

  /** Load everything needed to render the board. */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [b, cols, states, allTasks, types, prs] = await Promise.all([
          boardRepo.findById(boardId),
          boardColumnRepo.findByBoard(boardId),
          stateRepo.findAll(),
          taskRepo.findAll(),
          taskTypeRepo.findAll(),
          priorityRepo.ensureDefaults(currentUser.id),
        ]);
        if (cancelled) return;
        if (!b) {
          setError(t('vectorLogic.boardNotFound'));
          setLoading(false);
          return;
        }
        setBoard(b);
        setColumns(cols);
        setAllStates(states);
        setTaskTypes(types);
        setPriorities(prs);

        // Tasks shown on this board: those whose current stateId matches one
        // of the board's column states. Filters (task type, assignee, etc.)
        // land in Fase E.
        const colStateIds = new Set(cols.map(c => c.stateId));
        setTasks(allTasks.filter(x => x.stateId && colStateIds.has(x.stateId)));
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load board');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [boardId, currentUser.id, t]);

  const stateById = useMemo(() => {
    const m = new Map<string, State>();
    allStates.forEach(s => m.set(s.id, s));
    return m;
  }, [allStates]);

  const taskTypeById = useMemo(() => {
    const m = new Map<string, TaskType>();
    taskTypes.forEach(tt => m.set(tt.id, tt));
    return m;
  }, [taskTypes]);

  const priorityByName = useMemo(() => {
    const m = new Map<string, Priority>();
    priorities.forEach(p => m.set(p.name.toLowerCase(), p));
    return m;
  }, [priorities]);

  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => a.sortOrder - b.sortOrder),
    [columns],
  );

  /** tasks grouped by stateId (= column.stateId). */
  const tasksByState = useMemo(() => {
    const map: Record<string, Task[]> = {};
    sortedColumns.forEach(c => { map[c.stateId] = []; });
    tasks.forEach(task => {
      if (task.stateId && map[task.stateId] != null) map[task.stateId].push(task);
    });
    // Stable per-column order: by sort_order, then created_at.
    Object.values(map).forEach(arr => {
      arr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    });
    return map;
  }, [sortedColumns, tasks]);

  const totalActive = tasks.length;
  const distinctTypeCount = new Set(tasks.map(t => t.taskTypeId)).size;
  const isOwner = board?.ownerId === currentUser.id;

  const onDragStart = (taskId: string) => (e: React.DragEvent) => {
    setDragTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  };
  const onDragEnd = () => {
    setDragTaskId(null);
    setDropColumnId(null);
  };
  const onColDragOver = (colStateId: string) => (e: React.DragEvent) => {
    if (!dragTaskId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const sourceStateId = tasks.find(x => x.id === dragTaskId)?.stateId;
    if (sourceStateId !== colStateId && dropColumnId !== colStateId) {
      setDropColumnId(colStateId);
    }
  };
  const onColDragLeave = () => setDropColumnId(null);
  const onColDrop = (colStateId: string) => async (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragTaskId) return;
    const id = dragTaskId;
    setDragTaskId(null);
    setDropColumnId(null);
    const task = tasks.find(x => x.id === id);
    if (!task || task.stateId === colStateId) return;
    // Optimistic update
    setTasks(prev => prev.map(x => x.id === id ? { ...x, stateId: colStateId } : x));
    try {
      await taskRepo.moveToState(id, colStateId);
    } catch (err) {
      // Revert on error
      setTasks(prev => prev.map(x => x.id === id ? { ...x, stateId: task.stateId } : x));
    }
  };

  const handleNewTask = async () => {
    await dialog.alert(t('vectorLogic.boardNewTaskComingSoon'), {
      title: t('vectorLogic.newTask'),
      icon: 'add_task',
    });
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--tx3)' }}>
        {t('common.loading')}
      </div>
    );
  }

  if (error || !board) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--red)' }}>
        {error ?? t('vectorLogic.boardNotFound')}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', gap: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{
              fontSize: 22, fontWeight: 600, color: 'var(--tx)', margin: 0,
              letterSpacing: '-0.01em', fontFamily: "'Space Grotesk',sans-serif",
            }}>
              {board.name}
            </h2>
            <span style={S.visibilityBadge(board.visibility)}>
              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
                {board.visibility === 'shared' ? 'groups' : 'person'}
              </span>
              {board.visibility === 'shared' ? t('vectorLogic.boardShared') : t('vectorLogic.boardPersonal')}
            </span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--tx3)' }}>
            {distinctTypeCount} {t('vectorLogic.taskTypesShort')} · {totalActive} {t('vectorLogic.tasks')}
          </span>
        </div>
        {isOwner && (
          <button type="button" onClick={() => onEditBoard(board.id)} style={S.editButton}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
            {t('vectorLogic.editBoardTitle')}
          </button>
        )}
        <button type="button" onClick={handleNewTask} style={S.newTaskButton}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
          {t('vectorLogic.newTask')}
        </button>
      </div>

      {/* Columns */}
      {sortedColumns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--tx3)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: .2, display: 'block', marginBottom: 12 }}>
            view_kanban
          </span>
          {t('vectorLogic.boardNoColumns')}
        </div>
      ) : (
        <div style={{
          flex: 1, display: 'grid',
          gridTemplateColumns: `repeat(${sortedColumns.length}, minmax(220px, 1fr))`,
          gap: 12, overflowX: 'auto', overflowY: 'hidden',
        }}>
          {sortedColumns.map(col => {
            const st = stateById.get(col.stateId);
            const colTasks = tasksByState[col.stateId] ?? [];
            const isDropTarget = dropColumnId === col.stateId;
            const accent = st?.color || CAT_COLORS[(st?.category as StateCategory) ?? 'OPEN'];
            const wipReached = col.wipLimit != null && colTasks.length >= col.wipLimit;
            return (
              <div
                key={col.id}
                onDragOver={onColDragOver(col.stateId)}
                onDragLeave={onColDragLeave}
                onDrop={onColDrop(col.stateId)}
                style={{
                  background: isDropTarget
                    ? 'linear-gradient(180deg, var(--ac-dim) 0%, transparent 100%)'
                    : 'var(--sf2)',
                  borderRadius: 10,
                  borderTop: `3px solid ${accent}`,
                  border: isDropTarget
                    ? '1px dashed var(--ac)'
                    : wipReached
                      ? '1px solid var(--amber)'
                      : '1px solid transparent',
                  borderTopColor: accent,
                  display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
                  transform: isDropTarget ? 'scale(1.01)' : 'scale(1)',
                  boxShadow: isDropTarget
                    ? '0 0 0 4px var(--ac-dim), 0 16px 40px var(--ac-dim)'
                    : '0 2px 8px rgba(0,0,0,.18)',
                  transition: 'all .22s cubic-bezier(.215,.61,.355,1)',
                }}
              >
                {/* Column header */}
                <div style={{
                  padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8,
                  flexShrink: 0,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent }} />
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: 'var(--tx)',
                    textTransform: 'uppercase', letterSpacing: '.05em', flex: 1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {st?.name ?? '—'}
                  </span>
                  {col.wipLimit != null ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '2px 7px', borderRadius: 5,
                      background: wipReached ? 'var(--amber-dim)' : 'var(--sf3)',
                      color: wipReached ? 'var(--amber)' : 'var(--tx2)',
                      fontSize: 10, fontWeight: 700,
                    }}>
                      {wipReached && (
                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>warning</span>
                      )}
                      {colTasks.length} / {col.wipLimit}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 600 }}>
                      {colTasks.length}
                    </span>
                  )}
                </div>

                {/* Cards */}
                <div style={{
                  flex: 1, overflowY: 'auto', padding: '0 10px 12px',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  {colTasks.map(task => (
                    <BoardTaskCard
                      key={task.id}
                      task={task}
                      taskType={taskTypeById.get(task.taskTypeId) ?? null}
                      assignee={wsUsers.find(u => u.id === task.assigneeId) ?? null}
                      priority={task.priority ? priorityByName.get(task.priority.toLowerCase()) ?? null : null}
                      onDragStart={onDragStart(task.id)}
                      onDragEnd={onDragEnd}
                      isDragging={dragTaskId === task.id}
                    />
                  ))}
                </div>

                {/* WIP banner */}
                {wipReached && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                    background: 'var(--amber-dim)', color: 'var(--amber)',
                    fontSize: 11, fontWeight: 600,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>warning</span>
                    {t('vectorLogic.boardWipLimitReached')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Task card ─────────────────────────────────────────────────────────── */
function BoardTaskCard({ task, taskType, assignee, priority, onDragStart, onDragEnd, isDragging }: {
  task: Task;
  taskType: TaskType | null;
  assignee: WSUser | null;
  priority: Priority | null;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging?: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: 'var(--sf3)', borderRadius: 10, padding: '10px 12px',
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.4 : 1,
        display: 'flex', flexDirection: 'column', gap: 6,
        transition: 'opacity .15s, transform .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {taskType?.icon && (
          <span className="material-symbols-outlined"
                style={{ fontSize: 12, color: taskType.iconColor || 'var(--tx3)' }}>
            {taskType.icon}
          </span>
        )}
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--tx3)',
        }}>
          {task.code ?? taskType?.name ?? ''}
        </span>
      </div>
      <div style={{
        fontSize: 13, fontWeight: 500, color: 'var(--tx)', lineHeight: 1.35,
      }}>
        {task.title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
        {priority && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 7px', borderRadius: 4,
            background: priority.color, color: 'var(--bg)',
            fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            {priority.icon && (
              <span className="material-symbols-outlined" style={{ fontSize: 10 }}>{priority.icon}</span>
            )}
            {priority.name}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {assignee && (
          <UserAvatar
            user={{
              id: assignee.id,
              name: assignee.name,
              email: assignee.email,
              avatarUrl: assignee.avatarUrl ?? null,
            }}
            size={20}
          />
        )}
      </div>
    </div>
  );
}

const S = {
  visibilityBadge: (visibility: 'personal' | 'shared'): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 8px', borderRadius: 5,
    background: visibility === 'shared' ? 'var(--ac-dim)' : 'rgba(181,124,246,.15)',
    color: visibility === 'shared' ? 'var(--ac-strong)' : 'var(--purple)',
    fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
  }),
  editButton: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
    background: 'var(--sf2)', border: '1px solid var(--bd)', color: 'var(--tx)',
    borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit',
  } as React.CSSProperties,
  newTaskButton: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
    background: 'linear-gradient(135deg, var(--ac), var(--ac-strong))', border: 'none',
    color: 'var(--ac-on)', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 4px 12px var(--ac-dim)',
  } as React.CSSProperties,
};
