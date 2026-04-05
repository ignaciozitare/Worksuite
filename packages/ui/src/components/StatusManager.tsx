import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StatusItem {
  id:              string;
  name:            string;
  color:           string;
  bg_color:        string;
  border:          string;
  ord:             number;
  status_category: string;
}

export interface StatusCategoryOption {
  value: string;
  label: string;
}

export interface StatusManagerProps {
  /** Ordered list of statuses (already sorted by `ord`). */
  statuses: StatusItem[];
  /** Allowed categories for the dropdown. */
  categories: StatusCategoryOption[];
  /** Default category assigned to new statuses. */
  defaultCategory: string;
  /** Labels (for i18n) — consumer passes localized strings. */
  labels: {
    title?:        string;
    hint?:         string;
    newStatus?:    string;
    name?:         string;
    color?:        string;
    add?:          string;
    placeholder?:  string;
  };
  /** Persistence callbacks — consumer decides transport/storage. */
  onCreate:  (draft: Omit<StatusItem, 'id' | 'ord'>) => Promise<StatusItem>;
  onUpdate:  (id: string, patch: Partial<StatusItem>) => Promise<void>;
  onDelete:  (id: string) => Promise<void>;
  onReorder: (items: { id: string; ord: number }[]) => Promise<void>;
  /** Called after any mutation so the parent can refresh its copy. */
  onChange:  (next: StatusItem[]) => void;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function hexToBg(hex: string): string {
  return hex + '20';
}
function hexToBorder(hex: string): string {
  return hex + '66';
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Generic status editor: drag-to-reorder list, inline edit, CRUD and
 * a "new status" row at the bottom. Presentational only — all persistence
 * is delegated via callbacks.
 *
 * Used by any module that needs admin-configurable states (release lifecycle,
 * reservation lifecycle, ticket workflows, …).
 */
export function StatusManager({
  statuses,
  categories,
  defaultCategory,
  labels,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
  onChange,
}: StatusManagerProps) {
  const [editing, setEditing]   = useState<StatusItem | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [newName, setNewName]   = useState('');
  const [newColor, setNewColor] = useState('#6b7280');
  const [newCat, setNewCat]     = useState(defaultCategory);

  const add = async () => {
    if (!newName.trim()) return;
    const hex = newColor;
    const created = await onCreate({
      name: newName.trim(),
      color: hex,
      bg_color: hexToBg(hex),
      border: hexToBorder(hex),
      status_category: newCat,
    });
    onChange([...statuses, created]);
    setNewName('');
    setNewColor('#6b7280');
    setNewCat(defaultCategory);
  };

  const save = async (st: StatusItem) => {
    const hex = st.color;
    const patch: Partial<StatusItem> = {
      name: st.name,
      color: hex,
      bg_color: hexToBg(hex),
      border: hexToBorder(hex),
      status_category: st.status_category,
    };
    await onUpdate(st.id, patch);
    onChange(statuses.map(x => x.id === st.id ? { ...x, ...patch } : x));
    setEditing(null);
  };

  const del = async (id: string) => {
    await onDelete(id);
    onChange(statuses.filter(s => s.id !== id));
  };

  const onDragEnd = async () => {
    if (dragging === null || dragOver === null || dragging === dragOver) {
      setDragging(null); setDragOver(null);
      return;
    }
    const next = [...statuses];
    const [moved] = next.splice(dragging, 1);
    next.splice(dragOver, 0, moved);
    const updated = next.map((s, i) => ({ ...s, ord: i }));
    onChange(updated);
    setDragging(null); setDragOver(null);
    await onReorder(updated.map(s => ({ id: s.id, ord: s.ord })));
  };

  return (
    <div>
      {labels.title && (
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx,#e4e4ef)', marginBottom: 6 }}>
          {labels.title}
        </div>
      )}
      {labels.hint && (
        <div style={{ fontSize: 11, color: 'var(--tx3,#50506a)', marginBottom: 14 }}>
          {labels.hint}
        </div>
      )}

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {statuses.map((st, i) => (
          <div key={st.id}
            draggable
            onDragStart={() => setDragging(i)}
            onDragOver={e => { e.preventDefault(); setDragOver(i); }}
            onDragEnd={onDragEnd}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
              background: dragOver === i ? 'var(--glow,rgba(79,110,247,.12))' : 'var(--sf2,#1b1b22)',
              borderRadius: 8,
              border: `1px solid ${dragOver === i ? 'var(--ac,#4f6ef7)' : 'var(--bd,#2a2a38)'}`,
              cursor: 'grab', transition: 'background .1s',
            }}>
            <span style={{ color: 'var(--tx3,#50506a)', fontSize: 12, cursor: 'grab' }}>⠿</span>
            <div style={{
              width: 14, height: 14, borderRadius: 3, background: st.color, flexShrink: 0,
              border: `1px solid ${st.color}66`,
            }} />

            {editing?.id === st.id ? (
              <>
                <input
                  value={editing.name}
                  onChange={e => setEditing(v => v ? { ...v, name: e.target.value } : v)}
                  style={{
                    flex: 1, background: 'var(--sf,#141418)', border: '1px solid var(--ac,#4f6ef7)',
                    borderRadius: 4, padding: '3px 7px', fontSize: 12, color: 'var(--tx,#e4e4ef)',
                    fontFamily: 'inherit', outline: 'none',
                  }}
                />
                <input
                  type="color"
                  value={editing.color}
                  onChange={e => setEditing(v => v ? { ...v, color: e.target.value } : v)}
                  style={{ width: 28, height: 24, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                />
                <select
                  value={editing.status_category}
                  onChange={e => setEditing(v => v ? { ...v, status_category: e.target.value } : v)}
                  style={{
                    background: 'var(--sf2,#1b1b22)', border: '1px solid var(--bd,#2a2a38)', borderRadius: 4,
                    padding: '2px 6px', fontSize: 10, color: 'var(--tx,#e4e4ef)', fontFamily: 'inherit',
                  }}>
                  {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <button onClick={() => save(editing)}
                  style={{
                    background: 'var(--ac,#4f6ef7)', color: '#fff', border: 'none', borderRadius: 4,
                    padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  }}>✓</button>
                <button onClick={() => setEditing(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--tx3,#50506a)', cursor: 'pointer', fontSize: 13 }}>×</button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--tx,#e4e4ef)' }}>{st.name}</span>
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 20,
                  background: st.bg_color, color: st.color, border: `1px solid ${st.border}`, flexShrink: 0,
                }}>{st.name}</span>
                <span style={{
                  fontSize: 9, color: 'var(--tx3,#50506a)', background: 'var(--sf,#141418)',
                  border: '1px solid var(--bd,#2a2a38)', borderRadius: 10, padding: '1px 6px', flexShrink: 0,
                }}>{st.status_category}</span>
                <button onClick={() => setEditing({ ...st })}
                  style={{ background: 'none', border: 'none', color: 'var(--tx3,#50506a)', cursor: 'pointer', fontSize: 13 }}>✎</button>
                <button onClick={() => del(st.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--red,#e05252)', cursor: 'pointer', fontSize: 14 }}>×</button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* New status row */}
      <div style={{ padding: '12px 14px', background: 'var(--sf2,#1b1b22)', borderRadius: 8, border: '1px dashed var(--bd,#2a2a38)' }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: 'var(--tx3,#50506a)', marginBottom: 8,
          textTransform: 'uppercase', letterSpacing: '.08em',
        }}>{labels.newStatus ?? 'New status'}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder={labels.placeholder ?? 'Status name'}
            style={{
              flex: 2, minWidth: 130, background: 'var(--sf,#141418)', border: '1px solid var(--bd,#2a2a38)',
              borderRadius: 5, padding: '6px 10px', color: 'var(--tx,#e4e4ef)', fontSize: 12,
              fontFamily: 'inherit', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <label style={{ fontSize: 11, color: 'var(--tx3,#50506a)' }}>{labels.color ?? 'Color'}</label>
            <input type="color" value={newColor}
              onChange={e => setNewColor(e.target.value)}
              style={{ width: 32, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
            />
          </div>
          <select value={newCat} onChange={e => setNewCat(e.target.value)}
            style={{
              background: 'var(--sf,#141418)', border: '1px solid var(--bd,#2a2a38)', borderRadius: 4,
              padding: '4px 8px', fontSize: 10, color: 'var(--tx,#e4e4ef)', fontFamily: 'inherit',
            }}>
            {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <button onClick={add}
            style={{
              background: 'var(--ac,#4f6ef7)', color: '#fff', border: 'none', borderRadius: 5,
              padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            + {labels.add ?? 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
