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

  // Deduplicate items by value (Jira returns same type per project)
  const uniqueItems = (() => {
    const seen = new Set<string>();
    return allItems.filter(it => seen.has(it.value) ? false : (seen.add(it.value), true));
  })();

  const available = uniqueItems.filter(it => !selected.includes(it.value));
  const selectedItems = selected.map(v => uniqueItems.find(it => it.value === v)).filter(Boolean) as DualPanelItem[];

  const filteredAvail = searchAvail
    ? available.filter(it => it.label.toLowerCase().includes(searchAvail.toLowerCase()))
    : available;
  const filteredSel = searchSel
    ? selectedItems.filter(it => it.label.toLowerCase().includes(searchSel.toLowerCase()))
    : selectedItems;

  const panelStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, background: 'var(--sf2)', borderRadius: 8,
    border: '1px solid var(--bd)', display: 'flex', flexDirection: 'column',
    maxHeight: 280, overflow: 'hidden',
  };
  const headerStyle: React.CSSProperties = {
    padding: '8px 10px', borderBottom: '1px solid var(--bd)',
    fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--tx3)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
  };
  const listStyle: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: 4 };
  const itemBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
    borderRadius: 6, fontSize: 'var(--fs-xs)', cursor: 'grab', transition: 'background .1s',
    fontFamily: 'inherit', border: 'none', width: '100%', textAlign: 'left',
  };
  const searchStyle: React.CSSProperties = {
    width: '100%', padding: '4px 8px', fontSize: 'var(--fs-2xs)', fontFamily: 'inherit',
    background: 'var(--sf)', border: '1px solid var(--bd)',
    borderRadius: 4, color: 'var(--tx)', outline: 'none',
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--tx)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        {/* Available */}
        <div style={panelStyle}
          onDragOver={e => e.preventDefault()}
          onDrop={() => { if (dragItem && selected.includes(dragItem)) { onRemove(dragItem); setDragItem(null); } }}>
          <div style={headerStyle}>
            <span>Disponibles ({available.length})</span>
          </div>
          <div style={{ padding: '4px 6px', borderBottom: '1px solid var(--bd)' }}>
            <input placeholder="Buscar…" value={searchAvail} onChange={e => setSearchAvail(e.target.value)} style={searchStyle} />
          </div>
          <div style={listStyle}>
            {filteredAvail.map(it => (
              <div key={it.value} draggable
                onDragStart={() => setDragItem(it.value)}
                onClick={() => onAdd(it.value)}
                style={{ ...itemBase, background: 'transparent', color: 'var(--tx)' }}
                onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = 'rgba(79,110,247,.08)')}
                onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = 'transparent')}>
                <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>⠿</span>
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.hint && <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>{it.hint}</span>}
                <span style={{ fontSize: 'var(--fs-2xs)', color: '#4f6ef7' }}>→</span>
              </div>
            ))}
            {filteredAvail.length === 0 && (
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)', textAlign: 'center', padding: 12 }}>
                {available.length === 0 ? 'Todos seleccionados' : 'Sin resultados'}
              </div>
            )}
          </div>
        </div>

        {/* Selected */}
        <div style={{ ...panelStyle, borderColor: selected.length ? '#4f6ef7' : 'var(--bd)' }}
          onDragOver={e => e.preventDefault()}
          onDrop={() => { if (dragItem && !selected.includes(dragItem)) { onAdd(dragItem); setDragItem(null); } }}>
          <div style={{ ...headerStyle, color: '#4f6ef7' }}>
            <span>Seleccionados ({selected.length})</span>
          </div>
          <div style={{ padding: '4px 6px', borderBottom: '1px solid var(--bd)' }}>
            <input placeholder="Buscar…" value={searchSel} onChange={e => setSearchSel(e.target.value)} style={searchStyle} />
          </div>
          <div style={listStyle}>
            {filteredSel.map(it => (
              <div key={it.value} draggable
                onDragStart={() => setDragItem(it.value)}
                onClick={() => onRemove(it.value)}
                style={{ ...itemBase, background: 'rgba(79,110,247,.08)', color: 'var(--tx)' }}
                onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = 'rgba(239,68,68,.08)')}
                onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = 'rgba(79,110,247,.08)')}>
                <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>⠿</span>
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.hint && <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>{it.hint}</span>}
                <span style={{ fontSize: 'var(--fs-2xs)', color: '#ef4444' }}>←</span>
              </div>
            ))}
            {filteredSel.length === 0 && (
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)', textAlign: 'center', padding: 12 }}>
                {selected.length === 0 ? 'Arrastra o haz click para añadir' : 'Sin resultados'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
