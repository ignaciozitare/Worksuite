import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@worksuite/i18n';
import { GanttTimeline, type GanttBar } from '@worksuite/ui';
import {
  boardRepo, boardColumnRepo, boardFilterRepo,
  stateRepo, taskRepo, taskTypeRepo, priorityRepo,
} from '../../container';
import type { KanbanBoard } from '../../domain/entities/KanbanBoard';
import type { BoardColumn } from '../../domain/entities/BoardColumn';
import type { BoardFilter } from '../../domain/entities/BoardFilter';
import type { BoardPermission } from '../../domain/entities/BoardMember';
import type { State, WorkflowState } from '../../domain/entities/State';
import type { Task } from '../../domain/entities/Task';
import type { TaskType } from '../../domain/entities/TaskType';
import type { Priority } from '../../domain/entities/Priority';
import type { SchemaField } from '../../domain/entities/FieldType';
import { TaskDetailModal } from './KanbanView';
import { BoardViewToggle } from '../components/BoardViewToggle';

interface WSUser {
  id: string;
  name?: string;
  email: string;
  avatar?: string;
  avatarUrl?: string | null;
}

interface Props {
  boardId: string;
  currentUser: { id: string; name?: string; email: string; role?: string; [k: string]: unknown };
  wsUsers?: WSUser[];
  myPermission?: BoardPermission | null;
}

type Zoom = 'days' | 'weeks' | 'months';

/**
 * Vector Logic — Gantt view per board.
 *
 * Composes the shared `<GanttTimeline>` from `@worksuite/ui` and supplies
 * the two extension slots so the Gantt acquires Vector-Logic-specific
 * touches WITHOUT duplicating the timeline / drag / resize / zoom logic
 * that Deploy Planner and Environments already use:
 *
 *   - `renderLabel`   — chevron + indent for hierarchy + task code + title.
 *   - `renderBarContent` — dual progress fill (green ToDo + purple subtask).
 *
 * Module-specific behaviour stays here:
 *
 *   - Pulling tasks for the board through the existing repos.
 *   - Showing a banner with inline date pickers for tasks missing dates.
 *   - Expand/collapse subtask rows by flattening parent + children in
 *     order and emitting different `bar.label` / indentation per row.
 *   - Routing the click to the existing TaskDetailModal.
 */
export function GanttView({ boardId, currentUser, wsUsers = [], myPermission }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // ── Data ─────────────────────────────────────────────────────────────────

  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [filters, setFilters] = useState<BoardFilter[]>([]);
  const [allStates, setAllStates] = useState<State[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [detailWfStates, setDetailWfStates] = useState<WorkflowState[]>([]);

  // ── UI state ─────────────────────────────────────────────────────────────

  const [zoom, setZoom] = useState<Zoom>('days');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showPending, setShowPending] = useState(false);
  const [labelWidth, setLabelWidth] = useState<number>(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('vl-gantt-label-width') : null;
    const n = stored ? Number(stored) : NaN;
    return Number.isFinite(n) && n >= 120 && n <= 600 ? n : 280;
  });
  const persistLabelWidth = (w: number) => {
    setLabelWidth(w);
    try { window.localStorage.setItem('vl-gantt-label-width', String(w)); } catch { /* quota */ }
  };

  const isOwner = board?.ownerId === currentUser.id;
  // `use` permission is read-only for the timeline (no drag / resize).
  const canEdit = isOwner || myPermission === 'edit';

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
        if (!b) { setError(t('vectorLogic.boardNotFound')); setLoading(false); return; }
        setBoard(b);
        setColumns(cols);
        setFilters(flts);
        setAllStates(states);
        setTaskTypes(types);
        setPriorities(prs);
        const colStateIds = new Set<string>();
        for (const c of cols) c.stateIds.forEach(id => colStateIds.add(id));
        setTasks(allTasks.filter(x => x.stateId && colStateIds.has(x.stateId)));
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) { setError(err?.message ?? 'Failed to load board'); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [boardId, currentUser.id, t]);

  // ── Derived ──────────────────────────────────────────────────────────────

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

  const childrenByParent = useMemo(() => {
    const m = new Map<string, Task[]>();
    tasks.forEach(t => {
      if (!t.parentTaskId) return;
      const arr = m.get(t.parentTaskId) ?? [];
      arr.push(t);
      m.set(t.parentTaskId, arr);
    });
    return m;
  }, [tasks]);

  /** Tasks visible per board filters (config-time scope). */
  const visibleTasks = useMemo(() => {
    const byDim = new Map<string, BoardFilter[]>();
    for (const f of filters) {
      const arr = byDim.get(f.dimension) ?? [];
      arr.push(f);
      byDim.set(f.dimension, arr);
    }
    const taskTypeF = (byDim.get('task_type')?.[0]?.value ?? null) as string[] | null;
    const assigneeF = (byDim.get('assignee')?.[0]?.value ?? null) as string[] | null;
    const priorityF = (byDim.get('priority')?.[0]?.value ?? null) as string[] | null;
    return tasks.filter(task => {
      if (taskTypeF?.length && !taskTypeF.includes(task.taskTypeId)) return false;
      if (assigneeF?.length && (!task.assigneeId || !assigneeF.includes(task.assigneeId))) return false;
      if (priorityF?.length) {
        const p = (task.priority ?? '').toLowerCase();
        if (!priorityF.map(x => x.toLowerCase()).includes(p)) return false;
      }
      return true;
    });
  }, [tasks, filters]);

  const rootTasks = useMemo(
    () => visibleTasks.filter(t => !t.parentTaskId).sort((a, b) => a.sortOrder - b.sortOrder),
    [visibleTasks],
  );

  /** Tasks with both start AND due — they get a bar. The rest go to the banner. */
  const datedTasks = useMemo(
    () => visibleTasks.filter(t => t.startDate && t.dueDate),
    [visibleTasks],
  );
  const pendingDateTasks = useMemo(
    () => visibleTasks.filter(t => !t.startDate || !t.dueDate),
    [visibleTasks],
  );

  /**
   * Build the flat ordered list of tasks to render in the Gantt:
   * each parent task first, followed by its children when expanded.
   * The level (0/1) is preserved as part of the row id so the renderLabel
   * slot can inject the right indentation.
   */
  type Row = { task: Task; level: number };
  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const root of rootTasks) {
      out.push({ task: root, level: 0 });
      if (expanded.has(root.id)) {
        const children = childrenByParent.get(root.id) ?? [];
        children
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .forEach(c => out.push({ task: c, level: 1 }));
      }
    }
    return out;
  }, [rootTasks, expanded, childrenByParent]);

  /** Map row.task.id → Row for fast lookup inside the slots. */
  const rowsById = useMemo(() => {
    const m = new Map<string, Row>();
    rows.forEach(r => m.set(r.task.id, r));
    return m;
  }, [rows]);

  /**
   * Adapt rows that have both dates to the GanttBar shape `<GanttTimeline>`
   * understands. Rows without dates are NOT added — they live in the
   * banner above the chart instead, where the user can fill their dates
   * inline. Once both dates are set the row appears in the timeline.
   */
  const bars: GanttBar[] = useMemo(() => {
    return rows
      .filter(r => r.task.startDate && r.task.dueDate)
      .map(({ task }) => {
        const stateColor = task.stateId ? stateById.get(task.stateId)?.color ?? null : null;
        const tint = stateColor || 'var(--ac)';
        return {
          id: task.id,
          label: task.title,
          startDate: task.startDate!,
          endDate: task.dueDate!,
          color: tint,
          bgColor: `${tint}22`,
        } as GanttBar;
      });
  }, [rows, stateById]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const updateTask = async (taskId: string, patch: Partial<Task>) => {
    await taskRepo.update(taskId, patch);
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, ...patch } : x));
    setDetailTask(prev => prev && prev.id === taskId ? { ...prev, ...patch } : prev);
  };

  const handleBarMove = async (id: string, startDate: string, endDate: string) => {
    if (!canEdit) return;
    await updateTask(id, { startDate, dueDate: endDate });
  };

  const openDetail = async (task: Task) => {
    const tt = taskTypeById.get(task.taskTypeId);
    if (tt?.workflowId) {
      try {
        const ws = await stateRepo.findByWorkflow(tt.workflowId);
        setDetailWfStates(ws);
      } catch { setDetailWfStates([]); }
    } else {
      setDetailWfStates([]);
    }
    setDetailTask(task);
  };

  const onBarClick = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (task) void openDetail(task);
  };

  // ── Slots passed to GanttTimeline ────────────────────────────────────────

  /** Custom label slot — adds chevron + indent + type icon + code + title. */
  const renderLabel = (bar: GanttBar) => {
    const row = rowsById.get(bar.id);
    if (!row) return null;
    const { task, level } = row;
    const tt = taskTypeById.get(task.taskTypeId) ?? null;
    const hasChildren = (childrenByParent.get(task.id)?.length ?? 0) > 0;
    const isExpanded = expanded.has(task.id);

    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        paddingLeft: level * 18,
      }}>
        {level === 0 && hasChildren ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}
            aria-label="Toggle subtasks"
            style={{
              width: 20, height: 20, padding: 0, border: 'none',
              background: 'transparent', cursor: 'pointer',
              color: 'var(--tx2)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-sm)' }}>
              {isExpanded ? 'expand_more' : 'chevron_right'}
            </span>
          </button>
        ) : (
          <span style={{ width: 20, height: 20, flexShrink: 0 }} />
        )}
        {tt?.icon && (
          <span className="material-symbols-outlined" style={{
            fontSize: 'var(--icon-xs)',
            color: tt.iconColor || 'var(--tx3)',
          }}>
            {tt.icon}
          </span>
        )}
        {task.code && (
          <span style={{
            fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--ac)',
            fontFamily: "'Space Grotesk',sans-serif", letterSpacing: '.04em',
          }}>
            {task.code}
          </span>
        )}
        <span style={{
          fontSize: 'var(--fs-xs)', color: 'var(--tx)',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {task.title}
        </span>
      </div>
    );
  };

  /** Custom bar content slot — dual progress fill (green ToDo + purple subtask).
   *  Stack vertically inside the bar: ToDo on top, subtasks on bottom. Each
   *  uses half the bar height when both apply, full height when only one. */
  const renderBarContent = (bar: GanttBar, _barWidth: number) => {
    const row = rowsById.get(bar.id);
    if (!row) return null;
    const { task } = row;
    const tt = taskTypeById.get(task.taskTypeId);
    const schema = ((tt?.schema as SchemaField[]) || []);

    // ToDo % done across all ToDo fields combined.
    const todoItems = schema
      .filter(f => f.fieldType === 'todo')
      .map(f => (task.data ?? {})[f.id])
      .filter((v): v is Array<{ checked?: boolean }> => Array.isArray(v) && v.length > 0)
      .flat();
    const todoTotal = todoItems.length;
    const todoDone = todoItems.filter(it => !!it?.checked).length;
    const todoPct = todoTotal > 0 ? todoDone / todoTotal : null;

    // Subtask % done — uses state.category to detect DONE.
    const subtasks = childrenByParent.get(task.id) ?? [];
    const subtaskTotal = subtasks.length;
    const subtaskDone = subtasks.filter(s => {
      const cat = s.stateId ? stateById.get(s.stateId)?.category ?? null : null;
      return cat === 'DONE';
    }).length;
    const subtaskPct = subtaskTotal > 0 ? subtaskDone / subtaskTotal : null;

    const hasTodo = todoPct !== null;
    const hasSubtask = subtaskPct !== null;

    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
        {hasTodo && (
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: 0,
              width: `${(todoPct as number) * 100}%`,
              background: 'var(--green)', opacity: 0.7,
              transition: 'width .15s',
            }} />
          </div>
        )}
        {hasSubtask && (
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: 0,
              width: `${(subtaskPct as number) * 100}%`,
              background: 'var(--purple)', opacity: 0.7,
              transition: 'width .15s',
            }} />
          </div>
        )}
        {/* Code label centered on top of the fills, only if there's room. */}
        {task.code && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center',
            padding: '0 8px',
            fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--tx)',
            letterSpacing: '.04em', pointerEvents: 'none',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}>
            {task.code}
          </div>
        )}
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--tx3)' }}>{t('common.loading')}</div>;
  }
  if (error || !board) {
    return <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--red)' }}>{error ?? t('vectorLogic.boardNotFound')}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      {/* Custom header — own zoom + view-switcher */}
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12,
        padding: '4px 0 18px',
      }}>
        <h1 style={{
          fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--tx)',
          letterSpacing: '-0.01em', margin: 0,
          fontFamily: "'Space Grotesk',sans-serif",
        }}>
          {board.name}
        </h1>
        <span style={{
          padding: '2px 8px', borderRadius: 4,
          background: board.visibility === 'shared' ? 'var(--ac-dim)' : 'rgba(181,124,246,.15)',
          color: board.visibility === 'shared' ? 'var(--ac-strong)' : 'var(--purple)',
          fontSize: 'var(--fs-2xs)', fontWeight: 700, letterSpacing: '.05em',
          textTransform: 'uppercase',
        }}>
          {board.visibility === 'shared' ? t('vectorLogic.boardShared') : t('vectorLogic.boardPersonal')}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{
          display: 'inline-flex', background: 'var(--sf2)', border: '1px solid var(--bd)',
          borderRadius: 8, overflow: 'hidden',
        }}>
          {(['days', 'weeks', 'months'] as Zoom[]).map(z => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              style={{
                padding: '6px 14px', border: 'none', cursor: 'pointer',
                background: zoom === z ? 'var(--ac)' : 'transparent',
                color: zoom === z ? 'var(--ac-on)' : 'var(--tx2)',
                fontSize: 'var(--fs-2xs)', fontWeight: 700,
                letterSpacing: '.04em', textTransform: 'uppercase',
                fontFamily: 'inherit',
              }}
            >
              {z === 'days' ? t('vectorLogic.ganttZoomDays')
                : z === 'weeks' ? t('vectorLogic.ganttZoomWeeks')
                : t('vectorLogic.ganttZoomMonths')}
            </button>
          ))}
        </div>
        <BoardViewToggle boardId={boardId} active="gantt" />
      </div>

      {pendingDateTasks.length > 0 && (
        <div style={{
          padding: '10px 16px',
          background: 'var(--amber-dim)', color: 'var(--amber)',
          borderRadius: 8, marginBottom: 14,
          fontSize: 'var(--fs-xs)', fontWeight: 600,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-sm)' }}>warning</span>
            <span style={{ flex: 1 }}>
              {t('vectorLogic.ganttPendingDates', { count: String(pendingDateTasks.length) })}
            </span>
            <button
              type="button"
              onClick={() => setShowPending(v => !v)}
              style={{
                padding: '4px 10px', borderRadius: 6,
                background: 'transparent', color: 'var(--amber)',
                border: '1px solid var(--amber)',
                fontSize: 'var(--fs-2xs)', fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {showPending ? t('vectorLogic.ganttPendingDatesHide') : t('vectorLogic.ganttPendingDatesShow')}
            </button>
          </div>
          {showPending && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
              {pendingDateTasks.map(task => (
                <PendingDateRow
                  key={task.id}
                  task={task}
                  taskType={taskTypeById.get(task.taskTypeId) ?? null}
                  onSave={(patch) => updateTask(task.id, patch)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {bars.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--tx3)' }}>
          {t('vectorLogic.ganttNoTasks')}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <GanttTimeline
            bars={bars}
            zoom={zoom}
            onZoomChange={setZoom}
            {...(canEdit ? { onBarMove: handleBarMove } : {})}
            onBarClick={onBarClick}
            labelWidth={labelWidth}
            onLabelWidthChange={persistLabelWidth}
            showHeader={false}
            showHelpText={false}
            renderLabel={renderLabel}
            renderBarContent={renderBarContent}
            zoomLabels={[
              t('vectorLogic.ganttZoomDays'),
              t('vectorLogic.ganttZoomWeeks'),
              t('vectorLogic.ganttZoomMonths'),
            ]}
          />
        </div>
      )}

      {bars.length > 0 && canEdit && (
        <div style={{
          fontSize: 'var(--fs-2xs)', color: 'var(--tx3)',
          marginTop: 8, padding: '0 4px',
        }}>
          {t('vectorLogic.ganttDragHelp')}
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
          isAdmin={currentUser.role === 'admin'}
          onClose={() => setDetailTask(null)}
          onUpdate={(patch) => updateTask(detailTask.id, patch)}
          onDelete={async () => {
            await taskRepo.remove(detailTask.id);
            setTasks(prev => prev.filter(x => x.id !== detailTask.id));
            setDetailTask(null);
          }}
          onSubtaskChanged={(sub) => {
            setTasks(prev => {
              const idx = prev.findIndex(t => t.id === sub.id);
              if (idx >= 0) { const next = [...prev]; next[idx] = sub; return next; }
              return [...prev, sub];
            });
          }}
          onOpenTask={async (id) => {
            const found = await taskRepo.findById(id);
            if (found) await openDetail(found);
          }}
        />
      )}
    </div>
  );
}

/** Inline row inside the "pending dates" banner — same as before. */
function PendingDateRow({
  task, taskType, onSave,
}: {
  task: Task;
  taskType: TaskType | null;
  onSave: (patch: Partial<Task>) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [start, setStart] = useState<string>(task.startDate ?? '');
  const [due, setDue] = useState<string>(task.dueDate ?? '');

  const commit = async () => {
    const patch: Partial<Task> = {};
    if ((task.startDate ?? '') !== start) patch.startDate = start || null;
    if ((task.dueDate ?? '') !== due) patch.dueDate = due || null;
    if (Object.keys(patch).length === 0) return;
    if (start && due && start > due) return;
    await onSave(patch);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 8px', background: 'var(--sf)',
      borderRadius: 6,
    }}>
      {taskType?.icon && (
        <span className="material-symbols-outlined" style={{
          fontSize: 'var(--icon-xs)', color: taskType.iconColor || 'var(--tx3)',
        }}>
          {taskType.icon}
        </span>
      )}
      {task.code && (
        <span style={{
          fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--ac)',
          fontFamily: "'Space Grotesk',sans-serif",
        }}>
          {task.code}
        </span>
      )}
      <span style={{
        flex: 1, fontSize: 'var(--fs-xs)', color: 'var(--tx)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {task.title}
      </span>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx2)', fontWeight: 600 }}>
          {t('vectorLogic.ganttSetStartDate')}
        </span>
        <input
          type="date"
          value={start}
          onChange={e => setStart(e.target.value)}
          onBlur={() => void commit()}
          style={{
            padding: '4px 6px', borderRadius: 4,
            background: 'var(--sf2)', color: 'var(--tx)',
            border: '1px solid var(--bd)',
            fontFamily: 'inherit', fontSize: 'var(--fs-2xs)',
          }}
        />
      </label>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx2)', fontWeight: 600 }}>
          {t('vectorLogic.ganttSetDueDate')}
        </span>
        <input
          type="date"
          value={due}
          onChange={e => setDue(e.target.value)}
          onBlur={() => void commit()}
          style={{
            padding: '4px 6px', borderRadius: 4,
            background: 'var(--sf2)', color: 'var(--tx)',
            border: '1px solid var(--bd)',
            fontFamily: 'inherit', fontSize: 'var(--fs-2xs)',
          }}
        />
      </label>
    </div>
  );
}
