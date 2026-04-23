// @ts-nocheck
import { useMemo, useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { TaskType } from '../../domain/entities/TaskType';

interface SchemaField {
  id: string;
  label: string;
  fieldType: string;
}

interface Props {
  current: TaskType;
  types: TaskType[];
  /** Current task data — used to build the field mapping dialog. */
  data: Record<string, unknown>;
  onSwitch: (newTypeId: string, mapping: Record<string, string | null>) => void;
}

/**
 * Dropdown that lets the user change a task's type.
 *
 * If the target type's schema differs from the current one, a field-mapping
 * dialog opens so the user can map or delete orphaned values before the
 * type change is committed. The actual type switch is the parent's
 * responsibility (via the `onSwitch` callback).
 */
export function TaskTypeSwitcher({ current, types, data, onSwitch }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<TaskType | null>(null);

  const currentSchema = (current.schema as SchemaField[]) ?? [];

  const onPick = (next: TaskType) => {
    setOpen(false);
    if (next.id === current.id) return;

    const nextSchema = (next.schema as SchemaField[]) ?? [];
    const nextIds = new Set(nextSchema.map((f) => f.id));
    const orphaned = currentSchema.filter((f) => !nextIds.has(f.id) && data[f.id] !== undefined);

    if (orphaned.length === 0) {
      // Schemas are compatible — switch immediately with empty mapping.
      onSwitch(next.id, {});
      return;
    }

    setTarget(next);
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 8, fontFamily: 'inherit',
          background: 'var(--sf2)', border: '1px solid var(--bd)',
          color: 'var(--tx)', cursor: 'pointer', fontSize: 12,
        }}
        title={t('vectorLogic.changeTaskType')}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          {current.icon || 'task_alt'}
        </span>
        <span style={{ fontWeight: 600 }}>{current.name}</span>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--tx3)' }}>
          keyboard_arrow_down
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 100,
          width: 200, background: 'var(--sf2)', border: '1px solid var(--bd)',
          borderRadius: 10, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,.4)',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {types.map((tt) => {
            const isCurrent = tt.id === current.id;
            return (
              <button key={tt.id} onClick={() => onPick(tt)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 6, background: isCurrent ? 'var(--ac-dim)' : 'transparent',
                border: 'none', fontFamily: 'inherit', fontSize: 12, color: 'var(--tx)', cursor: 'pointer',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {tt.icon || 'task_alt'}
                </span>
                <span style={{ flex: 1, textAlign: 'left', fontWeight: isCurrent ? 600 : 400 }}>{tt.name}</span>
                {isCurrent && (
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--ac)' }}>check</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {target && (
        <FieldMappingDialog
          currentSchema={currentSchema}
          targetSchema={(target.schema as SchemaField[]) ?? []}
          data={data}
          onCancel={() => setTarget(null)}
          onConfirm={(mapping) => { onSwitch(target.id, mapping); setTarget(null); }}
        />
      )}
    </>
  );
}

function FieldMappingDialog({
  currentSchema, targetSchema, data, onCancel, onConfirm,
}: {
  currentSchema: SchemaField[];
  targetSchema: SchemaField[];
  data: Record<string, unknown>;
  onCancel: () => void;
  onConfirm: (mapping: Record<string, string | null>) => void;
}) {
  const { t } = useTranslation();
  const targetIds = useMemo(() => new Set(targetSchema.map((f) => f.id)), [targetSchema]);
  const orphaned = currentSchema.filter((f) => !targetIds.has(f.id) && data[f.id] !== undefined);
  const [mapping, setMapping] = useState<Record<string, string | null>>(
    Object.fromEntries(orphaned.map((f) => [f.id, null])),
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
      background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(2px)',
    }} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div style={{
        background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 16,
        width: '100%', maxWidth: 560, padding: 20, display: 'flex',
        flexDirection: 'column', gap: 14,
      }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)', margin: 0 }}>
            {t('vectorLogic.mapFieldsTitle')}
          </h3>
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>
            {t('vectorLogic.mapFieldsDesc')}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orphaned.map((f) => (
            <div key={f.id} style={{
              display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8,
              alignItems: 'center', padding: 10, background: 'var(--sf2)', borderRadius: 8,
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx)' }}>{f.label}</div>
                <div style={{ fontSize: 10, color: 'var(--tx3)' }}>
                  {String(data[f.id] ?? '').slice(0, 60)}
                </div>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--tx3)' }}>
                arrow_forward
              </span>
              <select
                value={mapping[f.id] ?? ''}
                onChange={(e) => setMapping((m) => ({ ...m, [f.id]: e.target.value || null }))}
                style={{
                  padding: '6px 8px', fontSize: 11, fontFamily: 'inherit',
                  background: 'var(--bg)', border: '1px solid var(--bd)',
                  borderRadius: 6, color: 'var(--tx)',
                }}
              >
                <option value="">— {t('vectorLogic.deleteValue')} —</option>
                {targetSchema.map((tf) => (
                  <option key={tf.id} value={tf.id}>{tf.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', border: '1px solid var(--bd)', fontFamily: 'inherit',
            background: 'var(--sf2)', color: 'var(--tx)',
          }}>
            {t('common.cancel')}
          </button>
          <button onClick={() => onConfirm(mapping)} style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', border: 'none', fontFamily: 'inherit',
            background: 'linear-gradient(135deg, var(--ac2), var(--ac))', color: 'var(--ac-on)',
          }}>
            {t('vectorLogic.applyMapping')}
          </button>
        </div>
      </div>
    </div>
  );
}
