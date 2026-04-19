// @ts-nocheck
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { useDialog } from '@worksuite/ui';
import type { Task, TaskPriority } from '../../domain/entities/Task';
import type { TaskType } from '../../domain/entities/TaskType';
import type { WorkflowState, StateCategory } from '../../domain/entities/State';
import type { SchemaField } from '../../domain/entities/FieldType';
import type { Priority } from '../../domain/entities/Priority';
import { FIELD_TYPES } from '../../domain/entities/FieldType';
import { taskRepo, taskTypeRepo, stateRepo, priorityRepo } from '../../container';
import { RichTextEditor } from '../components/RichTextEditor';
import { UserPicker } from '../components/UserPicker';

const CAT_COLORS: Record<StateCategory, { color: string; bg: string }> = {
  BACKLOG:     { color: 'var(--tx3)',   bg: 'rgba(140,144,159,.08)' },
  OPEN:        { color: 'var(--amber)', bg: 'rgba(245,158,11,.08)' },
  IN_PROGRESS: { color: 'var(--ac)',    bg: 'rgba(79,110,247,.08)' },
  DONE:        { color: 'var(--green)', bg: 'rgba(62,207,142,.08)' },
};

interface WSUser {
  id: string;
  name?: string;
  email: string;
  avatar?: string;
}

interface Props {
  currentUser: { id: string; name?: string; email: string; [k: string]: unknown };
  wsUsers?: WSUser[];
}

export function KanbanView({ currentUser, wsUsers = [] }: Props) {
  const { t } = useTranslation();
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [selectedType, setSelectedType] = useState<TaskType | null>(null);
  const [wfStates, setWfStates] = useState<WorkflowState[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragColumnId, setDragColumnId] = useState<string | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);
  // Within-column reorder target index
  const [dropTaskIdx, setDropTaskIdx] = useState<{ stateId: string; idx: number } | null>(null);

  // Filters and sort
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'manual' | 'priority' | 'assignee'>('manual');

  useEffect(() => {
    (async () => {
      const [tts, prs] = await Promise.all([
        taskTypeRepo.findAll(),
        priorityRepo.ensureDefaults(currentUser.id),
      ]);
      const assigned = tts.filter(tt => tt.workflowId);
      setTaskTypes(assigned);
      setPriorities(prs);
      if (assigned.length > 0) {
        await loadType(assigned[0]);
      }
      setLoading(false);
    })();
  }, []);

  // Map priority name → color for rendering badges
  const priorityColorByName = useMemo(() => {
    const map: Record<string, string> = {};
    priorities.forEach(p => { map[p.name.toLowerCase()] = p.color; });
    return map;
  }, [priorities]);

  // Priority sort rank: follow priorities.sortOrder (urgent first typically)
  const priorityRankByName = useMemo(() => {
    const map: Record<string, number> = {};
    const sorted = [...priorities].sort((a, b) => b.sortOrder - a.sortOrder);
    sorted.forEach((p, i) => { map[p.name.toLowerCase()] = i; });
    return map;
  }, [priorities]);

  const loadType = async (tt: TaskType) => {
    setSelectedType(tt);
    if (!tt.workflowId) { setWfStates([]); setTasks([]); return; }
    const [ws, tsks] = await Promise.all([
      stateRepo.findByWorkflow(tt.workflowId),
      taskRepo.findByTaskType(tt.id),
    ]);
    setWfStates(ws);
    setTasks(tsks);
  };

  // Apply filters and sort, then group by stateId
  const tasksByState = useMemo(() => {
    const filtered = tasks.filter(t => {
      if (filterAssignee !== 'all' && t.assigneeId !== (filterAssignee === 'unassigned' ? null : filterAssignee)) return false;
      if (filterPriority !== 'all' && (t.priority ?? '').toLowerCase() !== filterPriority.toLowerCase()) return false;
      return true;
    });

    const map: Record<string, Task[]> = {};
    wfStates.forEach(ws => { map[ws.stateId] = []; });
    filtered.forEach(task => {
      if (task.stateId && map[task.stateId] != null) {
        map[task.stateId].push(task);
      }
    });

    // Sort each column
    Object.keys(map).forEach(sid => {
      const arr = map[sid];
      if (sortBy === 'manual') {
        arr.sort((a, b) => a.sortOrder - b.sortOrder);
      } else if (sortBy === 'priority') {
        arr.sort((a, b) => {
          const ra = priorityRankByName[(a.priority ?? '').toLowerCase()] ?? -1;
          const rb = priorityRankByName[(b.priority ?? '').toLowerCase()] ?? -1;
          return rb - ra;
        });
      } else if (sortBy === 'assignee') {
        arr.sort((a, b) => (a.assigneeId ?? '').localeCompare(b.assigneeId ?? ''));
      }
    });

    return map;
  }, [tasks, wfStates, filterAssignee, filterPriority, sortBy, priorityRankByName]);

  // Distinct assignees present in loaded tasks
  const assigneesInTasks = useMemo(() => {
    const ids = new Set<string>();
    tasks.forEach(t => { if (t.assigneeId) ids.add(t.assigneeId); });
    return Array.from(ids).map(id => wsUsers.find(u => u.id === id)).filter(Boolean) as WSUser[];
  }, [tasks, wsUsers]);

  const createTask = async (title: string, stateId: string, taskTypeId: string) => {
    const tt = taskTypes.find(x => x.id === taskTypeId) ?? selectedType;
    const schema = (tt?.schema as any[]) ?? [];
    const initialData: Record<string, unknown> = {};
    for (const f of schema) {
      if (f.fieldType === 'assignee') {
        initialData[f.id] = currentUser.id;
      }
    }
    const defaultPriority = priorities.find(p => p.name.toLowerCase() === 'medium')?.name
      ?? priorities[0]?.name ?? null;
    const created = await taskRepo.create({
      taskTypeId: tt!.id,
      stateId,
      title,
      data: initialData,
      assigneeId: currentUser.id,
      priority: defaultPriority,
      sortOrder: 0,
      createdBy: currentUser.id,
    });
    setTasks(prev => [created, ...prev]);
  };

  // Reorder within same column using sort_order
  const reorderWithinColumn = async (taskId: string, stateId: string, targetIdx: number) => {
    const colTasks = [...(tasksByState[stateId] ?? [])];
    const fromIdx = colTasks.findIndex(t => t.id === taskId);
    if (fromIdx === -1) {
      // Moving from a different column → treat as move + place at target
      await moveTask(taskId, stateId);
      // After state move, insert into local arr at target and renumber
      const moving = tasks.find(t => t.id === taskId);
      if (!moving) return;
      const arr = [...colTasks];
      arr.splice(Math.min(targetIdx, arr.length), 0, { ...moving, stateId });
      const updates = arr.map((t, i) => ({ id: t.id, sortOrder: i, stateId }));
      setTasks(prev => prev.map(t => {
        const u = updates.find(u => u.id === t.id);
        return u ? { ...t, sortOrder: u.sortOrder, stateId } : t;
      }));
      await taskRepo.reorder(updates);
      return;
    }
    // Same column reorder
    let to = Math.max(0, Math.min(targetIdx, colTasks.length));
    const [moved] = colTasks.splice(fromIdx, 1);
    if (fromIdx < to) to -= 1;
    colTasks.splice(to, 0, moved);
    const updates = colTasks.map((t, i) => ({ id: t.id, sortOrder: i }));
    setTasks(prev => prev.map(t => {
      const u = updates.find(u => u.id === t.id);
      return u ? { ...t, sortOrder: u.sortOrder } : t;
    }));
    await taskRepo.reorder(updates);
  };

  const moveTask = async (taskId: string, toStateId: string) => {
    await taskRepo.moveToState(taskId, toStateId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, stateId: toStateId } : t));
  };

  const updateTask = async (taskId: string, patch: Partial<Task>) => {
    await taskRepo.update(taskId, patch);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t));
    if (detailTask?.id === taskId) setDetailTask(prev => prev ? { ...prev, ...patch } : prev);
  };

  const removeTask = async (taskId: string) => {
    await taskRepo.remove(taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setDetailTask(null);
  };

  const onDragStart = (taskId: string) => (e: React.DragEvent) => {
    setDragTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  };

  const onTaskDragEnd = () => {
    setDragTaskId(null);
    setDropTaskIdx(null);
  };

  const onDragOverCol = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDropCol = (stateId: string) => async (e: React.DragEvent) => {
    e.preventDefault();
    if (dragTaskId) {
      await moveTask(dragTaskId, stateId);
      setDragTaskId(null);
    }
  };

  // ── Column reorder ───────────────────────────────────────────────
  const onColumnDragStart = (wsId: string) => (e: React.DragEvent) => {
    setDragColumnId(wsId);
    e.dataTransfer.effectAllowed = 'move';
    // Use a custom MIME type so this drag is distinct from task drag
    e.dataTransfer.setData('application/vl-column', wsId);
  };

  const onColumnDragOver = (wsId: string) => (e: React.DragEvent) => {
    if (!dragColumnId || dragColumnId === wsId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropColumnId(wsId);
  };

  const onColumnDragLeave = () => setDropColumnId(null);

  const onColumnDrop = (targetWsId: string) => async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragColumnId || dragColumnId === targetWsId) {
      setDragColumnId(null); setDropColumnId(null);
      return;
    }

    // Compute the new ordering by removing dragged column and inserting
    // it at the target's index.
    const ordered = [...wfStates].sort(byCurrentOrder);
    const fromIdx = ordered.findIndex(ws => ws.id === dragColumnId);
    const toIdx = ordered.findIndex(ws => ws.id === targetWsId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, moved);

    // Renumber sortOrder sequentially and persist
    const updates = ordered.map((ws, i) => ({ id: ws.id, sortOrder: i }));
    setWfStates(prev => prev.map(ws => {
      const u = updates.find(x => x.id === ws.id);
      return u ? { ...ws, sortOrder: u.sortOrder } : ws;
    }));
    setDragColumnId(null); setDropColumnId(null);
    await stateRepo.reorderWorkflowStates(updates);
  };

  // Sort comparator: prefer explicit sortOrder, fall back to category order
  // for workflows that have not been manually reordered yet.
  const byCurrentOrder = (a: WorkflowState, b: WorkflowState): number => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return catOrder(a.state?.category) - catOrder(b.state?.category);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)' }}>{t('common.loading')}</div>;
  }

  if (taskTypes.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--tx3)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: .2, display: 'block', marginBottom: 12 }}>view_kanban</span>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{t('vectorLogic.noTaskTypesAssigned')}</div>
        <div style={{ fontSize: 11 }}>{t('vectorLogic.goToAssignmentManager')}</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      {/* Header */}
      <div style={{ padding: '0 4px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx)', margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
          {t('vectorLogic.smartKanban')}
        </h2>
        {taskTypes.length > 0 && (
          <div style={{ display: 'flex', gap: 4, background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 3 }}>
            {taskTypes.map(tt => (
              <button key={tt.id} onClick={() => loadType(tt)}
                title={tt.name}
                style={{
                  background: selectedType?.id === tt.id ? 'var(--ac)' : 'transparent',
                  color: selectedType?.id === tt.id ? '#fff' : 'var(--tx3)',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  fontWeight: selectedType?.id === tt.id ? 600 : 400,
                  fontSize: 11, padding: '5px 12px', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{tt.icon || 'task_alt'}</span>
                {tt.name}
              </button>
            ))}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
            title={t('vectorLogic.filterAssignee')}
            style={selectStyle}>
            <option value="all">{t('vectorLogic.allAssignees')}</option>
            <option value="unassigned">{t('vectorLogic.unassigned')}</option>
            {assigneesInTasks.map(u => (
              <option key={u.id} value={u.id}>{u.name || u.email}</option>
            ))}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            title={t('vectorLogic.filterPriority')}
            style={selectStyle}>
            <option value="all">{t('vectorLogic.allPriorities')}</option>
            {priorities.map(p => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
            title={t('vectorLogic.sortBy')}
            style={selectStyle}>
            <option value="manual">{t('vectorLogic.sortManual')}</option>
            <option value="priority">{t('vectorLogic.sortPriority')}</option>
            <option value="assignee">{t('vectorLogic.sortAssignee')}</option>
          </select>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--tx3)', alignSelf: 'center' }}>
            {tasks.length} {t('vectorLogic.tasks')}
          </span>
          <button onClick={() => setShowNew(true)} style={btnStyle('primary')}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            {t('vectorLogic.newTask')}
          </button>
        </div>
      </div>

      {/* Columns */}
      {wfStates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--tx3)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: .2, display: 'block', marginBottom: 12 }}>account_tree</span>
          <div style={{ fontSize: 13 }}>{t('vectorLogic.workflowHasNoStates')}</div>
        </div>
      ) : (
        <div style={{
          flex: 1, display: 'grid',
          gridTemplateColumns: `repeat(${wfStates.length}, minmax(260px, 1fr))`,
          gap: 12, overflowX: 'auto', overflowY: 'hidden',
        }}>
          {[...wfStates]
            .sort(byCurrentOrder)
            .map(ws => {
              const cc = CAT_COLORS[ws.state?.category ?? 'BACKLOG'];
              const colTasks = tasksByState[ws.stateId] ?? [];
              const isDragging = dragColumnId === ws.id;
              const isDropTarget = dropColumnId === ws.id;
              return (
                <div key={ws.id}
                  onDragOver={(e) => {
                    onDragOverCol(e);
                    if (dragColumnId) onColumnDragOver(ws.id)(e);
                  }}
                  onDragLeave={onColumnDragLeave}
                  onDrop={(e) => {
                    if (dragColumnId) {
                      onColumnDrop(ws.id)(e);
                    } else {
                      onDropCol(ws.stateId)(e);
                    }
                  }}
                  style={{
                    background: isDropTarget
                      ? `linear-gradient(180deg, rgba(79,110,247,.14) 0%, rgba(79,110,247,.04) 100%)`
                      : 'var(--sf2)',
                    borderRadius: 12,
                    borderTop: `3px solid ${ws.state?.color || cc.color}`,
                    border: isDropTarget ? '1px dashed var(--ac)' : '1px solid transparent',
                    borderTopColor: ws.state?.color || cc.color,
                    display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
                    opacity: isDragging ? .4 : 1,
                    transform: isDropTarget ? 'scale(1.015)' : 'scale(1)',
                    boxShadow: isDropTarget
                      ? `0 0 0 4px rgba(79,110,247,.08), 0 16px 40px rgba(79,110,247,.2)`
                      : '0 2px 8px rgba(0,0,0,.18)',
                    transition: 'all .22s cubic-bezier(.215,.61,.355,1)',
                  }}>
                  <div
                    draggable
                    onDragStart={onColumnDragStart(ws.id)}
                    style={{
                      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8,
                      flexShrink: 0, cursor: 'grab', userSelect: 'none',
                    }}
                    onMouseDown={e => (e.currentTarget.style.cursor = 'grabbing')}
                    onMouseUp={e => (e.currentTarget.style.cursor = 'grab')}>
                    <span className="material-symbols-outlined"
                      style={{ fontSize: 14, color: 'var(--tx3)', opacity: .5 }}>
                      drag_indicator
                    </span>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: ws.state?.color || cc.color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      {ws.state?.name}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 600, marginLeft: 'auto' }}>
                      {colTasks.length}
                    </span>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 12px', display: 'flex', flexDirection: 'column' }}>
                    {colTasks.map((task, ti) => {
                      const isInsertHere = dropTaskIdx?.stateId === ws.stateId && dropTaskIdx.idx === ti;
                      return (
                        <div key={task.id}>
                          {sortBy === 'manual' && (
                            <div
                              onDragOver={(e) => {
                                if (!dragTaskId || dragColumnId) return;
                                e.preventDefault();
                                e.stopPropagation();
                                e.dataTransfer.dropEffect = 'move';
                                if (!dropTaskIdx || dropTaskIdx.stateId !== ws.stateId || dropTaskIdx.idx !== ti) {
                                  setDropTaskIdx({ stateId: ws.stateId, idx: ti });
                                }
                              }}
                              onDrop={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (dragTaskId) {
                                  await reorderWithinColumn(dragTaskId, ws.stateId, ti);
                                  setDragTaskId(null);
                                  setDropTaskIdx(null);
                                }
                              }}
                              style={{
                                height: isInsertHere ? 10 : 6,
                                margin: '1px 0',
                                background: isInsertHere ? 'var(--ac)' : 'transparent',
                                borderRadius: 3,
                                transition: 'all .12s',
                              }}
                            />
                          )}
                          <TaskCard task={task}
                            priorityColor={priorityColorByName[(task.priority ?? '').toLowerCase()] ?? 'var(--tx3)'}
                            assignee={wsUsers.find(u => u.id === task.assigneeId) ?? null}
                            onClick={() => setDetailTask(task)}
                            onDragStart={onDragStart(task.id)}
                            onDragEnd={onTaskDragEnd}
                            isDragging={dragTaskId === task.id} />
                        </div>
                      );
                    })}
                    {sortBy === 'manual' && colTasks.length > 0 && (
                      <div
                        onDragOver={(e) => {
                          if (!dragTaskId || dragColumnId) return;
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = 'move';
                          const idx = colTasks.length;
                          if (!dropTaskIdx || dropTaskIdx.stateId !== ws.stateId || dropTaskIdx.idx !== idx) {
                            setDropTaskIdx({ stateId: ws.stateId, idx });
                          }
                        }}
                        onDrop={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (dragTaskId) {
                            await reorderWithinColumn(dragTaskId, ws.stateId, colTasks.length);
                            setDragTaskId(null);
                            setDropTaskIdx(null);
                          }
                        }}
                        style={{
                          height: dropTaskIdx?.stateId === ws.stateId && dropTaskIdx.idx === colTasks.length ? 32 : 16,
                          marginTop: 4,
                          borderRadius: 6,
                          border: dropTaskIdx?.stateId === ws.stateId && dropTaskIdx.idx === colTasks.length
                            ? '2px dashed var(--ac)' : '2px dashed transparent',
                          transition: 'all .15s',
                        }}
                      />
                    )}
                    {colTasks.length === 0 && (
                      <div style={{ fontSize: 10, color: 'var(--tx3)', textAlign: 'center', padding: '20px 0', opacity: .4 }}>
                        {t('vectorLogic.noneYet')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* New task modal */}
      {showNew && selectedType && (
        <NewTaskModal
          taskTypes={taskTypes}
          defaultTypeId={selectedType.id}
          onClose={() => setShowNew(false)}
          onCreate={async (title, typeId) => {
            // If the chosen type differs from the current one, load its workflow states
            // to find the initial OPEN state.
            let targetStates = wfStates;
            if (typeId !== selectedType.id) {
              const tt = taskTypes.find(t => t.id === typeId);
              if (tt?.workflowId) {
                targetStates = await stateRepo.findByWorkflow(tt.workflowId);
              }
            }
            const openState = targetStates.find(ws => ws.state?.category === 'OPEN');
            const initialState = openState ?? targetStates.find(ws => ws.isInitial) ?? targetStates[0];
            if (initialState) {
              await createTask(title, initialState.stateId, typeId);
              setShowNew(false);
            }
          }}
        />
      )}

      {/* Task detail modal */}
      {detailTask && selectedType && (
        <TaskDetailModal
          task={detailTask}
          taskType={selectedType}
          wfStates={wfStates}
          wsUsers={wsUsers}
          priorities={priorities}
          currentUser={currentUser}
          onClose={() => setDetailTask(null)}
          onUpdate={(patch) => updateTask(detailTask.id, patch)}
          onDelete={() => removeTask(detailTask.id)}
        />
      )}
    </div>
  );
}

/* ── Task Card ─────────────────────────────────────────────────────────── */
function TaskCard({ task, priorityColor, assignee, onClick, onDragStart, onDragEnd, isDragging }: {
  task: Task;
  priorityColor: string;
  assignee: WSUser | null;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
}) {
  const initials = assignee ? (assignee.name || assignee.email).trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() : '';
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        background: 'var(--sf3)', borderRadius: 10, padding: '10px 12px',
        cursor: isDragging ? 'grabbing' : 'grab',
        transition: 'all .15s',
        borderLeft: `3px solid ${priorityColor}`,
        opacity: isDragging ? .4 : 1,
        boxShadow: '0 1px 2px rgba(0,0,0,.2)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(79,110,247,.08)';
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 4px 14px rgba(79,110,247,.18)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--sf3)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,.2)';
      }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', lineHeight: 1.35 }}>{task.title}</div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        {task.priority && (
          <span style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 3,
            background: `${priorityColor}22`, color: priorityColor,
            fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase',
          }}>{task.priority}</span>
        )}
        <div style={{ flex: 1 }} />
        {assignee && (
          <div title={assignee.name || assignee.email}
            style={{
              width: 22, height: 22, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--ac), var(--ac2))',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, letterSpacing: '.02em',
              border: '1px solid rgba(255,255,255,.12)',
            }}>
            {initials}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── New Task Modal ────────────────────────────────────────────────────── */
function NewTaskModal({ taskTypes, defaultTypeId, onClose, onCreate }: {
  taskTypes: TaskType[];
  defaultTypeId: string;
  onClose: () => void;
  onCreate: (title: string, typeId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [typeId, setTypeId] = useState(defaultTypeId);

  const submit = async () => {
    if (!title.trim() || !typeId) return;
    await onCreate(title.trim(), typeId);
  };

  return (
    <Modal title={t('vectorLogic.newTask')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {taskTypes.length > 1 && (
          <div>
            <label style={lblStyle}>{t('vectorLogic.taskType')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {taskTypes.map(tt => {
                const active = typeId === tt.id;
                return (
                  <button key={tt.id} onClick={() => setTypeId(tt.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                      borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                      background: active ? 'rgba(79,110,247,.12)' : 'var(--sf2)',
                      color: active ? 'var(--ac)' : 'var(--tx)',
                      border: `1px solid ${active ? 'var(--ac)' : 'var(--bd)'}`,
                      transition: 'all .15s',
                    }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{tt.icon || 'task_alt'}</span>
                    {tt.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div>
          <label style={lblStyle}>{t('vectorLogic.taskTitle')}</label>
          <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            style={inpStyle()} placeholder={t('vectorLogic.placeholderFixBug')} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid var(--bd)' }}>
          <button style={btnStyle('ghost')} onClick={onClose}>{t('common.cancel')}</button>
          <button style={btnStyle('primary')} onClick={submit}>{t('common.create')}</button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Task Detail Modal ─────────────────────────────────────────────────── */
function TaskDetailModal({ task, taskType, wfStates, wsUsers, priorities, currentUser, onClose, onUpdate, onDelete }: {
  task: Task; taskType: TaskType; wfStates: WorkflowState[];
  wsUsers: WSUser[];
  priorities: Priority[];
  currentUser: { id: string; [k: string]: unknown };
  onClose: () => void; onUpdate: (patch: Partial<Task>) => void; onDelete: () => void;
}) {
  const { t } = useTranslation();
  const dialog = useDialog();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [data, setData] = useState(task.data);
  const [stateId, setStateId] = useState(task.stateId);
  const [priority, setPriority] = useState(task.priority);

  const schema = (taskType.schema as SchemaField[]) || [];
  const detailFields = schema.filter(f => f.showOnDetail);

  const save = async () => {
    await onUpdate({ title, data, stateId, priority });
    setEditing(false);
  };

  return (
    <Modal title={task.title} onClose={onClose} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Status row */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={stateId ?? ''} onChange={e => { setStateId(e.target.value); onUpdate({ stateId: e.target.value }); }}
            style={{ ...inpStyle({ width: 'auto' }), fontSize: 12 }}>
            {wfStates.map(ws => (
              <option key={ws.stateId} value={ws.stateId}>{ws.state?.name}</option>
            ))}
          </select>
          <select value={priority ?? ''} onChange={e => { setPriority(e.target.value); onUpdate({ priority: e.target.value }); }}
            style={{ ...inpStyle({ width: 'auto' }), fontSize: 12 }}>
            <option value="">—</option>
            {priorities.map(p => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Dynamic schema fields (title is rendered as a special big input
            via the title field type if present; otherwise we still show the
            built-in editable title input below as a safety net). */}
        {detailFields.some(f => f.fieldType === 'title') ? null : (
          <div>
            <label style={lblStyle}>{t('vectorLogic.taskTitle')}</label>
            <input value={title} onChange={e => setTitle(e.target.value)} onBlur={() => onUpdate({ title })}
              style={inpStyle()} />
          </div>
        )}
        {detailFields.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8, borderTop: '1px solid var(--bd)' }}>
            {detailFields.map(field => (
              <DynamicFieldRenderer
                key={field.id}
                field={field}
                value={field.fieldType === 'title' ? title : data[field.id]}
                wsUsers={wsUsers}
                onChange={(v) => {
                  if (field.fieldType === 'title') {
                    setTitle(v as string);
                    onUpdate({ title: v as string });
                  } else {
                    const newData = { ...data, [field.id]: v };
                    setData(newData);
                    onUpdate({ data: newData });
                  }
                }}
              />
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 12, borderTop: '1px solid var(--bd)' }}>
          <button style={btnStyle('danger')} onClick={async () => { if (await dialog.confirm(t('vectorLogic.deleteTaskConfirm'), { danger: true })) onDelete(); }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
            {t('common.delete')}
          </button>
          <button style={btnStyle('ghost')} onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Dynamic Field Renderer ─────────────────────────────────────────────── */
function DynamicFieldRenderer({ field, value, onChange, wsUsers }: { field: SchemaField; value: unknown; onChange: (v: unknown) => void; wsUsers: WSUser[] }) {
  const def = FIELD_TYPES.find(f => f.id === field.fieldType);

  // Title gets a special big input — no label, just the input itself
  if (field.fieldType === 'title') {
    return (
      <input value={(value as string) || ''} onChange={e => onChange(e.target.value)}
        placeholder={field.label || t('vectorLogic.untitledChat')}
        style={{
          width: '100%', padding: '6px 0', fontSize: 22, fontFamily: "'Space Grotesk',sans-serif",
          fontWeight: 700, background: 'transparent', border: 'none', borderBottom: '1px solid transparent',
          color: 'var(--tx)', outline: 'none', transition: 'border-color .15s',
        }}
        onFocus={e => e.currentTarget.style.borderBottomColor = 'var(--ac)'}
        onBlur={e => e.currentTarget.style.borderBottomColor = 'transparent'} />
    );
  }

  const renderInput = () => {
    switch (field.fieldType) {
      case 'short_text':
      case 'url':
      case 'email':
      case 'phone':
        return <input value={(value as string) || ''} onChange={e => onChange(e.target.value)}
          style={inpStyle()} type={field.fieldType === 'email' ? 'email' : field.fieldType === 'url' ? 'url' : 'text'} />;
      case 'long_text':
        return <textarea value={(value as string) || ''} onChange={e => onChange(e.target.value)}
          rows={3} style={{ ...inpStyle(), resize: 'vertical' }} />;
      case 'rich_text':
        return <RichTextEditor value={(value as string) || ''} onChange={onChange} placeholder={field.label} />;
      case 'number':
      case 'currency':
        return <input type="number" value={(value as number) || ''} onChange={e => onChange(Number(e.target.value))}
          style={inpStyle()} />;
      case 'date':
      case 'start_date':
      case 'due_date':
        return <input type="date" value={(value as string) || ''} onChange={e => onChange(e.target.value)}
          style={inpStyle()} />;
      case 'time':
        return <input type="time" value={(value as string) || ''} onChange={e => onChange(e.target.value)}
          style={inpStyle()} />;
      case 'checkbox':
        return <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)}
          style={{ width: 18, height: 18, cursor: 'pointer' }} />;
      case 'assignee':
      case 'user_picker':
        return <UserPicker users={wsUsers} value={(value as string) || null} onChange={onChange} />;
      case 'single_select':
      case 'radio_group':
        return (
          <select value={(value as string) || ''} onChange={e => onChange(e.target.value)} style={inpStyle()}>
            <option value="">—</option>
            {(field.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );
      case 'multi_select':
      case 'tags': {
        const arr = Array.isArray(value) ? value : [];
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(field.options ?? []).map(opt => (
              <button key={opt} type="button" onClick={() => {
                onChange(arr.includes(opt) ? arr.filter((x: string) => x !== opt) : [...arr, opt]);
              }}
                style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                  background: arr.includes(opt) ? 'rgba(79,110,247,.15)' : 'var(--sf2)',
                  color: arr.includes(opt) ? 'var(--ac)' : 'var(--tx3)',
                  border: `1px solid ${arr.includes(opt) ? 'var(--ac)' : 'var(--bd)'}`,
                }}>
                {opt}
              </button>
            ))}
          </div>
        );
      }
      default:
        return <div style={{ fontSize: 11, color: 'var(--tx3)', fontStyle: 'italic' }}>Unsupported: {field.fieldType}</div>;
    }
  };

  return (
    <div>
      <label style={{ ...lblStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
        {def && <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--ac)' }}>{def.icon}</span>}
        {field.label}
        {field.required && <span style={{ color: 'var(--red)' }}>*</span>}
      </label>
      {renderInput()}
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────── */
function catOrder(cat?: StateCategory) {
  // Column order: OPEN → BACKLOG → IN_PROGRESS → DONE
  return { OPEN: 0, BACKLOG: 1, IN_PROGRESS: 2, DONE: 3 }[cat ?? 'OPEN'];
}

const btnStyle = (variant = 'primary', extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
  borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer', border: 'none',
  fontFamily: 'inherit', transition: 'all .2s',
  ...(variant === 'primary' && {
    background: 'linear-gradient(135deg, #adc6ff, #4d8eff)',
    color: '#fff',
    boxShadow: '0 2px 12px rgba(77,142,255,.3)',
  }),
  ...(variant === 'ghost' && {
    background: 'rgba(42,42,42,.8)',
    backdropFilter: 'blur(12px)',
    color: 'var(--tx3)',
    border: '1px solid var(--bd)',
  }),
  ...(variant === 'danger' && {
    background: 'linear-gradient(135deg, rgba(239,68,68,.15), rgba(239,68,68,.08))',
    color: 'var(--red)',
    border: '1px solid rgba(224,82,82,.3)',
  }),
  ...extra,
});

const inpStyle = (extra = {}) => ({
  width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
  background: 'var(--sf2)', border: '1px solid var(--bd)',
  borderRadius: 8, color: 'var(--tx)', outline: 'none', ...extra,
});

const selectStyle: React.CSSProperties = {
  padding: '5px 10px', fontSize: 11, fontFamily: 'inherit', fontWeight: 500,
  background: 'var(--sf2)', border: '1px solid var(--bd)',
  borderRadius: 6, color: 'var(--tx)', outline: 'none', cursor: 'pointer',
};

const lblStyle = {
  fontSize: 11, fontWeight: 700, color: 'var(--tx3)',
  textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5,
};

/* ── Modal ──────────────────────────────────────────────────────────────── */
function Modal({ title, onClose, children, width = 480 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 16,
        width: '100%', maxWidth: width, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.6)',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--bd)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx)', margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}
