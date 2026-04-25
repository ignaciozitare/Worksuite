// @ts-nocheck
import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@worksuite/i18n';
import { useDialog, UserAvatar } from '@worksuite/ui';
import type { Task, TaskPriority } from '../../domain/entities/Task';
import type { TaskType } from '../../domain/entities/TaskType';
import type { WorkflowState, StateCategory } from '../../domain/entities/State';
import type { SchemaField } from '../../domain/entities/FieldType';
import type { Priority } from '../../domain/entities/Priority';
import { FIELD_TYPES } from '../../domain/entities/FieldType';
import { taskRepo, taskTypeRepo, stateRepo, priorityRepo, taskAlarmRepo, userSettingsRepo } from '../../container';
import type { TaskAlarm } from '../../domain/entities/TaskAlarm';
import { RichTextEditor } from '../components/RichTextEditor';
import { UserPicker } from '../components/UserPicker';
import { TaskTypeSwitcher } from '../components/TaskTypeSwitcher';
import { TaskAlarmPicker } from '../components/TaskAlarmPicker';

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
  avatarUrl?: string | null;
}

interface Props {
  currentUser: { id: string; name?: string; email: string; [k: string]: unknown };
  wsUsers?: WSUser[];
}

const CATEGORIES: StateCategory[] = ['BACKLOG', 'OPEN', 'IN_PROGRESS', 'DONE'];

export function KanbanView({ currentUser, wsUsers = [] }: Props) {
  const { t } = useTranslation();
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [selectedType, setSelectedType] = useState<TaskType | null>(null);
  /** Multi-select task type filter. Empty = all types. Size 1 = single-workflow mode. */
  const [selectedTypeIds, setSelectedTypeIds] = useState<Set<string>>(new Set());
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);
  const [wfStates, setWfStates] = useState<WorkflowState[]>([]);
  /** Map from any state id to its category — populated on mount, used for aggregate grouping. */
  const [allStatesMap, setAllStatesMap] = useState<Map<string, StateCategory>>(new Map());
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
  const [search, setSearch] = useState('');

  /** True when the filter has 0 or 2+ types selected. In that case the kanban
   *  collapses into 4 fixed category columns (BACKLOG/OPEN/IN_PROGRESS/DONE)
   *  aggregating tasks across the selected types (or all types if 0 selected). */
  const isAggregate = selectedTypeIds.size !== 1;

  useEffect(() => {
    (async () => {
      const [tts, prs, allStates] = await Promise.all([
        taskTypeRepo.findAll(),
        priorityRepo.ensureDefaults(currentUser.id),
        stateRepo.findAll(),
      ]);
      const assigned = tts.filter(tt => tt.workflowId);
      setTaskTypes(assigned);
      setPriorities(prs);
      const m = new Map<string, StateCategory>();
      allStates.forEach(s => m.set(s.id, s.category));
      setAllStatesMap(m);
      if (assigned.length > 0) {
        // Default the filter to the first type (preserves the v1 single-workflow
        // experience). The user can clear/expand the filter from the dropdown.
        setSelectedTypeIds(new Set([assigned[0].id]));
        await loadType(assigned[0], { runAutoArchive: true });
      }
      setLoading(false);
    })();
  }, []);

  /** Reload the kanban payload whenever the type filter changes after the
   *  initial mount. Single-mode: load that type's workflow. Aggregate-mode:
   *  load all live tasks (filtered by selectedTypeIds when set) without states. */
  useEffect(() => {
    if (loading) return; // initial load handled in the mount effect above
    (async () => {
      if (selectedTypeIds.size === 1) {
        const tt = taskTypes.find(x => selectedTypeIds.has(x.id));
        if (tt) await loadType(tt);
      } else {
        setSelectedType(taskTypes[0] ?? null);
        setWfStates([]);
        const all = await taskRepo.findAll();
        const filtered = selectedTypeIds.size === 0
          ? all
          : all.filter(x => selectedTypeIds.has(x.taskTypeId));
        setTasks(filtered);
      }
    })();
  }, [Array.from(selectedTypeIds).sort().join(',')]);

  /**
   * Done-column auto-archive.
   * - doneMaxDays: archive any Done task whose state_entered_at is older than N days.
   * - doneMaxCount: if Done tasks still exceed N, archive the oldest until the limit is met.
   * - 0 on either setting means "no limit" for that dimension.
   */
  const autoArchiveDone = async (
    tsks: Task[],
    wfs: WorkflowState[],
    doneMaxDays: number,
    doneMaxCount: number,
  ): Promise<string[]> => {
    if (doneMaxDays <= 0 && doneMaxCount <= 0) return [];
    const doneStateIds = new Set(
      wfs.filter(ws => ws.state?.category === 'DONE').map(ws => ws.stateId),
    );
    let done = tsks.filter(t => t.stateId && doneStateIds.has(t.stateId));
    const now = Date.now();
    const archiveIds = new Set<string>();

    if (doneMaxDays > 0) {
      const cutoff = now - doneMaxDays * 86_400_000;
      done.forEach(t => {
        if (new Date(t.stateEnteredAt).getTime() < cutoff) archiveIds.add(t.id);
      });
    }

    if (doneMaxCount > 0) {
      const survivors = done
        .filter(t => !archiveIds.has(t.id))
        .sort((a, b) => new Date(a.stateEnteredAt).getTime() - new Date(b.stateEnteredAt).getTime());
      const overflow = survivors.length - doneMaxCount;
      for (let i = 0; i < overflow; i++) archiveIds.add(survivors[i].id);
    }

    if (archiveIds.size === 0) return [];
    await Promise.all(Array.from(archiveIds).map(id => taskRepo.archive(id, currentUser.id)));
    return Array.from(archiveIds);
  };

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

  /**
   * What we actually render as columns. In single-mode it's the workflow's
   * states; in aggregate-mode we synthesize 4 category-level "states" so the
   * existing column/card render code keeps working.
   */
  const effectiveWfStates: WorkflowState[] = useMemo(() => {
    if (!isAggregate) return wfStates;
    return CATEGORIES.map((cat, i) => ({
      id: `__cat_${cat}`,
      workflowId: '',
      stateId: `__cat_${cat}`,
      positionX: 0,
      positionY: 0,
      isInitial: false,
      sortOrder: i,
      state: {
        id: `__cat_${cat}`,
        name: t(`vectorLogic.cat${cat}`),
        category: cat,
        color: null,
        isGlobal: false,
        createdAt: '',
      },
    }));
  }, [isAggregate, wfStates, t]);

  /**
   * Tasks remapped for the effective columns. In aggregate mode each task's
   * stateId is replaced by the synthetic `__cat_{category}` id derived from
   * its real state via `allStatesMap`. The original task is kept untouched
   * — drag handlers consult the original via the `tasks` array.
   */
  const effectiveTasks: Task[] = useMemo(() => {
    if (!isAggregate) return tasks;
    return tasks.map(task => {
      const cat = (task.stateId && allStatesMap.get(task.stateId)) || 'OPEN';
      return { ...task, stateId: `__cat_${cat}` };
    });
  }, [isAggregate, tasks, allStatesMap]);

  const loadType = async (tt: TaskType, opts?: { runAutoArchive?: boolean }) => {
    setSelectedType(tt);
    if (!tt.workflowId) { setWfStates([]); setTasks([]); return; }
    const [ws, tsks, settings] = await Promise.all([
      stateRepo.findByWorkflow(tt.workflowId),
      taskRepo.findByTaskType(tt.id),
      opts?.runAutoArchive ? userSettingsRepo.get(currentUser.id) : Promise.resolve(null),
    ]);

    let finalTasks = tsks;
    if (opts?.runAutoArchive) {
      const doneMaxDays = settings?.doneMaxDays ?? 7;
      const doneMaxCount = settings?.doneMaxCount ?? 20;
      const archived = await autoArchiveDone(tsks, ws, doneMaxDays, doneMaxCount);
      if (archived.length > 0) {
        const archivedSet = new Set(archived);
        finalTasks = tsks.filter(t => !archivedSet.has(t.id));
      }
    }

    setWfStates(ws);
    setTasks(finalTasks);
  };

  // Apply filters and sort, then group by stateId
  const tasksByState = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = effectiveTasks.filter(t => {
      if (filterAssignee !== 'all' && t.assigneeId !== (filterAssignee === 'unassigned' ? null : filterAssignee)) return false;
      if (filterPriority !== 'all' && (t.priority ?? '').toLowerCase() !== filterPriority.toLowerCase()) return false;
      if (q && !t.title.toLowerCase().includes(q) && !(t.code ?? '').toLowerCase().includes(q)) return false;
      return true;
    });

    const map: Record<string, Task[]> = {};
    effectiveWfStates.forEach(ws => { map[ws.stateId] = []; });
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
  }, [effectiveTasks, effectiveWfStates, filterAssignee, filterPriority, sortBy, priorityRankByName, search]);

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
    setDropColumnId(null);
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
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setTypeFilterOpen(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', borderRadius: 8, fontFamily: 'inherit',
                background: 'var(--sf2)', border: '1px solid var(--bd)',
                color: 'var(--tx)', cursor: 'pointer', fontSize: 12,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--ac)' }}>
                filter_list
              </span>
              <span style={{ fontWeight: 600 }}>
                {selectedTypeIds.size === 0
                  ? t('vectorLogic.allTypes')
                  : selectedTypeIds.size === 1
                    ? (taskTypes.find(x => selectedTypeIds.has(x.id))?.name ?? '')
                    : `${selectedTypeIds.size} ${t('vectorLogic.typesSelected')}`}
              </span>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--tx3)' }}>
                keyboard_arrow_down
              </span>
            </button>

            {typeFilterOpen && (
              <>
                <div onClick={() => setTypeFilterOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />
                <div style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 101,
                  width: 240, background: 'var(--sf)', border: '1px solid var(--bd)',
                  borderRadius: 10, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,.4)',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  <button
                    onClick={() => setSelectedTypeIds(new Set())}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 6,
                      background: selectedTypeIds.size === 0 ? 'var(--ac-dim)' : 'transparent',
                      border: 'none', fontFamily: 'inherit', fontSize: 12,
                      color: 'var(--tx)', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{
                      fontSize: 14, color: selectedTypeIds.size === 0 ? 'var(--ac)' : 'var(--tx3)',
                    }}>
                      {selectedTypeIds.size === 0 ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    <span style={{ flex: 1, fontWeight: selectedTypeIds.size === 0 ? 600 : 400 }}>
                      {t('vectorLogic.allTypes')}
                    </span>
                  </button>
                  <div style={{ height: 1, background: 'var(--bd)', margin: '4px 0' }} />
                  {taskTypes.map(tt => {
                    const checked = selectedTypeIds.has(tt.id);
                    return (
                      <button
                        key={tt.id}
                        onClick={() => {
                          setSelectedTypeIds(prev => {
                            const next = new Set(prev);
                            if (next.has(tt.id)) next.delete(tt.id);
                            else next.add(tt.id);
                            return next;
                          });
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 10px', borderRadius: 6,
                          background: checked ? 'var(--ac-dim)' : 'transparent',
                          border: 'none', fontFamily: 'inherit', fontSize: 12,
                          color: 'var(--tx)', cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{
                          fontSize: 14, color: checked ? 'var(--ac)' : 'var(--tx3)',
                        }}>
                          {checked ? 'check_box' : 'check_box_outline_blank'}
                        </span>
                        <span className="material-symbols-outlined" style={{
                          fontSize: 14, color: tt.iconColor || 'var(--tx2)',
                        }}>
                          {tt.icon || 'task_alt'}
                        </span>
                        <span style={{ flex: 1, fontWeight: checked ? 600 : 400 }}>{tt.name}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
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

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'var(--sf2)',
            border: '1px solid var(--bd)', borderRadius: 8, padding: '6px 10px', width: 200,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--tx3)' }}>search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('vectorLogic.searchKanban')}
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                color: 'var(--tx)', fontSize: 11, fontFamily: 'inherit',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                title={t('common.clear')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', padding: 0, display: 'flex' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
              </button>
            )}
          </div>
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
      {effectiveWfStates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--tx3)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: .2, display: 'block', marginBottom: 12 }}>account_tree</span>
          <div style={{ fontSize: 13 }}>{t('vectorLogic.workflowHasNoStates')}</div>
        </div>
      ) : (
        <div style={{
          flex: 1, display: 'grid',
          gridTemplateColumns: `repeat(${effectiveWfStates.length}, minmax(220px, 1fr))`,
          gap: 12, overflowX: 'auto', overflowY: 'hidden',
        }}>
          {[...effectiveWfStates]
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
                    if (dragColumnId) {
                      onColumnDragOver(ws.id)(e);
                    } else if (dragTaskId) {
                      const sourceStateId = tasks.find(t => t.id === dragTaskId)?.stateId;
                      if (sourceStateId !== ws.stateId && dropColumnId !== ws.id) {
                        setDropColumnId(ws.id);
                      }
                    }
                  }}
                  onDragLeave={onColumnDragLeave}
                  onDrop={(e) => {
                    if (dragColumnId) {
                      onColumnDrop(ws.id)(e);
                    } else {
                      onDropCol(ws.stateId)(e);
                    }
                    setDropColumnId(null);
                  }}
                  style={{
                    background: isDropTarget
                      ? `linear-gradient(180deg, var(--ac-dim) 0%, transparent 100%)`
                      : 'var(--sf2)',
                    borderRadius: 12,
                    borderTop: `3px solid ${ws.state?.color || cc.color}`,
                    border: isDropTarget ? '1px dashed var(--ac)' : '1px solid transparent',
                    borderTopColor: ws.state?.color || cc.color,
                    display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
                    opacity: isDragging ? .4 : 1,
                    transform: isDropTarget ? 'scale(1.015)' : 'scale(1)',
                    boxShadow: isDropTarget
                      ? `0 0 0 4px var(--ac-dim), 0 16px 40px var(--ac-dim)`
                      : '0 2px 8px rgba(0,0,0,.18)',
                    transition: 'all .22s cubic-bezier(.215,.61,.355,1)',
                  }}>
                  <div
                    draggable={!isAggregate}
                    onDragStart={isAggregate ? undefined : onColumnDragStart(ws.id)}
                    style={{
                      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8,
                      flexShrink: 0, cursor: isAggregate ? 'default' : 'grab', userSelect: 'none',
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
                            taskType={taskTypes.find(x => x.id === task.taskTypeId) ?? selectedType}
                            priorityColor={priorityColorByName[(task.priority ?? '').toLowerCase()] ?? 'var(--tx3)'}
                            assignee={wsUsers.find(u => u.id === task.assigneeId) ?? null}
                            wsUsers={wsUsers}
                            onClick={() => setDetailTask(task)}
                            onDragStart={isAggregate ? undefined : onDragStart(task.id)}
                            onDragEnd={isAggregate ? undefined : onTaskDragEnd}
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
      {detailTask && (
        <TaskDetailModal
          key={detailTask.id}
          task={detailTask}
          taskType={taskTypes.find(t => t.id === detailTask.taskTypeId) ?? selectedType!}
          taskTypes={taskTypes}
          wfStates={wfStates}
          wsUsers={wsUsers}
          priorities={priorities}
          currentUser={currentUser}
          onClose={() => setDetailTask(null)}
          onUpdate={(patch) => updateTask(detailTask.id, patch)}
          onDelete={() => removeTask(detailTask.id)}
          onOpenTask={async (id) => {
            const found = await taskRepo.findById(id);
            if (found) setDetailTask(found);
          }}
        />
      )}
    </div>
  );
}

/* ── Task Card ─────────────────────────────────────────────────────────── */
/**
 * Returns the number of whole days between `iso` and `now`.
 * Both are compared at midnight (local) to avoid partial-day drift.
 */
function daysBetween(iso: string, now: Date): number {
  const a = new Date(iso);
  const aMid = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const nMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((nMid - aMid) / 86_400_000);
}

/** Reads the display value for a card chip — routes native-shadowed types
 *  (assignee/due_date) to native columns. Returns null for anything empty. */
function readCardFieldValue(task: Task, field: SchemaField): unknown {
  if (field.fieldType === 'due_date') return task.dueDate;
  if (field.fieldType === 'assignee') return task.assigneeId;
  if (field.fieldType === 'title')    return task.title;
  return (task.data ?? {})[field.id];
}

/** Turns a value into a short string for a card chip. */
function formatCardValue(field: SchemaField, v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (field.fieldType === 'due_date' || field.fieldType === 'date' || field.fieldType === 'start_date') {
    const d = new Date(v as string);
    if (isNaN(d.getTime())) return String(v);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  if (field.fieldType === 'checkbox') return v ? '✓' : null;
  if (field.fieldType === 'checklist' && Array.isArray(v)) {
    const total = v.length;
    if (total === 0) return null;
    const done = (v as Array<{ checked?: boolean }>).filter(x => x?.checked).length;
    return `${done}/${total}`;
  }
  if (Array.isArray(v)) return v.length ? v.join(', ') : null;
  return String(v).slice(0, 24);
}

function TaskCard({ task, taskType, priorityColor, assignee, wsUsers, onClick, onDragStart, onDragEnd, isDragging }: {
  task: Task;
  taskType: TaskType | null;
  wsUsers: WSUser[];
  priorityColor: string;
  assignee: WSUser | null;
  onClick: () => void;
  /** Omit to render the card non-draggable (used in aggregate kanban mode). */
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
}) {
  const isDraggable = typeof onDragStart === 'function';
  const initials = assignee ? (assignee.name || assignee.email).trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() : '';
  const now = new Date();
  const daysInColumn = daysBetween(task.stateEnteredAt, now);

  // User-configured card chips (up to 4). Assignee + user_picker are rendered
  // as avatars in the footer, never as text chips — filter them out here.
  const schema = ((taskType?.schema as SchemaField[]) || []);
  const cardFields = schema
    .filter(f => f.showOnCard && f.fieldType !== 'assignee' && f.fieldType !== 'title' && f.fieldType !== 'user_picker')
    .sort((a, b) => a.order - b.order)
    .slice(0, 4);
  const hasCardFields = cardFields.length > 0;

  // Extra users contributed by user_picker fields with showOnCard. Each chip
  // resolves the stored user id to a WSUser, deduped against the native
  // assignee, capped at 3 visible (rest collapse into +N).
  const extraUsers: WSUser[] = (() => {
    const seen = new Set<string>(assignee ? [assignee.id] : []);
    const out: WSUser[] = [];
    schema
      .filter(f => f.showOnCard && f.fieldType === 'user_picker')
      .sort((a, b) => a.order - b.order)
      .forEach(f => {
        const uid = (task.data ?? {})[f.id];
        if (typeof uid !== 'string' || !uid || seen.has(uid)) return;
        const u = wsUsers.find(x => x.id === uid);
        if (!u) return;
        seen.add(uid);
        out.push(u);
      });
    return out;
  })();
  const visibleExtras = extraUsers.slice(0, 3);
  const overflowExtras = extraUsers.length - visibleExtras.length;

  // Due-date color (also used for a "due" chip in the default layout).
  let dueColor = 'var(--tx3)';
  let dueBg = 'transparent';
  let dueLabel: string | null = null;
  if (task.dueDate) {
    const daysUntil = daysBetween(task.dueDate, now) * -1;
    if (daysUntil < 0)        { dueColor = 'var(--red)';   dueBg = 'var(--red-dim)'; }
    else if (daysUntil === 0) { dueColor = 'var(--amber)'; dueBg = 'var(--amber-dim)'; }
    const d = new Date(task.dueDate);
    dueLabel = `${d.getMonth() + 1}/${d.getDate()}`;
  }

  return (
    <div
      className="vl-card"
      draggable={isDraggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        background: 'var(--sf3)', borderRadius: 10, padding: '10px 12px',
        cursor: !isDraggable ? 'pointer' : isDragging ? 'grabbing' : 'grab',
        transition: 'all .15s',
        borderLeft: `3px solid ${priorityColor}`,
        opacity: isDragging ? .4 : 1,
        boxShadow: '0 1px 2px rgba(0,0,0,.2)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--ac-dim)';
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 4px 14px var(--ac-dim)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--sf3)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,.2)';
      }}>
      {/* Top row: type icon + code */}
      {(taskType || task.code) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          {taskType?.icon && (
            <span className="material-symbols-outlined" style={{
              fontSize: 13,
              color: taskType.iconColor || 'var(--tx3)',
            }}>
              {taskType.icon}
            </span>
          )}
          {task.code && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: 'var(--ac)',
              fontFamily: "'Space Grotesk',sans-serif", letterSpacing: '.04em',
            }}>
              {task.code}
            </span>
          )}
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', lineHeight: 1.35 }}>{task.title}</div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {hasCardFields ? (
          // Configured chips (up to 4) — drive what the user wants to see at-a-glance.
          cardFields.map(field => {
            const raw = readCardFieldValue(task, field);
            const value = formatCardValue(field, raw);
            if (!value) return null;
            const isDue = field.fieldType === 'due_date';
            return (
              <span key={field.id} style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 3,
                background: isDue ? dueBg : 'var(--sf2)',
                color: isDue ? dueColor : 'var(--tx2)',
                fontWeight: 700, letterSpacing: '.04em',
                display: 'inline-flex', alignItems: 'center', gap: 3,
                maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {value}
              </span>
            );
          })
        ) : (
          <>
            {task.priority && (
              <span style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 3,
                background: `${priorityColor}22`, color: priorityColor,
                fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase',
              }}>{task.priority}</span>
            )}
            {daysInColumn > 0 && (
              <span style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 3,
                background: 'var(--sf2)', color: 'var(--tx3)',
                fontWeight: 700, letterSpacing: '.04em',
              }}>
                {daysInColumn}d
              </span>
            )}
            {dueLabel && (
              <span style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 3,
                background: dueBg, color: dueColor,
                fontWeight: 700, letterSpacing: '.04em',
                display: 'inline-flex', alignItems: 'center', gap: 3,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>event</span>
                {dueLabel}
              </span>
            )}
          </>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {assignee && (
            <Tooltip label={assignee.name || assignee.email}>
              <UserAvatar user={assignee} size={22} imageWidth={64} />
            </Tooltip>
          )}
          {visibleExtras.map(u => (
            <Tooltip key={u.id} label={u.name || u.email}>
              <UserAvatar
                user={u.avatarUrl ? u : { ...u, avatarUrl: 'preset:purple' }}
                size={22}
                imageWidth={64}
              />
            </Tooltip>
          ))}
          {overflowExtras > 0 && (
            <Tooltip label={extraUsers.slice(3).map(u => u.name || u.email).join(', ')}>
              <span style={{
                height: 22, padding: '0 6px', borderRadius: 11,
                background: 'var(--sf2)', color: 'var(--tx2)',
                display: 'inline-flex', alignItems: 'center',
                fontSize: 9, fontWeight: 700,
                border: '1px solid var(--bd)',
              }}>
                +{overflowExtras}
              </span>
            </Tooltip>
          )}
        </div>
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
                    <span className="material-symbols-outlined" style={{
                      fontSize: 16,
                      color: tt.iconColor || (active ? 'var(--ac)' : 'var(--tx2)'),
                    }}>
                      {tt.icon || 'task_alt'}
                    </span>
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
function TaskDetailModal({ task, taskType, taskTypes, wfStates, wsUsers, priorities, currentUser, onClose, onUpdate, onDelete, onOpenTask }: {
  task: Task; taskType: TaskType; taskTypes: TaskType[]; wfStates: WorkflowState[];
  wsUsers: WSUser[];
  priorities: Priority[];
  currentUser: { id: string; [k: string]: unknown };
  onClose: () => void; onUpdate: (patch: Partial<Task>) => void; onDelete: () => void;
  onOpenTask?: (taskId: string) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const dialog = useDialog();
  const [title, setTitle] = useState(task.title);
  const [data, setData] = useState(task.data);
  const [stateId, setStateId] = useState(task.stateId);
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState<string | null>(task.dueDate);
  const [assigneeId, setAssigneeId] = useState<string | null>(task.assigneeId);
  const [currentType, setCurrentType] = useState<TaskType>(taskType);

  // Auto-save indicator: flashes after each persisted change, then fades.
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const autoSave = async (patch: Partial<Task>) => {
    await onUpdate(patch);
    setSavedAt(Date.now());
  };

  // Subtasks and alarms — loaded once per task.
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [alarms, setAlarms] = useState<TaskAlarm[]>([]);
  const [showAlarmPicker, setShowAlarmPicker] = useState(false);
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [subtaskTypeId, setSubtaskTypeId] = useState<string>(taskType.id);
  const [creatingSub, setCreatingSub] = useState(false);

  // Ancestor breadcrumb (oldest → direct parent). Capped at 5 hops by Phase 5 rules.
  const [ancestors, setAncestors] = useState<Task[]>([]);

  // Subtask drag-reorder state.
  const [dragSubId, setDragSubId] = useState<string | null>(null);
  const [dragOverSubId, setDragOverSubId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [children, alarmList] = await Promise.all([
        taskRepo.findChildren(task.id),
        taskAlarmRepo.listByTask(task.id),
      ]);
      setSubtasks(children);
      setAlarms(alarmList);
    })();
  }, [task.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const chain: Task[] = [];
      let pid = task.parentTaskId ?? null;
      let safety = 6;
      while (pid && safety-- > 0) {
        const parent = await taskRepo.findById(pid);
        if (!parent) break;
        chain.unshift(parent);
        pid = parent.parentTaskId ?? null;
      }
      if (!cancelled) setAncestors(chain);
    })();
    return () => { cancelled = true; };
  }, [task.id, task.parentTaskId]);

  const reorderSubtasks = async (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const fromIdx = subtasks.findIndex(s => s.id === draggedId);
    const toIdx   = subtasks.findIndex(s => s.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...subtasks];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setSubtasks(next);
    await taskRepo.reorder(next.map((s, i) => ({ id: s.id, sortOrder: i })));
  };

  const toggleSubtaskDone = async (sub: Task) => {
    const tt = taskTypes.find(x => x.id === sub.taskTypeId);
    if (!tt?.workflowId) return;
    const wfs = await stateRepo.findByWorkflow(tt.workflowId);
    const isDone = wfs.find(ws => ws.stateId === sub.stateId)?.state?.category === 'DONE';
    const targetCat = isDone ? 'OPEN' : 'DONE';
    const target = wfs.find(ws => ws.state?.category === targetCat)
      ?? (isDone ? wfs.find(ws => ws.isInitial) ?? wfs[0] : wfs[wfs.length - 1]);
    if (!target) return;
    await taskRepo.moveToState(sub.id, target.stateId);
    setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, stateId: target.stateId } : s));
  };

  const stateById = useMemo(() => {
    const m: Record<string, { name?: string; category?: string }> = {};
    wfStates.forEach(ws => { m[ws.stateId] = { name: ws.state?.name, category: ws.state?.category }; });
    return m;
  }, [wfStates]);

  const subtaskStats = useMemo(() => {
    const done = subtasks.filter(s => stateById[s.stateId ?? '']?.category === 'DONE').length;
    return { done, total: subtasks.length };
  }, [subtasks, stateById]);

  const handleCreateSubtask = async () => {
    const title = subtaskTitle.trim();
    if (!title) return;
    const tt = taskTypes.find(x => x.id === subtaskTypeId);
    if (!tt?.workflowId) return;
    setCreatingSub(true);
    try {
      const wfs = await stateRepo.findByWorkflow(tt.workflowId);
      const open = wfs.find(ws => ws.state?.category === 'OPEN') ?? wfs.find(ws => ws.isInitial) ?? wfs[0];
      if (!open) return;
      const created = await taskRepo.create({
        taskTypeId: tt.id,
        stateId: open.stateId,
        title,
        data: {},
        assigneeId: currentUser.id,
        priority: null,
        createdBy: currentUser.id,
        parentTaskId: task.id,
      });
      setSubtasks(prev => [...prev, created]);
      setSubtaskTitle('');
      setShowSubtaskForm(false);
    } finally {
      setCreatingSub(false);
    }
  };

  const handleDeleteAlarm = async (alarmId: string) => {
    await taskAlarmRepo.remove(alarmId);
    setAlarms(prev => prev.filter(a => a.id !== alarmId));
  };

  const schema = (currentType.schema as SchemaField[]) || [];
  const detailFields = schema.filter(f => f.showOnDetail);
  const mainDetailFields = detailFields
    .filter(f => (f.column ?? 'main') === 'main')
    .sort((a, b) => a.order - b.order);
  const sideDetailFields = detailFields
    .filter(f => (f.column ?? 'main') === 'sidebar')
    .sort((a, b) => a.order - b.order);

  /** Reads the effective value for a schema field — from native task columns
   *  when the field type shadows one, otherwise from task.data. */
  const readValue = (field: SchemaField): unknown => {
    if (field.fieldType === 'title') return title;
    if (field.fieldType === 'assignee') return assigneeId;
    if (field.fieldType === 'due_date') return dueDate;
    return data[field.id];
  };

  /** Writes the value for a schema field — routes native-shadowed types
   *  (title/assignee/due_date) to their native columns instead of task.data. */
  const writeValue = (field: SchemaField, v: unknown) => {
    if (field.fieldType === 'title') {
      setTitle(v as string);
      autoSave({ title: v as string });
    } else if (field.fieldType === 'assignee') {
      const next = v as string | null;
      setAssigneeId(next);
      autoSave({ assigneeId: next });
    } else if (field.fieldType === 'due_date') {
      const next = v as string | null;
      setDueDate(next);
      autoSave({ dueDate: next });
    } else {
      const newData = { ...data, [field.id]: v };
      setData(newData);
      autoSave({ data: newData });
    }
  };

  const handleTypeSwitch = (newTypeId: string, mapping: Record<string, string | null>) => {
    const next = taskTypes.find(x => x.id === newTypeId);
    if (!next) return;
    // Reshape data according to mapping: orphaned fields either get mapped
    // onto a new field id, or are dropped entirely (null mapping).
    const nextData = { ...data };
    for (const [fromId, toId] of Object.entries(mapping)) {
      const v = nextData[fromId];
      delete nextData[fromId];
      if (toId) nextData[toId] = v;
    }
    setCurrentType(next);
    setData(nextData);
    autoSave({ taskTypeId: next.id, data: nextData });
  };

  return (
    <Modal
      title={task.code ? `${task.code} · ${currentType.name}` : currentType.name}
      onClose={onClose}
      width={1120}
      titleAccessory={<SavedIndicator savedAt={savedAt} />}
    >
      <style>{`
        .vl-tdm-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 20px; }
        @media (max-width: 1200px) {
          .vl-tdm-grid { grid-template-columns: 1fr; gap: 16px; }
        }
      `}</style>
      {ancestors.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
          padding: '8px 12px', marginBottom: 14,
          background: 'var(--ac-dim)', borderRadius: 8,
          border: '1px solid var(--bd)',
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700, color: 'var(--ac)',
            textTransform: 'uppercase', letterSpacing: '.08em',
          }}>
            {t('vectorLogic.parentLabel')}
          </span>
          {ancestors.map((a, i) => (
            <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ color: 'var(--tx3)' }}>/</span>}
              <button
                type="button"
                onClick={() => onOpenTask?.(a.id)}
                style={{
                  background: 'transparent', border: 'none',
                  cursor: onOpenTask ? 'pointer' : 'default',
                  padding: '2px 6px', borderRadius: 4, fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  color: 'var(--tx)', fontSize: 12,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--sf2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {a.code && (
                  <span style={{
                    fontWeight: 700, color: 'var(--ac)',
                    fontFamily: "'Space Grotesk',sans-serif", letterSpacing: '.04em', fontSize: 11,
                  }}>{a.code}</span>
                )}
                <span style={{
                  maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{a.title}</span>
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="vl-tdm-grid">
        {/* ── Main column ─────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Inline title (big) — fallback when the schema has no title field in the main column. */}
          {mainDetailFields.some(f => f.fieldType === 'title') ? null : (
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={() => autoSave({ title })}
              placeholder={t('vectorLogic.taskTitle')}
              style={{
                width: '100%', padding: '4px 0', fontSize: 22,
                fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700,
                background: 'transparent', border: 'none', borderBottom: '1px solid transparent',
                color: 'var(--tx)', outline: 'none', transition: 'border-color .15s',
              }}
              onFocus={e => e.currentTarget.style.borderBottomColor = 'var(--ac)'}
            />
          )}

          {mainDetailFields.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
              {mainDetailFields.map(field => (
                <div
                  key={field.id}
                  style={field.fieldType === 'rich_text'
                    ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 220 }
                    : undefined}
                >
                  <DynamicFieldRenderer
                    field={field}
                    value={readValue(field)}
                    wsUsers={wsUsers}
                    onChange={(v) => writeValue(field, v)}
                  />
                </div>
              ))}
            </div>
          )}

          {detailFields.length === 0 && (
            <div style={{ color: 'var(--tx3)', fontSize: 11, padding: '20px 0', textAlign: 'center' }}>
              {t('vectorLogic.noDetailFields')}
            </div>
          )}

          {/* Subtasks — always in the main column at the bottom. */}
          <div style={{ marginTop: 6, paddingTop: 14, borderTop: '1px solid var(--bd)' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--ac)' }}>account_tree</span>
              <span style={{
                fontSize: 11, fontWeight: 700, color: 'var(--tx)',
                letterSpacing: '.05em', textTransform: 'uppercase',
              }}>
                {t('vectorLogic.subtasks')}
              </span>
              {subtasks.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 600, color: 'var(--tx3)',
                  padding: '2px 8px', background: 'var(--sf2)', borderRadius: 10,
                }}>
                  {subtaskStats.done}/{subtaskStats.total}
                </span>
              )}
            </div>
            {subtasks.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--tx3)', padding: '6px 0 10px' }}>
                {t('vectorLogic.noSubtasks')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {subtasks.map(s => {
                  const done = stateById[s.stateId ?? '']?.category === 'DONE';
                  const isDragging = dragSubId === s.id;
                  const isDragOver  = dragOverSubId === s.id && dragSubId && dragSubId !== s.id;
                  return (
                    <div
                      key={s.id}
                      draggable
                      onDragStart={(e) => {
                        setDragSubId(s.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragSubId && dragSubId !== s.id) setDragOverSubId(s.id);
                      }}
                      onDragLeave={() => { if (dragOverSubId === s.id) setDragOverSubId(null); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragSubId) reorderSubtasks(dragSubId, s.id);
                        setDragSubId(null); setDragOverSubId(null);
                      }}
                      onDragEnd={() => { setDragSubId(null); setDragOverSubId(null); }}
                      onClick={() => onOpenTask?.(s.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 10px', borderRadius: 8,
                        background: isDragOver ? 'var(--ac-dim)' : 'var(--sf2)',
                        border: isDragOver ? '1px dashed var(--ac)' : '1px solid transparent',
                        fontSize: 12,
                        cursor: onOpenTask ? 'pointer' : 'default',
                        opacity: isDragging ? 0.4 : 1,
                        transition: 'background .12s, border-color .12s',
                      }}
                      onMouseEnter={e => { if (onOpenTask && !isDragOver) e.currentTarget.style.background = 'var(--sf3)'; }}
                      onMouseLeave={e => { if (!isDragOver) e.currentTarget.style.background = 'var(--sf2)'; }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 16, color: done ? 'var(--green)' : 'var(--tx3)', cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); toggleSubtaskDone(s); }}
                        title={done ? t('vectorLogic.markAsOpen') : t('vectorLogic.markAsDone')}
                      >
                        {done ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                      {s.code && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: 'var(--ac)',
                          fontFamily: "'Space Grotesk',sans-serif", letterSpacing: '.04em',
                        }}>{s.code}</span>
                      )}
                      <span style={{
                        flex: 1, minWidth: 0, color: 'var(--tx)',
                        textDecoration: done ? 'line-through' : 'none',
                        opacity: done ? 0.7 : 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {s.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {showSubtaskForm ? (
              <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                <select
                  value={subtaskTypeId}
                  onChange={e => setSubtaskTypeId(e.target.value)}
                  style={{ ...sideInp, width: 160, fontSize: 12 }}
                >
                  {taskTypes.filter(tt => tt.workflowId).map(tt => (
                    <option key={tt.id} value={tt.id}>{tt.name}</option>
                  ))}
                </select>
                <input
                  autoFocus
                  value={subtaskTitle}
                  onChange={e => setSubtaskTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreateSubtask();
                    else if (e.key === 'Escape') { setShowSubtaskForm(false); setSubtaskTitle(''); }
                  }}
                  placeholder={t('vectorLogic.taskTitle')}
                  style={{ ...sideInp, flex: 1, fontSize: 12 }}
                />
                <button
                  onClick={handleCreateSubtask}
                  disabled={!subtaskTitle.trim() || creatingSub}
                  style={{
                    padding: '7px 14px', borderRadius: 8,
                    background: !subtaskTitle.trim() || creatingSub ? 'var(--sf3)' : 'var(--ac)',
                    color: !subtaskTitle.trim() || creatingSub ? 'var(--tx3)' : 'var(--ac-on)',
                    border: 'none', fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
                    cursor: !subtaskTitle.trim() || creatingSub ? 'not-allowed' : 'pointer',
                  }}
                >
                  {t('common.create')}
                </button>
                <button
                  onClick={() => { setShowSubtaskForm(false); setSubtaskTitle(''); }}
                  style={{
                    padding: '7px 10px', borderRadius: 8, background: 'transparent',
                    color: 'var(--tx2)', border: '1px solid var(--bd)',
                    fontFamily: 'inherit', fontSize: 11, cursor: 'pointer',
                  }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSubtaskForm(true)}
                style={{
                  marginTop: 8, padding: '7px 12px', borderRadius: 8,
                  background: 'var(--ac-dim)', color: 'var(--ac)', border: 'none',
                  fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                {t('vectorLogic.addSubtask')}
              </button>
            )}
          </div>
        </div>

        {/* ── Sidebar ──────────────────────────────────── */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 16,
          padding: 16, background: 'var(--sf2)', borderRadius: 12,
        }}>
          {/* Type */}
          <div style={{ position: 'relative' }}>
            <div style={sideLbl}>{t('vectorLogic.taskType')}</div>
            <TaskTypeSwitcher
              current={currentType}
              types={taskTypes}
              data={data}
              onSwitch={handleTypeSwitch}
            />
          </div>

          {/* State */}
          <div>
            <div style={sideLbl}>{t('vectorLogic.state')}</div>
            <select
              value={stateId ?? ''}
              onChange={e => { setStateId(e.target.value); autoSave({ stateId: e.target.value }); }}
              style={sideInp}
            >
              {wfStates.map(ws => (
                <option key={ws.stateId} value={ws.stateId}>{ws.state?.name}</option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div>
            <div style={sideLbl}>{t('vectorLogic.priority')}</div>
            <select
              value={priority ?? ''}
              onChange={e => { setPriority(e.target.value); autoSave({ priority: e.target.value }); }}
              style={sideInp}
            >
              <option value="">—</option>
              {priorities.map(p => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Sidebar schema fields (assignee/due date/custom fields live here
              when the user drops them on the sidebar column in the builder). */}
          {sideDetailFields.map(field => (
            <div key={field.id}>
              <div style={sideLbl}>{field.label}</div>
              <DynamicFieldRenderer
                field={field}
                value={readValue(field)}
                wsUsers={wsUsers}
                onChange={(v) => writeValue(field, v)}
              />
            </div>
          ))}

          {/* Alarms */}
          <div>
            <div style={{ ...sideLbl, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--amber)' }}>alarm</span>
              {t('vectorLogic.alarms')}
            </div>
            {alarms.length === 0 ? (
              <div style={{ fontSize: 10, color: 'var(--tx3)', padding: '4px 0' }}>
                {t('vectorLogic.noAlarms')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {alarms.map(a => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 8px', borderRadius: 6, background: 'var(--sf)',
                    fontSize: 11,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--amber)' }}>alarm</span>
                    <span style={{ flex: 1, color: 'var(--tx)' }}>
                      {new Date(a.triggerAt).toLocaleString()}
                    </span>
                    <button
                      onClick={() => handleDeleteAlarm(a.id)}
                      title={t('common.delete')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', padding: 0, display: 'flex' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowAlarmPicker(true)}
              style={{
                marginTop: 6, width: '100%', padding: '6px 10px', borderRadius: 6,
                background: 'var(--ac-dim)', color: 'var(--ac)', border: 'none',
                fontFamily: 'inherit', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>add</span>
              {t('vectorLogic.addAlarm')}
            </button>
          </div>

          {/* Metadata (read-only) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: '1px solid var(--bd)' }}>
            {task.code && (
              <MetaRow
                icon="tag"
                label={t('vectorLogic.code')}
                value={task.code}
              />
            )}
            <MetaRow
              icon="schedule"
              label={t('vectorLogic.created')}
              value={new Date(task.createdAt).toLocaleDateString()}
            />
            <MetaRow
              icon="timer"
              label={t('vectorLogic.daysInColumn')}
              value={`${daysBetween(task.stateEnteredAt, new Date())}d`}
            />
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', gap: 8,
        paddingTop: 16, marginTop: 16, borderTop: '1px solid var(--bd)',
      }}>
        <button
          style={btnStyle('danger')}
          onClick={async () => {
            if (await dialog.confirm(t('vectorLogic.deleteTaskConfirm'), { danger: true })) onDelete();
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
          {t('common.delete')}
        </button>
        <button style={btnStyle('ghost')} onClick={onClose}>{t('common.close')}</button>
      </div>

      {showAlarmPicker && (
        <TaskAlarmPicker
          taskId={task.id}
          userId={currentUser.id}
          onCreated={(a) => setAlarms(prev => [...prev, a])}
          onClose={() => setShowAlarmPicker(false)}
        />
      )}
    </Modal>
  );
}

/** Small "Auto-saved" pill that flashes after every persisted edit. */
function SavedIndicator({ savedAt }: { savedAt: number | null }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (savedAt == null) return;
    setVisible(true);
    const h = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(h);
  }, [savedAt]);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10, fontWeight: 600, color: 'var(--green)',
      opacity: visible ? 1 : 0, transition: 'opacity .25s',
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>cloud_done</span>
      {t('vectorLogic.autoSaved')}
    </span>
  );
}

function MetaRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--tx3)' }}>{icon}</span>
      <span style={{ color: 'var(--tx3)', flex: 1, letterSpacing: '.04em', textTransform: 'uppercase', fontWeight: 600 }}>{label}</span>
      <span style={{ color: 'var(--tx)', fontWeight: 600, fontFamily: "'Space Grotesk',sans-serif" }}>{value}</span>
    </div>
  );
}

const sideLbl = {
  fontSize: 9, fontWeight: 700, color: 'var(--tx3)',
  letterSpacing: '.1em', textTransform: 'uppercase' as const, marginBottom: 6,
};
const sideInp = {
  width: '100%', padding: '7px 10px', fontSize: 12, fontFamily: 'inherit',
  background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 6,
  color: 'var(--tx)', outline: 'none',
};

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
      case 'checklist':
        return <ChecklistField value={value} onChange={onChange} />;
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

/* ── Checklist field ────────────────────────────────────────────────────
 * Editable list of { id, label, checked }. Items can be added inline,
 * their label edited, toggled on/off, or deleted. Shape is stored as an
 * array on task.data[fieldId] — no schema migration needed. */
function ChecklistField({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const { t } = useTranslation();
  const items: Array<{ id: string; label: string; checked: boolean }> = Array.isArray(value)
    ? (value as any[]).filter(x => x && typeof x === 'object')
    : [];
  const [draft, setDraft] = useState('');

  const update = (next: typeof items) => onChange(next);

  const toggle = (id: string) => update(items.map(it => it.id === id ? { ...it, checked: !it.checked } : it));
  const setLabel = (id: string, label: string) => update(items.map(it => it.id === id ? { ...it, label } : it));
  const remove = (id: string) => update(items.filter(it => it.id !== id));
  const addDraft = () => {
    const label = draft.trim();
    if (!label) return;
    const id = Math.random().toString(36).slice(2, 10);
    update([...items, { id, label, checked: false }]);
    setDraft('');
  };

  const doneCount = items.filter(it => it.checked).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--tx3)', letterSpacing: '.04em' }}>
          {doneCount}/{items.length} {t('vectorLogic.checklistDone')}
        </div>
      )}
      {items.map(it => (
        <div key={it.id} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', background: 'var(--sf2)', borderRadius: 6,
        }}>
          <input
            type="checkbox"
            checked={it.checked}
            onChange={() => toggle(it.id)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <input
            value={it.label}
            onChange={e => setLabel(it.id, e.target.value)}
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              color: 'var(--tx)', fontSize: 12, fontFamily: 'inherit',
              textDecoration: it.checked ? 'line-through' : 'none',
              opacity: it.checked ? 0.7 : 1,
            }}
          />
          <button
            onClick={() => remove(it.id)}
            title={t('common.delete')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', padding: 0, display: 'flex' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--tx3)' }}>add</span>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && draft.trim()) { e.preventDefault(); addDraft(); }
          }}
          placeholder={t('vectorLogic.checklistAddItem')}
          style={{
            flex: 1, border: '1px dashed var(--bd)', outline: 'none',
            background: 'transparent', color: 'var(--tx)', fontSize: 12,
            padding: '6px 10px', borderRadius: 6, fontFamily: 'inherit',
          }}
        />
        <button
          onClick={addDraft}
          disabled={!draft.trim()}
          style={{
            padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: draft.trim() ? 'var(--ac-dim)' : 'var(--sf3)',
            color: draft.trim() ? 'var(--ac)' : 'var(--tx3)',
            border: 'none', fontFamily: 'inherit',
            cursor: draft.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          {t('common.add')}
        </button>
      </div>
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
    background: 'linear-gradient(135deg, var(--ac2), var(--ac))',
    color: 'var(--ac-on)',
    boxShadow: '0 2px 12px var(--ac-dim)',
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
function Modal({ title, onClose, children, width = 480, titleAccessory }: {
  title: string; onClose: () => void; children: React.ReactNode; width?: number;
  titleAccessory?: React.ReactNode;
}) {
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h3>
            {titleAccessory}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

/* ── Tooltip (portal) ──────────────────────────────────────────────────── */
function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = () => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top - 8 });
  };
  const hide = () => setPos(null);

  return (
    <>
      <span ref={ref} onMouseEnter={show} onMouseLeave={hide} style={{ display: 'inline-flex' }}>
        {children}
      </span>
      {pos && createPortal(
        <div style={{
          position: 'fixed', left: pos.x, top: pos.y, transform: 'translate(-50%, -100%)',
          background: 'var(--sf3)', color: 'var(--tx)', border: '1px solid var(--bd)',
          borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 500,
          lineHeight: 1.3, whiteSpace: 'nowrap', pointerEvents: 'none',
          boxShadow: '0 6px 16px rgba(0,0,0,.4)', zIndex: 9999,
          fontFamily: 'inherit',
        }}>{label}</div>,
        document.body
      )}
    </>
  );
}
