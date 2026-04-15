// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { TaskType } from '../../domain/entities/TaskType';
import type { SchemaField, FieldTypeId } from '../../domain/entities/FieldType';
import { FIELD_TYPES } from '../../domain/entities/FieldType';
import { taskTypeRepo } from '../../container';

const uid = () => Math.random().toString(36).slice(2, 10);

interface Props {
  currentUser: { id: string; [k: string]: unknown };
}

export function SchemaBuilderView({ currentUser }: Props) {
  const { t } = useTranslation();
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [selected, setSelected] = useState<TaskType | null>(null);
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedField, setSelectedField] = useState<SchemaField | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    taskTypeRepo.findAll().then(tts => {
      setTaskTypes(tts);
      if (tts.length > 0) { setSelected(tts[0]); setFields((tts[0].schema as SchemaField[]) || []); }
      setLoading(false);
    });
  }, []);

  const selectTaskType = (tt: TaskType) => {
    setSelected(tt);
    setFields((tt.schema as SchemaField[]) || []);
    setSelectedField(null);
  };

  const addField = (typeId: FieldTypeId) => {
    const def = FIELD_TYPES.find(f => f.id === typeId);
    if (!def) return;
    const newField: SchemaField = {
      id: uid(),
      fieldType: typeId,
      label: t(def.labelKey),
      required: false,
      showOnCreate: true,
      showOnDetail: true,
      options: def.hasOptions ? ['Option 1', 'Option 2'] : undefined,
      order: fields.length,
    };
    setFields(prev => [...prev, newField]);
    setSelectedField(newField);
  };

  const updateField = (id: string, patch: Partial<SchemaField>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
    if (selectedField?.id === id) setSelectedField(prev => prev ? { ...prev, ...patch } : prev);
  };

  const removeField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
    if (selectedField?.id === id) setSelectedField(null);
  };

  const saveSchema = async () => {
    if (!selected) return;
    setSaving(true);
    await taskTypeRepo.update(selected.id, { schema: fields as unknown[] });
    setTaskTypes(prev => prev.map(tt => tt.id === selected.id ? { ...tt, schema: fields } : tt));
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const filteredTypes = FIELD_TYPES.filter(f =>
    !search || t(f.labelKey).toLowerCase().includes(search.toLowerCase())
  );

  const categories = [...new Set(FIELD_TYPES.map(f => f.category))];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)' }}>{t('common.loading')}</div>;
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: 0 }}>
      {/* Left sidebar — Field Library */}
      <aside style={{
        width: 220, minWidth: 220, background: 'var(--sf)', borderRight: '1px solid var(--bd)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 14px 8px' }}>
          <h3 style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
            {t('vectorLogic.fieldLibrary')}
          </h3>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('vectorLogic.searchFields')}
            style={{
              width: '100%', padding: '5px 8px', fontSize: 11, fontFamily: 'inherit',
              background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 6,
              color: 'var(--tx)', outline: 'none',
            }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px' }}>
          {categories.map(cat => {
            const items = filteredTypes.filter(f => f.category === cat);
            if (!items.length) return null;
            return (
              <div key={cat}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.1em', padding: '10px 4px 4px' }}>
                  {cat}
                </div>
                {items.map(f => (
                  <button key={f.id} onClick={() => addField(f.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: 'transparent', color: 'var(--tx)', fontSize: 12,
                      fontFamily: 'inherit', transition: 'background .12s', textAlign: 'left',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--sf2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--ac)' }}>{f.icon}</span>
                    <span>{t(f.labelKey)}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Center — Form Canvas */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Task type selector + save */}
        <div style={{
          padding: '12px 20px', borderBottom: '1px solid var(--bd)',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx)', margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
            {t('vectorLogic.schemaBuilder')}
          </h2>
          <div style={{ display: 'flex', gap: 4, background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 3 }}>
            {taskTypes.map(tt => (
              <button key={tt.id} onClick={() => selectTaskType(tt)}
                style={{
                  background: selected?.id === tt.id ? 'var(--ac)' : 'transparent',
                  color: selected?.id === tt.id ? '#fff' : 'var(--tx3)',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  fontWeight: selected?.id === tt.id ? 600 : 400,
                  fontSize: 11, padding: '5px 12px', fontFamily: 'inherit',
                }}>
                {tt.name}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {saved && <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>✓ {t('admin.envSaved')}</span>}
            <button onClick={saveSchema} disabled={saving}
              style={{
                background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: 8,
                padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              {saving ? t('common.loading') : t('vectorLogic.saveSchema')}
            </button>
          </div>
        </div>

        {/* Field list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {fields.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--tx3)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: .2, display: 'block', marginBottom: 12 }}>drag_indicator</span>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{t('vectorLogic.dropFieldHere')}</div>
            </div>
          )}
          {fields.map((field, i) => {
            const def = FIELD_TYPES.find(f => f.id === field.fieldType);
            const isSelected = selectedField?.id === field.id;
            return (
              <div key={field.id} onClick={() => setSelectedField(field)}
                style={{
                  background: isSelected ? 'rgba(79,110,247,.06)' : 'var(--sf2)',
                  border: `1px solid ${isSelected ? 'var(--ac)' : 'var(--bd)'}`,
                  borderRadius: 10, padding: '14px 16px', marginBottom: 10,
                  cursor: 'pointer', transition: 'all .15s',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--tx3)' }}>drag_indicator</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                    background: 'rgba(79,110,247,.1)', color: 'var(--ac)',
                    letterSpacing: '.05em', textTransform: 'uppercase',
                  }}>{def?.id.replace(/_/g, ' ')}</span>
                  {field.required && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700 }}>REQUIRED</span>}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    {field.showOnCreate && <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 3, background: 'rgba(62,207,142,.1)', color: 'var(--green)', fontWeight: 700 }}>CREATE</span>}
                    {field.showOnDetail && <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 3, background: 'rgba(79,110,247,.1)', color: 'var(--ac)', fontWeight: 700 }}>DETAIL</span>}
                  </div>
                  <button onClick={e => { e.stopPropagation(); removeField(field.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', opacity: .5 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                  </button>
                </div>
                <div style={{ paddingLeft: 24 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>{field.label}</div>
                  {field.options && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      {field.options.map((opt, j) => (
                        <span key={j} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: 'var(--sf3)', color: 'var(--tx3)' }}>{opt}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right sidebar — Field Settings */}
      <aside style={{
        width: 260, minWidth: 260, background: 'var(--sf)', borderLeft: '1px solid var(--bd)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {selectedField ? (
          <FieldSettingsPanel field={selectedField} onUpdate={(patch) => updateField(selectedField.id, patch)} />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 12, padding: 20, textAlign: 'center' }}>
            {t('vectorLogic.selectFieldToEdit')}
          </div>
        )}
      </aside>
    </div>
  );
}

/* ── Field Settings Panel ─────────────────────────────────────────────────── */
function FieldSettingsPanel({ field, onUpdate }: { field: SchemaField; onUpdate: (patch: Partial<SchemaField>) => void }) {
  const { t } = useTranslation();

  return (
    <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1 }}>
      <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
        {t('vectorLogic.fieldSettings')}
      </h3>

      {/* Label */}
      <div>
        <label style={lblStyle}>{t('vectorLogic.fieldLabel')}</label>
        <input value={field.label} onChange={e => onUpdate({ label: e.target.value })}
          style={inpStyle()} />
      </div>

      {/* Display Logic */}
      <div>
        <label style={{ ...lblStyle, marginBottom: 10 }}>{t('vectorLogic.displayLogic')}</label>
        <ToggleRow label={t('vectorLogic.showOnCreate')} value={field.showOnCreate}
          onChange={v => onUpdate({ showOnCreate: v })} color="var(--green)" />
        <ToggleRow label={t('vectorLogic.showOnDetail')} value={field.showOnDetail}
          onChange={v => onUpdate({ showOnDetail: v })} color="var(--ac)" />
      </div>

      {/* Validation */}
      <div>
        <label style={lblStyle}>{t('vectorLogic.validation')}</label>
        <ToggleRow label={t('vectorLogic.requiredField')} value={field.required}
          onChange={v => onUpdate({ required: v })} color="var(--red)" />
      </div>

      {/* Options (for select/multi-select/radio) */}
      {field.options && (
        <div>
          <label style={lblStyle}>{t('vectorLogic.options')}</label>
          {field.options.map((opt, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <input value={opt}
                onChange={e => {
                  const newOpts = [...field.options!];
                  newOpts[i] = e.target.value;
                  onUpdate({ options: newOpts });
                }}
                style={{ ...inpStyle(), fontSize: 11 }} />
              <button onClick={() => onUpdate({ options: field.options!.filter((_, j) => j !== i) })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 14 }}>×</button>
            </div>
          ))}
          <button onClick={() => onUpdate({ options: [...(field.options || []), `Option ${(field.options?.length || 0) + 1}`] })}
            style={{
              background: 'none', border: '1px dashed var(--bd)', borderRadius: 6,
              padding: '4px 10px', fontSize: 11, color: 'var(--tx3)', cursor: 'pointer',
              fontFamily: 'inherit', width: '100%', marginTop: 4,
            }}>+ {t('vectorLogic.addOption')}</button>
        </div>
      )}
    </div>
  );
}

/* ── Toggle Row ───────────────────────────────────────────────────────────── */
function ToggleRow({ label, value, onChange, color }: { label: string; value: boolean; onChange: (v: boolean) => void; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 0',
    }}>
      <span style={{ fontSize: 12, color: 'var(--tx)' }}>{label}</span>
      <button onClick={() => onChange(!value)}
        style={{
          width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
          background: value ? color : 'var(--sf3)', position: 'relative', transition: 'background .2s',
        }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 3,
          left: value ? 19 : 3, transition: 'left .2s',
        }} />
      </button>
    </div>
  );
}

const inpStyle = (extra = {}) => ({
  width: '100%', padding: '7px 10px', fontSize: 12, fontFamily: 'inherit',
  background: 'var(--sf2)', border: '1px solid var(--bd)',
  borderRadius: 6, color: 'var(--tx)', outline: 'none', ...extra,
});

const lblStyle = {
  fontSize: 10, fontWeight: 700, color: 'var(--tx3)',
  textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5,
};
