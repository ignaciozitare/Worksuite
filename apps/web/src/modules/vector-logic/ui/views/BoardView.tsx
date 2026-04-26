// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { useDialog, UserAvatar } from '@worksuite/ui';
import {
  boardRepo, boardColumnRepo, boardFilterRepo,
  stateRepo, taskRepo, taskTypeRepo, priorityRepo,
} from '../../container';
import type { KanbanBoard } from '../../domain/entities/KanbanBoard';
import type { BoardColumn } from '../../domain/entities/BoardColumn';
import type { BoardFilter } from '../../domain/entities/BoardFilter';
import type { BoardPermission } from '../../domain/entities/BoardMember';
import type { State, StateCategory, WorkflowState } from '../../domain/entities/State';
import type { Task } from '../../domain/entities/Task';
import type { TaskType } from '../../domain/entities/TaskType';
import type { Priority } from '../../domain/entities/Priority';
import { TaskDetailModal } from './KanbanView';
import { KanbanFilters, type KanbanSortBy } from '../components/KanbanFilters';

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
  /** The current user's permission on this board, or null if not a member.
   *  Owner is implicit (not a row in vl_board_members). */
  myPermission?: BoardPermission | null;
  onEditBoard: (boardId: string) => void;
}

export function BoardView({ boardId, currentUser, wsUsers = [], myPermission, onEditBoard }: Props) {
  const { t } = useTranslation();
  const dialog = useDialog();

  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [filters, setFilters] = useState<BoardFilter[]>([]);
  const [allStates, setAllStates] = useState<State[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** When set, the TaskDetailModal is rendered for this task. */
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  /** Workflow states for the open task's task type (loaded on demand). */
  const [detailWfStates, setDetailWfStates] = useState<WorkflowState[]>([]);

  // Runtime filter bar state (independent from the board's persisted filters).
  const [search, setSearch] = useState('');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [sortBy, setSortBy] = useState<KanbanSortBy>('manual');

  /** Load everything needed to render the board. */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [b, cols, flts, states, allTasks, types, prs] = await Promise.all([
          boardRepo.findById(boardId),
          boardColumnRepo.findByBoard(boardId),
          boardFilterRepo.findByBoard(boardId),
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
        setFilters(flts);
        setAllStates(states);
        setTaskTypes(types);
        setPriorities(prs);

        // Tasks whose current stateId is mapped to ANY of the board's
        // columns. Per-filter narrowing happens in `visibleTasks` below.
        const colStateIds = new Set<string>();
        for (const c of cols) c.stateIds.forEach(id => colStateIds.add(id));
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

  /** Tasks that pass every active filter (AND across dimensions). Combines:
   *   - the board's persisted vl_board_filters (config-time scope)
   *   - the runtime filter bar (assignee / priority / sort / search)
   */
  const visibleTasks = useMemo(() => {
    // 1. Board-configured filters (from vl_board_filters).
    const byDim = new Map<string, BoardFilter[]>();
    for (const f of filters) {
      const arr = byDim.get(f.dimension) ?? [];
      arr.push(f);
      byDim.set(f.dimension, arr);
    }
    const taskTypeF = (byDim.get('task_type')?.[0]?.value ?? null) as string[] | null;
    const assigneeCfgF = (byDim.get('assignee')?.[0]?.value ?? null) as string[] | null;
    const priorityCfgF = (byDim.get('priority')?.[0]?.value ?? null) as string[] | null;
    const createdByF = (byDim.get('created_by')?.[0]?.value ?? null) as string[] | null;
    const dueFrom = (byDim.get('due_from')?.[0]?.value ?? null) as string | null;
    const dueTo   = (byDim.get('due_to')?.[0]?.value ?? null) as string | null;

    // 2. Runtime filter bar narrows the result further.
    const q = search.trim().toLowerCase();

    return tasks.filter(task => {
      if (taskTypeF?.length && !taskTypeF.includes(task.taskTypeId)) return false;
      if (assigneeCfgF?.length && (!task.assigneeId || !assigneeCfgF.includes(task.assigneeId))) return false;
      if (priorityCfgF?.length) {
        const p = (task.priority ?? '').toLowerCase();
        if (!priorityCfgF.map(x => x.toLowerCase()).includes(p)) return false;
      }
      if (createdByF?.length && (!task.createdBy || !createdByF.includes(task.createdBy))) return false;
      if (dueFrom && (!task.dueDate || task.dueDate < dueFrom)) return false;
      if (dueTo   && (!task.dueDate || task.dueDate > dueTo))   return false;

      // Runtime: assignee selector
      if (filterAssignee !== 'all') {
        if (filterAssignee === 'unassigned') {
          if (task.assigneeId) return false;
        } else if (task.assigneeId !== filterAssignee) {
          return false;
        }
      }
      // Runtime: priority selector
      if (filterPriority !== 'all' && (task.priority ?? '').toLowerCase() !== filterPriority.toLowerCase()) {
        return false;
      }
      // Runtime: search (matches title or task code)
      if (q && !task.title.toLowerCase().includes(q) && !(task.code ?? '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [filters, tasks, filterAssignee, filterPriority, search]);

  /** Distinct assignees actually present on the board (so the runtime filter
   *  bar's dropdown only lists relevant users). */
  const assigneesInBoard = useMemo(() => {
    const ids = new Set<string>();
    tasks.forEach(t => { if (t.assigneeId) ids.add(t.assigneeId); });
    return Array.from(ids)
      .map(id => wsUsers.find(u => u.id === id))
      .filter(Boolean) as WSUser[];
  }, [tasks, wsUsers]);

  /** Priority sort rank: respect priorities.sortOrder so urgent surfaces first. */
  const priorityRankByName = useMemo(() => {
    const map: Record<string, number> = {};
    const sorted = [...priorities].sort((a, b) => b.sortOrder - a.sortOrder);
    sorted.forEach((p, i) => { map[p.name.toLowerCase()] = i; });
    return map;
  }, [priorities]);

  /** Visible tasks grouped by column id. A task belongs to a column when
   *  its stateId is in the column's stateIds list. */
  const tasksByColumn = useMemo(() => {
    const map: Record<string, Task[]> = {};
    sortedColumns.forEach(c => { map[c.id] = []; });
    // Build a stateId → columnId index for O(1) lookup. The first column
    // that owns a state wins; the modal already prevents the same state
    // from being mapped to two columns.
    const stateToCol = new Map<string, string>();
    sortedColumns.forEach(c => c.stateIds.forEach(id => {
      if (!stateToCol.has(id)) stateToCol.set(id, c.id);
    }));
    visibleTasks.forEach(task => {
      const colId = task.stateId ? stateToCol.get(task.stateId) : undefined;
      if (colId && map[colId]) map[colId].push(task);
    });
    Object.values(map).forEach(arr => {
      if (sortBy === 'priority') {
        arr.sort((a, b) => {
          const ra = priorityRankByName[(a.priority ?? '').toLowerCase()] ?? -1;
          const rb = priorityRankByName[(b.priority ?? '').toLowerCase()] ?? -1;
          return rb - ra;
        });
      } else if (sortBy === 'assignee') {
        arr.sort((a, b) => {
          const na = wsUsers.find(u => u.id === a.assigneeId)?.name ?? '';
          const nb = wsUsers.find(u => u.id === b.assigneeId)?.name ?? '';
          return na.localeCompare(nb);
        });
      } else {
        arr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      }
    });
    return map;
  }, [sortedColumns, visibleTasks, sortBy, priorityRankByName, wsUsers]);

  /** Auto-clear toast after 3s. */
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const totalActive = visibleTasks.length;
  const distinctTypeCount = new Set(visibleTasks.map(t => t.taskTypeId)).size;
  const isOwner = board?.ownerId === currentUser.id;
  const canEditConfig = isOwner || myPermission === 'edit';

  const onDragStart = (taskId: string) => (e: React.DragEvent) => {
    setDragTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  };
  const onDragEnd = () => {
    setDragTaskId(null);
    setDropColumnId(null);
  };
  const onColDragOver = (columnId: string) => (e: React.DragEvent) => {
    if (!dragTaskId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const task = tasks.find(x => x.id === dragTaskId);
    if (!task) return;
    const destCol = sortedColumns.find(c => c.id === columnId);
    if (!destCol) return;
    // No glow when dropping on the column the task already belongs to.
    if (task.stateId && destCol.stateIds.includes(task.stateId)) return;
    if (dropColumnId !== columnId) setDropColumnId(columnId);
  };
  const onColDragLeave = () => setDropColumnId(null);
  const onColDrop = (columnId: string) => async (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragTaskId) return;
    const id = dragTaskId;
    setDragTaskId(null);
    setDropColumnId(null);
    const task = tasks.find(x => x.id === id);
    if (!task) return;

    const destCol = sortedColumns.find(c => c.id === columnId);
    if (!destCol || destCol.stateIds.length === 0) return;
    // Already in this column → no-op (the user dropped on the same group).
    if (task.stateId && destCol.stateIds.includes(task.stateId)) return;

    // Enforce WIP limit on the destination column.
    if (destCol.wipLimit != null) {
      const currentCount = tasksByColumn[columnId]?.length ?? 0;
      if (currentCount >= destCol.wipLimit) {
        setToast(t('vectorLogic.boardWipLimitReachedToast'));
        return;
      }
    }

    // Pick the first state of the destination column. The modal guarantees
    // each column has at least one state when used; the empty-states case is
    // guarded above.
    const destStateId = destCol.stateIds[0];

    // Optimistic update
    setTasks(prev => prev.map(x => x.id === id ? { ...x, stateId: destStateId } : x));
    try {
      await taskRepo.moveToState(id, destStateId);
    } catch (err) {
      setTasks(prev => prev.map(x => x.id === id ? { ...x, stateId: task.stateId } : x));
    }
  };

  /** Open the TaskDetailModal. Loads workflow states for the task's own
   *  workflow on demand so the modal's state dropdown lists every legal
   *  destination (independent of which states the board exposes). */
  const openTaskDetail = async (task: Task) => {
    const tt = taskTypeById.get(task.taskTypeId);
    const wfId = tt?.workflowId;
    if (wfId) {
      try {
        const ws = await stateRepo.findByWorkflow(wfId);
        setDetailWfStates(ws);
      } catch {
        setDetailWfStates([]);
      }
    } else {
      setDetailWfStates([]);
    }
    setDetailTask(task);
  };

  const handleTaskUpdate = async (taskId: string, patch: Partial<Task>) => {
    await taskRepo.update(taskId, patch);
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, ...patch } : x));
    setDetailTask(prev => prev && prev.id === taskId ? { ...prev, ...patch } : prev);
  };

  const handleTaskDelete = async (taskId: string) => {
    await taskRepo.remove(taskId);
    setTasks(prev => prev.filter(x => x.id !== taskId));
    setDetailTask(null);
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
      {toast && (
        <div role="status" style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          padding: '10px 14px', borderRadius: 8,
          background: 'var(--amber-dim)', color: 'var(--amber)',
          fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 8px 30px rgba(0,0,0,.4)', maxWidth: 360,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>warning</span>
          <span>{toast}</span>
        </div>
      )}
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
        {canEditConfig && (
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

      {/* Runtime filter bar (shared with Smart Kanban Auto) */}
      <div style={{ flexShrink: 0 }}>
        <KanbanFilters
          search={search}
          onSearchChange={setSearch}
          filterAssignee={filterAssignee}
          onFilterAssigneeChange={setFilterAssignee}
          assignees={assigneesInBoard}
          filterPriority={filterPriority}
          onFilterPriorityChange={setFilterPriority}
          priorities={priorities}
          sortBy={sortBy}
          onSortByChange={setSortBy}
        />
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
            const colTasks = tasksByColumn[col.id] ?? [];
            const isDropTarget = dropColumnId === col.id;
            // Accent comes from the first state mapped to this column (the
            // user's "primary" choice). Fallback to grey when none.
            const firstState = col.stateIds.length > 0 ? stateById.get(col.stateIds[0]) : undefined;
            const accent = firstState?.color
              || CAT_COLORS[(firstState?.category as StateCategory) ?? 'OPEN'];
            const wipReached = col.wipLimit != null && colTasks.length >= col.wipLimit;
            return (
              <div
                key={col.id}
                onDragOver={onColDragOver(col.id)}
                onDragLeave={onColDragLeave}
                onDrop={onColDrop(col.id)}
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
                    {col.name}
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
                      onClick={() => openTaskDetail(task)}
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

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          taskType={taskTypeById.get(detailTask.taskTypeId) ?? taskTypes[0] ?? null as any}
          taskTypes={taskTypes}
          wfStates={detailWfStates}
          wsUsers={wsUsers as any}
          priorities={priorities}
          currentUser={currentUser}
          onClose={() => setDetailTask(null)}
          onUpdate={(patch) => handleTaskUpdate(detailTask.id, patch)}
          onDelete={() => handleTaskDelete(detailTask.id)}
          onOpenTask={(t) => openTaskDetail(t)}
        />
      )}
    </div>
  );
}

/* ── Task card ─────────────────────────────────────────────────────────── */
function BoardTaskCard({ task, taskType, assignee, priority, onClick, onDragStart, onDragEnd, isDragging }: {
  task: Task;
  taskType: TaskType | null;
  assignee: WSUser | null;
  priority: Priority | null;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onClick={(e) => { if (!isDragging) onClick(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: 'var(--sf3)', borderRadius: 10, padding: '10px 12px',
        cursor: isDragging ? 'grabbing' : 'pointer',
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
            background: `${priority.color}1A`, color: priority.color,
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
