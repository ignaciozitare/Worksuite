// @ts-nocheck
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { Task, TaskPriority } from '../../domain/entities/Task';
import type { TaskType } from '../../domain/entities/TaskType';
import type { WorkflowState, StateCategory } from '../../domain/entities/State';
import type { SchemaField } from '../../domain/entities/FieldType';
import { FIELD_TYPES } from '../../domain/entities/FieldType';
import { taskRepo, taskTypeRepo, stateRepo } from '../../container';
import { RichTextEditor } from '../components/RichTextEditor';
import { UserPicker } from '../components/UserPicker';

const CAT_COLORS: Record<StateCategory, { color: string; bg: string }> = {
  BACKLOG:     { color: 'var(--tx3)',   bg: 'rgba(140,144,159,.08)' },
  OPEN:        { color: 'var(--amber)', bg: 'rgba(245,158,11,.08)' },
  IN_PROGRESS: { color: 'var(--ac)',    bg: 'rgba(79,110,247,.08)' },
  DONE:        { color: 'var(--green)', bg: 'rgba(62,207,142,.08)' },
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'var(--tx3)',
  medium: 'var(--ac)',
  high: 'var(--amber)',
  urgent: 'var(--red)',
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
  const [loading, setLoading] = useState(true);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);

  useEffect(() => {
    taskTypeRepo.findAll().then(tts => {
      const assigned = tts.filter(tt => tt.workflowId);
      setTaskTypes(assigned);
      if (assigned.length > 0) {
        loadType(assigned[0]);
      }
      setLoading(false);
    });
  }, []);

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

  const tasksByState = useMemo(() => {
    const map: Record<string, Task[]> = {};
    wfStates.forEach(ws => { map[ws.stateId] = []; });
    tasks.forEach(task => {
      if (task.stateId && map[task.stateId] != null) {
        map[task.stateId].push(task);
      }
    });
    return map;
  }, [tasks, wfStates]);

  const createTask = async (title: string, stateId: string) => {
    // Pre-fill the assignee field in the task data with the current user
    // if the schema has an assignee field. This is in addition to the
    // top-level assigneeId so the field renders correctly in the modal.
    const schema = (selectedType?.schema as any[]) ?? [];
    const initialData: Record<string, unknown> = {};
    for (const f of schema) {
      if (f.fieldType === 'assignee') {
        initialData[f.id] = currentUser.id;
      }
    }
    const created = await taskRepo.create({
      taskTypeId: selectedType!.id,
      stateId,
      title,
      data: initialData,
      assigneeId: currentUser.id,
      priority: 'medium',
      createdBy: currentUser.id,
    });
    setTasks(prev => [created, ...prev]);
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
      <div style={{ padding: '0 4px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx)', margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
          {t('vectorLogic.smartKanban')}
        </h2>
        {taskTypes.length > 0 && (
          <div style={{ display: 'flex', gap: 4, background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 3 }}>
            {taskTypes.map(tt => (
              <button key={tt.id} onClick={() => loadType(tt)}
                style={{
                  background: selectedType?.id === tt.id ? 'var(--ac)' : 'transparent',
                  color: selectedType?.id === tt.id ? '#fff' : 'var(--tx3)',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  fontWeight: selectedType?.id === tt.id ? 600 : 400,
                  fontSize: 11, padding: '5px 12px', fontFamily: 'inherit',
                }}>
                {tt.name}
              </button>
            ))}
          </div>
        )}
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
          {wfStates
            .sort((a, b) => catOrder(a.state?.category) - catOrder(b.state?.category))
            .map(ws => {
              const cc = CAT_COLORS[ws.state?.category ?? 'BACKLOG'];
              const colTasks = tasksByState[ws.stateId] ?? [];
              return (
                <div key={ws.id}
                  onDragOver={onDragOverCol}
                  onDrop={onDropCol(ws.stateId)}
                  style={{
                    background: 'var(--sf2)', borderRadius: 10,
                    borderTop: `3px solid ${ws.state?.color || cc.color}`,
                    display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
                  }}>
                  <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: ws.state?.color || cc.color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      {ws.state?.name}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 600, marginLeft: 'auto' }}>
                      {colTasks.length}
                    </span>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {colTasks.map(task => (
                      <TaskCard key={task.id} task={task} onClick={() => setDetailTask(task)}
                        onDragStart={onDragStart(task.id)} />
                    ))}
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
          onClose={() => setShowNew(false)}
          onCreate={async (title) => {
            // Default state when creating a task: prefer OPEN, then is_initial,
            // then first state. This guarantees new tasks land in OPEN if it
            // exists in the workflow (per user request).
            const openState = wfStates.find(ws => ws.state?.category === 'OPEN');
            const initialState = openState ?? wfStates.find(ws => ws.isInitial) ?? wfStates[0];
            if (initialState) {
              await createTask(title, initialState.stateId);
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
function TaskCard({ task, onClick, onDragStart }: { task: Task; onClick: () => void; onDragStart: (e: React.DragEvent) => void }) {
  const priorityColor = task.priority ? PRIORITY_COLORS[task.priority] : 'var(--tx3)';
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      style={{
        background: 'var(--sf3)', borderRadius: 8, padding: '10px 12px',
        cursor: 'pointer', transition: 'all .15s',
        borderLeft: `3px solid ${priorityColor}`,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,110,247,.06)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--sf3)'}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', lineHeight: 1.3 }}>{task.title}</div>
      {task.priority && (
        <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
          <span style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 3,
            background: `${priorityColor}20`, color: priorityColor,
            fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase',
          }}>{task.priority}</span>
        </div>
      )}
    </div>
  );
}

/* ── New Task Modal ────────────────────────────────────────────────────── */
function NewTaskModal({ onClose, onCreate }: { onClose: () => void; onCreate: (title: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');

  const submit = async () => {
    if (!title.trim()) return;
    await onCreate(title.trim());
  };

  return (
    <Modal title={t('vectorLogic.newTask')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={lblStyle}>{t('vectorLogic.taskTitle')}</label>
          <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            style={inpStyle()} placeholder="e.g. Fix login bug" />
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
function TaskDetailModal({ task, taskType, wfStates, wsUsers, currentUser, onClose, onUpdate, onDelete }: {
  task: Task; taskType: TaskType; wfStates: WorkflowState[];
  wsUsers: WSUser[];
  currentUser: { id: string; [k: string]: unknown };
  onClose: () => void; onUpdate: (patch: Partial<Task>) => void; onDelete: () => void;
}) {
  const { t } = useTranslation();
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
          <select value={priority ?? 'medium'} onChange={e => { setPriority(e.target.value as any); onUpdate({ priority: e.target.value as any }); }}
            style={{ ...inpStyle({ width: 'auto' }), fontSize: 12 }}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
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
          <button style={btnStyle('danger')} onClick={() => { if (confirm(t('vectorLogic.deleteTaskConfirm'))) onDelete(); }}>
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
        placeholder={field.label || 'Untitled'}
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
        return <UserPicker users={wsUsers} value={(value as string) || null} onChange={onChange} placeholder="Unassigned" />;
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
  fontFamily: 'inherit', transition: 'all .15s',
  ...(variant === 'primary' && { background: 'var(--ac)', color: '#fff' }),
  ...(variant === 'ghost' && { background: 'var(--sf2)', color: 'var(--tx3)', border: '1px solid var(--bd)' }),
  ...(variant === 'danger' && { background: 'rgba(224,82,82,.1)', color: 'var(--red)', border: '1px solid rgba(224,82,82,.3)' }),
  ...extra,
});

const inpStyle = (extra = {}) => ({
  width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
  background: 'var(--sf2)', border: '1px solid var(--bd)',
  borderRadius: 8, color: 'var(--tx)', outline: 'none', ...extra,
});

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
