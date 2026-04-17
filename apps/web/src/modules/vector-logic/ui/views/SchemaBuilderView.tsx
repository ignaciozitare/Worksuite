// @ts-nocheck
import { useState, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { TaskType } from '../../domain/entities/TaskType';
import type { SchemaField, FieldTypeId } from '../../domain/entities/FieldType';
import { FIELD_TYPES, defaultFieldsForNewTaskType } from '../../domain/entities/FieldType';
import { taskTypeRepo } from '../../container';
import { IconPicker } from '../components/IconPicker';

const uid = () => Math.random().toString(36).slice(2, 10);

interface Props {
  currentUser: { id: string; [k: string]: unknown };
  wsUsers?: Array<{ id: string; name?: string; email: string }>;
}

export function SchemaBuilderView({ currentUser, wsUsers = [] }: Props) {
  const { t } = useTranslation();
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [selected, setSelected] = useState<TaskType | null>(null);
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedField, setSelectedField] = useState<SchemaField | null>(null);
  const [search, setSearch] = useState('');

  // New task type modal
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeIcon, setNewTypeIcon] = useState('task_alt');

  // Inline rename of selected task type
  const [renamingType, setRenamingType] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // DnD state
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [draggingLibField, setDraggingLibField] = useState<FieldTypeId | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    taskTypeRepo.findAll().then(tts => {
      setTaskTypes(tts);
      if (tts.length > 0) selectTaskType(tts[0]);
      setLoading(false);
    });
  }, []);

  const selectTaskType = (tt: TaskType) => {
    setSelected(tt);
    setFields((tt.schema as SchemaField[]) || []);
    setSelectedField(null);
    setRenamingType(false);
  };

  const createTaskType = async () => {
    if (!newTypeName.trim()) return;
    const initialFields = defaultFieldsForNewTaskType();
    const created = await taskTypeRepo.create({
      name: newTypeName.trim(),
      icon: newTypeIcon,
      workflowId: null,
      schema: initialFields as unknown[],
    });
    setTaskTypes(prev => [...prev, created]);
    selectTaskType(created);
    setNewTypeName(''); setNewTypeIcon('task_alt'); setShowNewType(false);
  };

  const deleteSelectedType = async () => {
    if (!selected) return;
    if (!confirm(t('vectorLogic.deleteTaskTypeConfirm', { name: selected.name }))) return;
    await taskTypeRepo.remove(selected.id);
    setTaskTypes(prev => prev.filter(t => t.id !== selected.id));
    setSelected(null);
    setFields([]);
  };

  const renameSelectedType = async () => {
    if (!selected || !renameValue.trim()) { setRenamingType(false); return; }
    await taskTypeRepo.update(selected.id, { name: renameValue.trim() });
    setTaskTypes(prev => prev.map(t => t.id === selected.id ? { ...t, name: renameValue.trim() } : t));
    setSelected({ ...selected, name: renameValue.trim() });
    setRenamingType(false);
  };

  const updateSelectedTypeIcon = async (icon: string) => {
    if (!selected) return;
    await taskTypeRepo.update(selected.id, { icon });
    setTaskTypes(prev => prev.map(t => t.id === selected.id ? { ...t, icon } : t));
    setSelected({ ...selected, icon });
  };

  const addField = (typeId: FieldTypeId, insertAt?: number) => {
    const def = FIELD_TYPES.find(f => f.id === typeId);
    if (!def) return;
    const newField: SchemaField = {
      id: uid(),
      fieldType: typeId,
      label: t(def.labelKey),
      required: false,
      showOnCreate: true,
      showOnDetail: true,
      options: def.hasOptions ? [`${t('vectorLogic.defaultOption')} 1`, `${t('vectorLogic.defaultOption')} 2`] : undefined,
      order: 0,
    };
    setFields(prev => {
      const idx = insertAt == null ? prev.length : Math.max(0, Math.min(insertAt, prev.length));
      const next = [...prev];
      next.splice(idx, 0, newField);
      return next.map((f, i) => ({ ...f, order: i }));
    });
    setSelectedField(newField);
  };

  // Move an existing field to a new index (drag reorder)
  const moveFieldTo = (id: string, targetIdx: number) => {
    setFields(prev => {
      const fromIdx = prev.findIndex(f => f.id === id);
      if (fromIdx === -1) return prev;
      // Normalize: if dropping after the source, the target shifts by -1
      let to = Math.max(0, Math.min(targetIdx, prev.length));
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      if (fromIdx < to) to -= 1;
      next.splice(to, 0, item);
      return next.map((f, i) => ({ ...f, order: i }));
    });
  };

  const updateField = (id: string, patch: Partial<SchemaField>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
    if (selectedField?.id === id) setSelectedField(prev => prev ? { ...prev, ...patch } : prev);
  };

  const removeField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
    if (selectedField?.id === id) setSelectedField(null);
  };

  const moveField = (id: string, direction: -1 | 1) => {
    setFields(prev => {
      const idx = prev.findIndex(f => f.id === id);
      const newIdx = idx + direction;
      if (idx < 0 || newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next.map((f, i) => ({ ...f, order: i }));
    });
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
    !search || t(f.labelKey).toLowerCase().includes(search.toLowerCase()),
  );

  const categories: Array<'core' | 'text' | 'selection' | 'date' | 'system' | 'media' | 'relation'> =
    ['core', 'text', 'selection', 'date', 'system', 'media', 'relation'];

  const catLabel: Record<string, string> = {
    core: t('vectorLogic.categoryCoreFields'),
    text: t('vectorLogic.categoryTextFields'),
    selection: t('vectorLogic.categorySelectionFields'),
    date: t('vectorLogic.categoryDateFields'),
    system: t('vectorLogic.categorySystemFields'),
    media: t('vectorLogic.categoryMediaFields'),
    relation: t('vectorLogic.categoryRelationFields'),
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)' }}>{t('common.loading')}</div>;
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 0 }}>
      {/* ── Left sidebar — Task Types list ─────────────────────────────── */}
      <aside style={{
        width: 220, minWidth: 220, background: 'var(--sf)', borderRight: '1px solid var(--bd)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 14px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
            {t('vectorLogic.taskTypes')}
          </h3>
          <button onClick={() => setShowNewType(true)}
            title={t('vectorLogic.newTaskType')}
            style={{
              background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: 6,
              width: 22, height: 22, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
            }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 12px' }}>
          {taskTypes.map(tt => {
            const isSelected = selected?.id === tt.id;
            return (
              <div key={tt.id}
                onClick={() => selectTaskType(tt)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 6, marginBottom: 3, cursor: 'pointer',
                  background: isSelected ? 'rgba(79,110,247,.1)' : 'transparent',
                  border: `1px solid ${isSelected ? 'var(--ac)' : 'transparent'}`,
                  transition: 'all .12s',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--sf2)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                <span className="material-symbols-outlined"
                  style={{ fontSize: 18, color: isSelected ? 'var(--ac)' : 'var(--tx3)' }}>
                  {tt.icon || 'task_alt'}
                </span>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--tx)', fontWeight: isSelected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tt.name}
                </span>
              </div>
            );
          })}
          {taskTypes.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--tx3)', textAlign: 'center', padding: '20px 12px', opacity: .5, lineHeight: 1.5 }}>
              {t('vectorLogic.noTaskTypesYet')}
            </div>
          )}
        </div>
      </aside>

      {/* ── Center — Field library + Form canvas ───────────────────────── */}
      {selected ? (
        <>
          {/* Field library */}
          <aside style={{
            width: 200, minWidth: 200, background: 'var(--sf)', borderRight: '1px solid var(--bd)',
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 12px' }}>
              {categories.map(cat => {
                const items = filteredTypes.filter(f => f.category === cat);
                if (!items.length) return null;
                return (
                  <div key={cat}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.1em', padding: '10px 4px 4px' }}>
                      {catLabel[cat] || cat}
                    </div>
                    {items.map(f => (
                      <div key={f.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggingLibField(f.id);
                          e.dataTransfer.effectAllowed = 'copy';
                          e.dataTransfer.setData('text/plain', f.id);
                        }}
                        onDragEnd={() => { setDraggingLibField(null); setDragOverIdx(null); }}
                        onClick={() => addField(f.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                          padding: '6px 8px', borderRadius: 6, cursor: 'grab',
                          background: 'transparent', color: 'var(--tx)', fontSize: 11,
                          fontFamily: 'inherit', transition: 'all .12s', textAlign: 'left',
                          userSelect: 'none',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--sf2)'; e.currentTarget.style.transform = 'translateX(2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'translateX(0)'; }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--tx3)', opacity: .5 }}>drag_indicator</span>
                        <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--ac)' }}>{f.icon}</span>
                        <span>{t(f.labelKey)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Center — Form canvas */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid var(--bd)',
              display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
            }}>
              <IconPicker value={selected.icon || 'task_alt'} onChange={updateSelectedTypeIcon} size={20} />
              {renamingType ? (
                <input value={renameValue} onChange={e => setRenameValue(e.target.value)} autoFocus
                  onBlur={renameSelectedType}
                  onKeyDown={e => { if (e.key === 'Enter') renameSelectedType(); if (e.key === 'Escape') setRenamingType(false); }}
                  style={{
                    fontSize: 18, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif",
                    background: 'var(--sf2)', border: '1px solid var(--ac)', borderRadius: 6,
                    color: 'var(--tx)', padding: '4px 8px', outline: 'none',
                  }} />
              ) : (
                <h2 onClick={() => { setRenameValue(selected.name); setRenamingType(true); }}
                  title={t('vectorLogic.clickToRename')}
                  style={{
                    fontSize: 18, fontWeight: 700, color: 'var(--tx)', margin: 0,
                    fontFamily: "'Space Grotesk',sans-serif", cursor: 'pointer',
                    padding: '4px 8px', borderRadius: 6, transition: 'background .12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--sf2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {selected.name}
                </h2>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                {saved && <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>✓ {t('admin.envSaved')}</span>}
                <button onClick={deleteSelectedType} style={btnStyle('danger')}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                </button>
                <button onClick={saveSchema} disabled={saving} style={btnStyle('primary')}>
                  {saving ? t('common.loading') : t('vectorLogic.saveSchema')}
                </button>
              </div>
            </div>

            <div
              style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}
              onDragOver={(e) => {
                if ((draggingLibField || draggingFieldId) && fields.length === 0) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = draggingLibField ? 'copy' : 'move';
                }
              }}
              onDrop={(e) => {
                if (fields.length === 0 && draggingLibField) {
                  e.preventDefault();
                  addField(draggingLibField, 0);
                  setDraggingLibField(null);
                }
              }}>
              {fields.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--tx3)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: .2, display: 'block', marginBottom: 12 }}>drag_indicator</span>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{t('vectorLogic.dropFieldHere')}</div>
                </div>
              )}
              {fields.map((field, i) => {
                const def = FIELD_TYPES.find(f => f.id === field.fieldType);
                const isSelected = selectedField?.id === field.id;
                const isDraggingThis = draggingFieldId === field.id;
                return (
                  <div key={field.id}>
                    {/* Insert indicator above this card */}
                    <div
                      onDragOver={(e) => {
                        if (draggingLibField || draggingFieldId) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = draggingLibField ? 'copy' : 'move';
                          if (dragOverIdx !== i) setDragOverIdx(i);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggingLibField) {
                          addField(draggingLibField, i);
                          setDraggingLibField(null);
                        } else if (draggingFieldId) {
                          moveFieldTo(draggingFieldId, i);
                          setDraggingFieldId(null);
                        }
                        setDragOverIdx(null);
                      }}
                      style={{
                        height: dragOverIdx === i ? 10 : 6,
                        margin: '2px 0',
                        background: dragOverIdx === i ? 'var(--ac)' : 'transparent',
                        borderRadius: 4,
                        transition: 'all .12s',
                      }}
                    />
                    <div
                      draggable
                      onDragStart={(e) => {
                        setDraggingFieldId(field.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', field.id);
                      }}
                      onDragEnd={() => { setDraggingFieldId(null); setDragOverIdx(null); }}
                      onClick={() => setSelectedField(field)}
                      style={{
                        background: isSelected ? 'rgba(79,110,247,.06)' : 'var(--sf2)',
                        border: `1px solid ${isSelected ? 'var(--ac)' : 'var(--bd)'}`,
                        borderRadius: 10, padding: '14px 16px',
                        cursor: isDraggingThis ? 'grabbing' : 'grab',
                        transition: 'all .15s',
                        opacity: isDraggingThis ? .4 : 1,
                      }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--tx3)', opacity: .5 }}>drag_indicator</span>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--ac)' }}>{def?.icon}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        background: 'rgba(79,110,247,.1)', color: 'var(--ac)',
                        letterSpacing: '.05em', textTransform: 'uppercase',
                      }}>{def ? t(def.labelKey) : field.fieldType}</span>
                      {field.required && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700 }}>{t('vectorLogic.badgeRequired')}</span>}
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        {field.showOnCreate && <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 3, background: 'rgba(62,207,142,.1)', color: 'var(--green)', fontWeight: 700 }}>{t('vectorLogic.badgeCreate')}</span>}
                        {field.showOnDetail && <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 3, background: 'rgba(79,110,247,.1)', color: 'var(--ac)', fontWeight: 700 }}>{t('vectorLogic.badgeDetail')}</span>}
                      </div>
                      <button onClick={e => { e.stopPropagation(); removeField(field.id); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', opacity: .5 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                      </button>
                    </div>
                    <div style={{ paddingLeft: 60 }}>
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
                  </div>
                );
              })}
              {/* Trailing drop zone — appends at end */}
              {fields.length > 0 && (
                <div
                  onDragOver={(e) => {
                    if (draggingLibField || draggingFieldId) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = draggingLibField ? 'copy' : 'move';
                      if (dragOverIdx !== fields.length) setDragOverIdx(fields.length);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggingLibField) {
                      addField(draggingLibField, fields.length);
                      setDraggingLibField(null);
                    } else if (draggingFieldId) {
                      moveFieldTo(draggingFieldId, fields.length);
                      setDraggingFieldId(null);
                    }
                    setDragOverIdx(null);
                  }}
                  style={{
                    height: dragOverIdx === fields.length ? 40 : 24,
                    marginTop: 4,
                    borderRadius: 6,
                    border: `2px dashed ${dragOverIdx === fields.length ? 'var(--ac)' : 'transparent'}`,
                    transition: 'all .15s',
                  }}
                />
              )}
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
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--tx3)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 56, opacity: .2, marginBottom: 12 }}>category</span>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{t('vectorLogic.noTaskTypeSelected')}</div>
          <button onClick={() => setShowNewType(true)} style={{ ...btnStyle('primary'), marginTop: 16 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            {t('vectorLogic.newTaskType')}
          </button>
        </div>
      )}

      {/* New task type modal */}
      {showNewType && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)',
        }} onClick={e => e.target === e.currentTarget && setShowNewType(false)}>
          <div style={{
            background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 16,
            width: '100%', maxWidth: 440, padding: 24, boxShadow: '0 24px 80px rgba(0,0,0,.6)',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx)', margin: '0 0 18px' }}>
              {t('vectorLogic.newTaskType')}
            </h3>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
              <div>
                <label style={lblStyle}>{t('vectorLogic.icon')}</label>
                <IconPicker value={newTypeIcon} onChange={setNewTypeIcon} size={28} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={lblStyle}>{t('common.name')}</label>
                <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)} autoFocus
                  placeholder={t('vectorLogic.placeholderBugFeature')}
                  onKeyDown={e => { if (e.key === 'Enter') createTaskType(); }}
                  style={inpStyle()} />
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--tx3)', lineHeight: 1.5, marginBottom: 16 }}>
              {t('vectorLogic.newTaskTypeHint')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={btnStyle('ghost')} onClick={() => setShowNewType(false)}>{t('common.cancel')}</button>
              <button style={btnStyle('primary')} onClick={createTaskType}>{t('common.create')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Field Settings Panel ─────────────────────────────────────────────── */
function FieldSettingsPanel({ field, onUpdate }: { field: SchemaField; onUpdate: (patch: Partial<SchemaField>) => void }) {
  const { t } = useTranslation();

  const supportsOptions = ['single_select', 'multi_select', 'radio_group'].includes(field.fieldType);
  const supportsRequired = !['title'].includes(field.fieldType);
  const supportsVisibility = !['title'].includes(field.fieldType);

  return (
    <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1 }}>
      <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
        {t('vectorLogic.fieldSettings')}
      </h3>

      <div>
        <label style={lblStyle}>{t('vectorLogic.fieldLabel')}</label>
        <input value={field.label} onChange={e => onUpdate({ label: e.target.value })} style={inpStyle()} />
      </div>

      {supportsVisibility && (
        <div>
          <label style={{ ...lblStyle, marginBottom: 10 }}>{t('vectorLogic.displayLogic')}</label>
          <ToggleRow label={t('vectorLogic.showOnCreate')} value={field.showOnCreate}
            onChange={v => onUpdate({ showOnCreate: v })} color="var(--green)" />
          <ToggleRow label={t('vectorLogic.showOnDetail')} value={field.showOnDetail}
            onChange={v => onUpdate({ showOnDetail: v })} color="var(--ac)" />
        </div>
      )}

      {supportsRequired && (
        <div>
          <label style={lblStyle}>{t('vectorLogic.validation')}</label>
          <ToggleRow label={t('vectorLogic.requiredField')} value={field.required}
            onChange={v => onUpdate({ required: v })} color="var(--red)" />
        </div>
      )}

      {supportsOptions && (
        <div>
          <label style={lblStyle}>{t('vectorLogic.options')}</label>
          {(field.options ?? []).map((opt, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <input value={opt}
                onChange={e => {
                  const newOpts = [...(field.options ?? [])];
                  newOpts[i] = e.target.value;
                  onUpdate({ options: newOpts });
                }}
                style={{ ...inpStyle(), fontSize: 11 }} />
              <button onClick={() => onUpdate({ options: (field.options ?? []).filter((_, j) => j !== i) })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 14 }}>×</button>
            </div>
          ))}
          <button onClick={() => onUpdate({ options: [...(field.options ?? []), `${t('vectorLogic.defaultOption')} ${(field.options?.length || 0) + 1}`] })}
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

function ToggleRow({ label, value, onChange, color }: { label: string; value: boolean; onChange: (v: boolean) => void; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ fontSize: 12, color: 'var(--tx)' }}>{label}</span>
      <button onClick={() => onChange(!value)}
        style={{
          width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
          background: value ? color : 'var(--sf3)', position: 'relative', transition: 'background .2s',
        }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 3, left: value ? 19 : 3, transition: 'left .2s',
        }} />
      </button>
    </div>
  );
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
  width: '100%', padding: '7px 10px', fontSize: 12, fontFamily: 'inherit',
  background: 'var(--sf2)', border: '1px solid var(--bd)',
  borderRadius: 6, color: 'var(--tx)', outline: 'none', ...extra,
});

const lblStyle = {
  fontSize: 10, fontWeight: 700, color: 'var(--tx3)',
  textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5,
};
