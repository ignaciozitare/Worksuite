// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@worksuite/i18n';
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
import { GanttBar } from '../components/GanttBar';

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

const DAY_WIDTH: Record<Zoom, number> = { days: 32, weeks: 12, months: 4 };
const HEADER_H: Record<Zoom, number> = { days: 44, weeks: 36, months: 36 };

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* Vector Logic — Gantt view per board.
 *
 * Layout: a fixed left column with task names + chevron expand/collapse,
 * and a right area that scrolls horizontally with date marks and bars.
 * The bars come from `<GanttBar>`, which renders the dual progress fill
 * (green for ToDo % and purple for subtask %) inside each bar.
 *
 * Tasks with start_date AND due_date render as bars; the rest go to a
 * dismissable banner at the top with inline date pickers.
 */
export function GanttView({ boardId, currentUser, wsUsers = [], myPermission }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // ── Data ─────────────────────────────────────────────────────────────────

  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [filters, setFilters] = useState<BoardFilter[]>([]);
  const [allStates, setAllStates] = useState<State[]>([]);
  const [allWorkflowStates, setAllWorkflowStates] = useState<WorkflowState[]>([]);
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

  const isOwner = board?.ownerId === currentUser.id;
  // `use` permission is read-only for the timeline (no drag / resize).
  // Only owner or `edit` member can persist date changes via drag.
  const canEdit = isOwner || myPermission === 'edit';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [b, cols, flts, states, allWfs, allTasks, types, prs] = await Promise.all([
          boardRepo.findById(boardId),
          boardColumnRepo.findByBoard(boardId),
          boardFilterRepo.findByBoard(boardId),
          stateRepo.findAll(),
          stateRepo.findAllWorkflowStates(),
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
        setAllWorkflowStates(allWfs);
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

  const stateCategoryById = useMemo(() => {
    const m = new Map<string, string>();
    allStates.forEach(s => m.set(s.id, s.category));
    return m;
  }, [allStates]);

  const taskTypeById = useMemo(() => {
    const m = new Map<string, TaskType>();
    taskTypes.forEach(tt => m.set(tt.id, tt));
    return m;
  }, [taskTypes]);

  /** All children grouped by parent id, scoped to the loaded tasks. */
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

  /** Tasks visible per board filters (config-time scope). For brevity we
   *  ignore due_from/due_to filters here since the Gantt itself is a date
   *  visualization — the user can scroll to see anything. */
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

  /** Top-level tasks (no parent) shown in the main row list. Sub-rows for
   *  expanded parents are interleaved at render time. */
  const rootTasks = useMemo(
    () => visibleTasks.filter(t => !t.parentTaskId).sort((a, b) => a.sortOrder - b.sortOrder),
    [visibleTasks],
  );

  /** Tasks with both start AND due dates — they get a bar in the timeline. */
  const datedTasks = useMemo(
    () => visibleTasks.filter(t => t.startDate && t.dueDate),
    [visibleTasks],
  );

  /** Tasks missing at least one of the two dates — they go in the banner. */
  const pendingDateTasks = useMemo(
    () => visibleTasks.filter(t => !t.startDate || !t.dueDate),
    [visibleTasks],
  );

  // Compute the time range of the chart from the dated tasks.
  const { rangeStart, totalDays } = useMemo(() => {
    if (datedTasks.length === 0) {
      const today = new Date();
      const start = addDaysISO(toISO(today), -7);
      return { rangeStart: start, totalDays: 30 };
    }
    const allStarts = datedTasks.map(t => t.startDate!).sort();
    const allDues = datedTasks.map(t => t.dueDate!).sort();
    const earliest = allStarts[0];
    const latest = allDues[allDues.length - 1];
    const start = addDaysISO(earliest, -7);
    const end = addDaysISO(latest, 14);
    return { rangeStart: start, totalDays: Math.max(diffDaysISO(start, end), 30) };
  }, [datedTasks]);

  const dayW = DAY_WIDTH[zoom];
  const headerH = HEADER_H[zoom];
  const ROW_H = 44;
  const LABEL_W = 280;
  const todayISO = toISO(new Date());

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

  const handleBarDates = (taskId: string) => async (next: { startDate: string; dueDate: string }) => {
    await updateTask(taskId, next);
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

  // ── Rendering ────────────────────────────────────────────────────────────

  if (loading) {
    return <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--tx3)' }}>{t('common.loading')}</div>;
  }
  if (error || !board) {
    return <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--red)' }}>{error ?? t('vectorLogic.boardNotFound')}</div>;
  }

  // Build the flat row list — top-level tasks plus their subtasks when
  // expanded. Each row knows its indentation level (0 = parent, 1 = child).
  type Row = { task: Task; level: number };
  const rows: Row[] = [];
  for (const root of rootTasks) {
    rows.push({ task: root, level: 0 });
    if (expanded.has(root.id)) {
      const children = childrenByParent.get(root.id) ?? [];
      children
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .forEach(c => rows.push({ task: c, level: 1 }));
    }
  }

  const marks = generateMarks(rangeStart, totalDays, zoom);
  const totalChartW = totalDays * dayW;
  const todayX = diffDaysISO(rangeStart, todayISO) * dayW;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      {/* Header */}
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
        {/* Zoom selector */}
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
        {/* View switcher: Gantt → Board */}
        <button
          type="button"
          onClick={() => navigate(`/vector-logic/board/${boardId}`)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8,
            background: 'var(--sf2)', color: 'var(--tx)',
            border: '1px solid var(--bd)',
            fontSize: 'var(--fs-2xs)', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-xs)' }}>view_kanban</span>
          {t('vectorLogic.ganttSwitchToBoard')}
        </button>
      </div>

      {/* Pending dates banner */}
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
              {t('vectorLogic.ganttPendingDates', { count: pendingDateTasks.length })}
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

      {rows.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--tx3)' }}>
          {t('vectorLogic.ganttNoTasks')}
        </div>
      ) : (
        <div style={{
          flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'auto',
          background: 'var(--sf)',
          border: '1px solid var(--bd)', borderRadius: 8,
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column',
            width: LABEL_W + totalChartW, minWidth: '100%',
            position: 'relative',
          }}>
            {/* Date header — sticky on top */}
            <div style={{
              display: 'flex',
              height: headerH,
              borderBottom: '1px solid var(--bd)',
              position: 'sticky', top: 0, zIndex: 5,
              background: 'var(--sf)',
            }}>
              <div style={{
                width: LABEL_W, flexShrink: 0,
                borderRight: '1px solid var(--bd)',
                display: 'flex', alignItems: 'center',
                paddingLeft: 14,
                fontSize: 'var(--fs-2xs)', fontWeight: 700,
                color: 'var(--tx3)', letterSpacing: '.06em',
                textTransform: 'uppercase',
              }}>
                {t('vectorLogic.taskTitle')}
              </div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {marks.map(m => {
                  const x = diffDaysISO(rangeStart, m.date) * dayW;
                  const isToday = zoom === 'days'
                    ? m.date === todayISO
                    : zoom === 'weeks'
                      ? m.date <= todayISO && addDaysISO(m.date, 7) > todayISO
                      : m.date.slice(0, 7) === todayISO.slice(0, 7);
                  return (
                    <div key={m.date} style={{
                      position: 'absolute', left: x, top: 0, height: '100%',
                      borderLeft: `1px solid ${isToday ? 'var(--amber)' : 'var(--bd)'}`,
                      display: 'flex', flexDirection: 'column',
                      paddingLeft: 4, justifyContent: 'center',
                    }}>
                      <span style={{
                        fontSize: zoom === 'days' ? 'var(--fs-2xs)' : 11,
                        color: isToday ? 'var(--amber)' : 'var(--tx2)',
                        fontWeight: isToday ? 700 : 500,
                        whiteSpace: 'nowrap', lineHeight: 1.2,
                      }}>
                        {m.label}
                      </span>
                      {zoom === 'days' && (
                        <span style={{
                          fontSize: 'var(--fs-2xs)', fontWeight: 700,
                          color: isToday ? 'var(--amber)' : m.isWeekend ? 'var(--tx3)' : 'var(--tx)',
                          lineHeight: 1,
                        }}>
                          {m.sub}
                        </span>
                      )}
                    </div>
                  );
                })}
                {/* Today line */}
                <div style={{
                  position: 'absolute', left: todayX, top: 0, height: '100%',
                  borderLeft: '1px dashed var(--amber)',
                  pointerEvents: 'none',
                }} />
              </div>
            </div>

            {/* Rows */}
            {rows.map(({ task, level }, idx) => {
              const tt = taskTypeById.get(task.taskTypeId) ?? null;
              const taskState = task.stateId ? stateById.get(task.stateId) ?? null : null;
              const stateColor = taskState?.color ?? null;
              const isParent = level === 0 && (childrenByParent.get(task.id)?.length ?? 0) > 0;
              const isExpanded = expanded.has(task.id);
              const inDateTimeline = !!(task.startDate && task.dueDate);
              const x1 = inDateTimeline ? diffDaysISO(rangeStart, task.startDate!) * dayW : 0;
              const x2 = inDateTimeline ? diffDaysISO(rangeStart, task.dueDate!) * dayW + dayW : 0;
              const barWidth = Math.max(x2 - x1, dayW);
              const subtasks = childrenByParent.get(task.id) ?? [];
              const schema = ((tt?.schema as SchemaField[]) || []);

              return (
                <div key={task.id} style={{
                  display: 'flex', height: ROW_H,
                  borderBottom: '1px solid var(--bd)',
                  position: 'relative',
                  background: idx % 2 === 0 ? 'transparent' : 'var(--sf2)',
                }}>
                  {/* Label column */}
                  <div style={{
                    width: LABEL_W, flexShrink: 0,
                    borderRight: '1px solid var(--bd)',
                    paddingLeft: 14 + level * 20,
                    paddingRight: 12,
                    display: 'flex', alignItems: 'center', gap: 8,
                    cursor: 'pointer',
                  }}
                    onClick={() => openDetail(task)}
                  >
                    {isParent ? (
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

                  {/* Chart area */}
                  <div style={{ flex: 1, position: 'relative', height: '100%' }}>
                    {/* Weekend shading for days zoom */}
                    {zoom === 'days' && marks.filter(m => m.isWeekend).map(m => (
                      <div key={m.date} style={{
                        position: 'absolute',
                        left: diffDaysISO(rangeStart, m.date) * dayW,
                        top: 0, width: dayW, height: '100%',
                        background: 'rgba(0,0,0,.18)', pointerEvents: 'none',
                      }} />
                    ))}
                    {/* Today line */}
                    <div style={{
                      position: 'absolute', left: todayX, top: 0, height: '100%',
                      borderLeft: '1px dashed rgba(245,158,11,.35)',
                      pointerEvents: 'none',
                    }} />
                    {inDateTimeline ? (
                      <GanttBar
                        task={task}
                        schema={schema}
                        subtasks={subtasks}
                        stateCategoryById={stateCategoryById}
                        stateColor={stateColor}
                        left={x1}
                        width={barWidth}
                        readOnly={!canEdit}
                        dayWidth={dayW}
                        onClick={() => openDetail(task)}
                        onDatesChange={handleBarDates(task.id)}
                      />
                    ) : (
                      <div style={{
                        position: 'absolute', left: 8, top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: 'var(--fs-2xs)', color: 'var(--tx3)',
                        fontStyle: 'italic',
                      }}>
                        — {t('vectorLogic.ganttPendingDatesShow')} —
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Help text under the chart */}
      {datedTasks.length > 0 && (
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

/** Inline row used inside the "pending dates" banner. Shows the task code +
 *  title and two date inputs (start / due). Saves on blur. */
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

// ── Date helpers (local) ─────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function diffDaysISO(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86_400_000,
  );
}

interface Mark { date: string; label: string; sub?: string; isWeekend?: boolean }

function generateMarks(startISO: string, totalDays: number, zoom: Zoom): Mark[] {
  const out: Mark[] = [];
  if (zoom === 'days') {
    const d = new Date(startISO + 'T00:00:00');
    for (let i = 0; i < totalDays; i++) {
      const iso = toISO(d);
      const dow = d.getDay();
      out.push({
        date: iso,
        label: DAYS_SHORT[dow]!,
        sub: String(d.getDate()),
        isWeekend: dow === 0 || dow === 6,
      });
      d.setDate(d.getDate() + 1);
    }
  } else if (zoom === 'weeks') {
    const d = new Date(startISO + 'T00:00:00');
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    const end = addDaysISO(startISO, totalDays);
    while (toISO(d) < end) {
      out.push({ date: toISO(d), label: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` });
      d.setDate(d.getDate() + 7);
    }
  } else {
    const d = new Date(startISO + 'T00:00:00');
    d.setDate(1);
    if (toISO(d) < startISO) d.setMonth(d.getMonth() + 1);
    const end = addDaysISO(startISO, totalDays);
    while (toISO(d) < end) {
      out.push({ date: toISO(d), label: `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}` });
      d.setMonth(d.getMonth() + 1);
    }
  }
  return out;
}
