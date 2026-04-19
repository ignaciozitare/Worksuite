// @ts-nocheck
import { useState, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { useDialog } from '@worksuite/ui';
import type { EmailRule, EmailRuleFilter, EmailRuleFilterType } from '../../domain/entities/EmailRule';
import type { TaskType } from '../../domain/entities/TaskType';
import type { Priority } from '../../domain/entities/Priority';
import { emailRuleRepo, taskTypeRepo, priorityRepo } from '../../container';

interface Props {
  currentUser: { id: string; [k: string]: unknown };
}

const FILTER_TYPES: EmailRuleFilterType[] = ['all', 'label', 'category', 'sender', 'domain'];

export function EmailRulesView({ currentUser }: Props) {
  const { t } = useTranslation();
  const dialog = useDialog();
  const [rules, setRules] = useState<EmailRule[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EmailRule | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [rs, tts, ps] = await Promise.all([
          emailRuleRepo.list(),
          taskTypeRepo.findAll(),
          priorityRepo.ensureDefaults(currentUser.id),
        ]);
        setRules(rs);
        setTaskTypes(tts);
        setPriorities(ps);
      } catch (err) { console.error('[EmailRules]', err); }
      finally { setLoading(false); }
    })();
  }, [currentUser.id]);

  const openNew = () => { setEditing(null); setShowForm(true); };
  const openEdit = (r: EmailRule) => { setEditing(r); setShowForm(true); };

  const toggleActive = async (r: EmailRule) => {
    await emailRuleRepo.update(r.id, { isActive: !r.isActive });
    setRules(prev => prev.map(x => x.id === r.id ? { ...x, isActive: !r.isActive } : x));
  };

  const remove = async (r: EmailRule) => {
    if (!(await dialog.confirm(`${t('common.delete')} "${r.name}"?`, { danger: true }))) return;
    await emailRuleRepo.remove(r.id);
    setRules(prev => prev.filter(x => x.id !== r.id));
  };

  const save = async (draft: Omit<EmailRule, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    if (editing) {
      await emailRuleRepo.update(editing.id, draft);
      setRules(prev => prev.map(x => x.id === editing.id ? { ...x, ...draft } : x));
    } else {
      const created = await emailRuleRepo.create({
        name: draft.name,
        filters: draft.filters,
        actionTaskTypeId: draft.actionTaskTypeId,
        actionPriorityName: draft.actionPriorityName,
        actionAssigneeId: draft.actionAssigneeId,
        sortOrder: rules.length,
        isActive: draft.isActive,
      });
      setRules(prev => [...prev, created]);
    }
    setShowForm(false);
    setEditing(null);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)' }}>{t('common.loading')}</div>;
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx)', margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
            {t('vectorLogic.emailRules')}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4 }}>
            {t('vectorLogic.emailRulesDesc')}
          </p>
        </div>
        <button onClick={openNew} style={btnPrimary}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
          {t('vectorLogic.newRule')}
        </button>
      </div>

      {rules.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--tx3)', background: 'var(--sf2)', borderRadius: 12 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: .25, display: 'block', marginBottom: 12 }}>inbox</span>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{t('vectorLogic.noEmailRules')}</div>
          <div style={{ fontSize: 11, opacity: .7 }}>{t('vectorLogic.noEmailRulesHint')}</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rules.map(r => {
          const taskTypeName = taskTypes.find(tt => tt.id === r.actionTaskTypeId)?.name;
          return (
            <div key={r.id}
              style={{
                background: 'var(--sf2)', borderRadius: 12, padding: '14px 16px',
                border: `1px solid ${r.isActive ? 'var(--bd)' : 'transparent'}`,
                opacity: r.isActive ? 1 : .55,
                display: 'flex', alignItems: 'center', gap: 12,
                transition: 'all .15s',
              }}>
              <button onClick={() => toggleActive(r)}
                title={r.isActive ? t('common.active') : t('common.inactive')}
                style={{
                  width: 36, height: 20, borderRadius: 10, border: 'none',
                  background: r.isActive ? 'var(--green)' : 'var(--sf3)',
                  position: 'relative', cursor: 'pointer', transition: 'background .2s',
                }}>
                <div style={{
                  width: 14, height: 14, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3, left: r.isActive ? 19 : 3, transition: 'left .2s',
                }} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>{r.name}</div>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {r.filters.length === 0 && <span>{t('vectorLogic.noFilters')}</span>}
                  {r.filters.map((f, i) => (
                    <span key={i} style={{
                      padding: '2px 8px', borderRadius: 10, background: 'var(--sf3)',
                      fontFamily: 'monospace', fontSize: 10,
                    }}>
                      {f.type === 'all' ? t('vectorLogic.filterDisplayAll') : `${t(`vectorLogic.filterType_${f.type}`)}: ${f.value}`}
                    </span>
                  ))}
                  {taskTypeName && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 10, background: 'rgba(79,110,247,.1)',
                      color: 'var(--ac)', fontWeight: 700,
                    }}>→ {taskTypeName}</span>
                  )}
                  {r.actionPriorityName && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 10, background: 'rgba(245,158,11,.1)',
                      color: 'var(--amber)', fontWeight: 700,
                    }}>⚑ {r.actionPriorityName}</span>
                  )}
                </div>
              </div>
              <button onClick={() => openEdit(r)} style={btnGhost}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
              </button>
              <button onClick={() => remove(r)} style={btnDanger}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
              </button>
            </div>
          );
        })}
      </div>

      {showForm && (
        <RuleForm
          rule={editing}
          taskTypes={taskTypes}
          priorities={priorities}
          onSave={save}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function RuleForm({ rule, taskTypes, priorities, onSave, onClose }: {
  rule: EmailRule | null;
  taskTypes: TaskType[];
  priorities: Priority[];
  onSave: (draft: Omit<EmailRule, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(rule?.name ?? '');
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const [filters, setFilters] = useState<EmailRuleFilter[]>(rule?.filters ?? [{ type: 'domain', value: '' }]);
  const [taskTypeId, setTaskTypeId] = useState(rule?.actionTaskTypeId ?? '');
  const [priorityName, setPriorityName] = useState(rule?.actionPriorityName ?? '');
  const [error, setError] = useState('');

  const addFilter = () => setFilters(prev => [...prev, { type: 'domain', value: '' }]);
  const removeFilter = (i: number) => setFilters(prev => prev.filter((_, idx) => idx !== i));
  const updateFilter = (i: number, patch: Partial<EmailRuleFilter>) =>
    setFilters(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));

  const submit = async () => {
    if (!name.trim()) { setError(t('vectorLogic.ruleNameRequired')); return; }
    const cleanFilters = filters.filter(f => f.type === 'all' || f.value.trim());
    if (cleanFilters.length === 0) { setError(t('vectorLogic.atLeastOneFilter')); return; }
    try {
      await onSave({
        name: name.trim(),
        isActive,
        filters: cleanFilters,
        actionTaskTypeId: taskTypeId || null,
        actionPriorityName: priorityName || null,
        actionAssigneeId: null,
        sortOrder: rule?.sortOrder ?? 0,
      });
    } catch (err) { setError(String(err)); }
  };

  return (
    <div style={modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...modalContainer, maxWidth: 560 }}>
        <div style={modalHeader}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx)', margin: 0 }}>
            {rule ? t('vectorLogic.editRule') : t('vectorLogic.newRule')}
          </h3>
          <button onClick={onClose} style={iconBtn}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>
          <div>
            <label style={lblStyle}>{t('common.name')}</label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus style={inpStyle()}
              placeholder={t('vectorLogic.placeholderVipClients')} />
          </div>

          <div>
            <label style={lblStyle}>{t('vectorLogic.filters')}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filters.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 6 }}>
                  <select value={f.type} onChange={e => updateFilter(i, { type: e.target.value as EmailRuleFilterType })}
                    style={{ ...inpStyle({ width: 140 }) }}>
                    {FILTER_TYPES.map(tf => <option key={tf} value={tf}>{t(`vectorLogic.filterType_${tf}`)}</option>)}
                  </select>
                  <input
                    value={f.value}
                    onChange={e => updateFilter(i, { value: e.target.value })}
                    disabled={f.type === 'all'}
                    placeholder={f.type === 'all' ? t('vectorLogic.allEmails') : t('vectorLogic.filterValue')}
                    style={inpStyle()}
                  />
                  <button onClick={() => removeFilter(i)} style={iconBtn} title={t('common.delete')}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                  </button>
                </div>
              ))}
              <button onClick={addFilter} style={{
                background: 'none', border: '1px dashed var(--bd)', borderRadius: 6,
                padding: '6px 10px', fontSize: 11, color: 'var(--tx3)', cursor: 'pointer',
                fontFamily: 'inherit',
              }}>+ {t('vectorLogic.addFilter')}</button>
            </div>
          </div>

          <div>
            <label style={lblStyle}>{t('vectorLogic.optionalActions')}</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <select value={taskTypeId} onChange={e => setTaskTypeId(e.target.value)} style={inpStyle()}>
                <option value="">{t('vectorLogic.taskTypeAuto')}</option>
                {taskTypes.map(tt => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
              </select>
              <select value={priorityName} onChange={e => setPriorityName(e.target.value)} style={inpStyle()}>
                <option value="">{t('vectorLogic.priorityAuto')}</option>
                {priorities.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <p style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 6, lineHeight: 1.4 }}>
              {t('vectorLogic.optionalActionsHint')}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="isActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            <label htmlFor="isActive" style={{ fontSize: 12, color: 'var(--tx)' }}>{t('vectorLogic.ruleActive')}</label>
          </div>

          {error && <div style={{ fontSize: 12, color: 'var(--red)', padding: '6px 10px', background: 'rgba(224,82,82,.08)', borderRadius: 6 }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid var(--bd)' }}>
            <button style={btnGhost} onClick={onClose}>{t('common.cancel')}</button>
            <button style={btnPrimary} onClick={submit}>{rule ? t('common.save') : t('common.create')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── styles ─────────────────────────────────────────────────────────────── */
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
  borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer', border: 'none',
  fontFamily: 'inherit', transition: 'all .2s',
  background: 'linear-gradient(135deg, #adc6ff, #4d8eff)',
  color: '#fff',
  boxShadow: '0 2px 12px rgba(77,142,255,.3)',
} as const;

const btnGhost = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
  borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer',
  fontFamily: 'inherit', transition: 'all .2s',
  background: 'rgba(42,42,42,.8)',
  backdropFilter: 'blur(12px)',
  color: 'var(--tx3)', border: '1px solid var(--bd)',
} as const;

const btnDanger = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
  borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer',
  fontFamily: 'inherit', transition: 'all .2s',
  background: 'linear-gradient(135deg, rgba(239,68,68,.15), rgba(239,68,68,.08))',
  color: 'var(--red)', border: '1px solid rgba(224,82,82,.2)',
} as const;

const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6,
  color: 'var(--tx3)', display: 'flex', alignItems: 'center',
} as const;

const inpStyle = (extra = {}) => ({
  width: '100%', padding: '7px 10px', fontSize: 12, fontFamily: 'inherit',
  background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 6,
  color: 'var(--tx)', outline: 'none', ...extra,
} as const);

const lblStyle = {
  fontSize: 10, fontWeight: 700, color: 'var(--tx3)',
  textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5,
} as const;

const modalBackdrop = {
  position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center',
  justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)',
} as const;

const modalContainer = {
  background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 16,
  width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,.6)', overflow: 'hidden',
} as const;

const modalHeader = {
  padding: '16px 20px', borderBottom: '1px solid var(--bd)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
} as const;
