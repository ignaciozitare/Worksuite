import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DualPanelItem {
  value: string;
  label: string;
  hint?: string;
}

export interface DualPanelPickerProps {
  /** Section label shown above the panels. */
  label: string;
  /** Full catalog of items (available + selected). */
  allItems: DualPanelItem[];
  /** Currently selected values. */
  selected: string[];
  /** Called when an item is moved to the "selected" panel. */
  onAdd: (value: string) => void;
  /** Called when an item is moved back to "available". */
  onRemove: (value: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Two-panel picker with drag-and-drop and click-to-move.
 * Left panel shows available items, right panel shows selected items.
 * Used for selecting Jira issue types, statuses, etc.
 */
export function DualPanelPicker({ label, allItems, selected, onAdd, onRemove }: DualPanelPickerProps) {
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [searchAvail, setSearchAvail] = useState('');
  const [searchSel, setSearchSel] = useState('');

  const available = allItems.filter(it => !selected.includes(it.value));
  const selectedItems = selected.map(v => allItems.find(it => it.value === v)).filter(Boolean) as DualPanelItem[];

  const filteredAvail = searchAvail
    ? available.filter(it => it.label.toLowerCase().includes(searchAvail.toLowerCase()))
    : available;
  const filteredSel = searchSel
    ? selectedItems.filter(it => it.label.toLowerCase().includes(searchSel.toLowerCase()))
    : selectedItems;

  const panelStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, background: 'var(--sf2,#1b1b22)', borderRadius: 8,
    border: '1px solid var(--bd,#2a2a38)', display: 'flex', flexDirection: 'column',
    maxHeight: 280, overflow: 'hidden',
  };
  const headerStyle: React.CSSProperties = {
    padding: '8px 10px', borderBottom: '1px solid var(--bd,#2a2a38)',
    fontSize: 11, fontWeight: 700, color: 'var(--tx3,#50506a)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
  };
  const listStyle: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: 4 };
  const itemBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
    borderRadius: 6, fontSize: 12, cursor: 'grab', transition: 'background .1s',
    fontFamily: 'inherit', border: 'none', width: '100%', textAlign: 'left',
  };
  const searchStyle: React.CSSProperties = {
    width: '100%', padding: '4px 8px', fontSize: 11, fontFamily: 'inherit',
    background: 'var(--sf,#141418)', border: '1px solid var(--bd,#2a2a38)',
    borderRadius: 4, color: 'var(--tx,#e4e4ef)', outline: 'none',
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx,#e4e4ef)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        {/* Available */}
        <div style={panelStyle}
          onDragOver={e => e.preventDefault()}
          onDrop={() => { if (dragItem && selected.includes(dragItem)) { onRemove(dragItem); setDragItem(null); } }}>
          <div style={headerStyle}>
            <span>Disponibles ({available.length})</span>
          </div>
          <div style={{ padding: '4px 6px', borderBottom: '1px solid var(--bd,#2a2a38)' }}>
            <input placeholder="Buscar…" value={searchAvail} onChange={e => setSearchAvail(e.target.value)} style={searchStyle} />
          </div>
          <div style={listStyle}>
            {filteredAvail.map(it => (
              <div key={it.value} draggable
                onDragStart={() => setDragItem(it.value)}
                onClick={() => onAdd(it.value)}
                style={{ ...itemBase, background: 'transparent', color: 'var(--tx,#e4e4ef)' }}
                onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = 'rgba(79,110,247,.08)')}
                onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = 'transparent')}>
                <span style={{ fontSize: 10, color: 'var(--tx3,#50506a)' }}>⠿</span>
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.hint && <span style={{ fontSize: 9, color: 'var(--tx3,#50506a)' }}>{it.hint}</span>}
                <span style={{ fontSize: 10, color: '#4f6ef7' }}>→</span>
              </div>
            ))}
            {filteredAvail.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--tx3,#50506a)', textAlign: 'center', padding: 12 }}>
                {available.length === 0 ? 'Todos seleccionados' : 'Sin resultados'}
              </div>
            )}
          </div>
        </div>

        {/* Selected */}
        <div style={{ ...panelStyle, borderColor: selected.length ? '#4f6ef7' : 'var(--bd,#2a2a38)' }}
          onDragOver={e => e.preventDefault()}
          onDrop={() => { if (dragItem && !selected.includes(dragItem)) { onAdd(dragItem); setDragItem(null); } }}>
          <div style={{ ...headerStyle, color: '#4f6ef7' }}>
            <span>Seleccionados ({selected.length})</span>
          </div>
          <div style={{ padding: '4px 6px', borderBottom: '1px solid var(--bd,#2a2a38)' }}>
            <input placeholder="Buscar…" value={searchSel} onChange={e => setSearchSel(e.target.value)} style={searchStyle} />
          </div>
          <div style={listStyle}>
            {filteredSel.map(it => (
              <div key={it.value} draggable
                onDragStart={() => setDragItem(it.value)}
                onClick={() => onRemove(it.value)}
                style={{ ...itemBase, background: 'rgba(79,110,247,.08)', color: 'var(--tx,#e4e4ef)' }}
                onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = 'rgba(239,68,68,.08)')}
                onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = 'rgba(79,110,247,.08)')}>
                <span style={{ fontSize: 10, color: 'var(--tx3,#50506a)' }}>⠿</span>
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.hint && <span style={{ fontSize: 9, color: 'var(--tx3,#50506a)' }}>{it.hint}</span>}
                <span style={{ fontSize: 10, color: '#ef4444' }}>←</span>
              </div>
            ))}
            {filteredSel.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--tx3,#50506a)', textAlign: 'center', padding: 12 }}>
                {selected.length === 0 ? 'Arrastra o haz click para añadir' : 'Sin resultados'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
