import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export interface MultiSelectDropdownItem {
  id: string;
  label: string;
  icon?: string;
  iconColor?: string;
}

export interface MultiSelectDropdownProps {
  items: MultiSelectDropdownItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;

  triggerLabel: string;
  triggerIcon?: string;
  triggerIconColor?: string;

  searchable?: boolean;
  searchPlaceholder?: string;

  maxSelections?: number;
  maxReachedTooltip?: string;

  emptyText?: string;
  noMatchesText?: string;

  panelWidth?: number;
  align?: 'left' | 'right';
  buttonStyle?: CSSProperties;
}

export function MultiSelectDropdown({
  items,
  selectedIds,
  onToggle,
  triggerLabel,
  triggerIcon,
  triggerIconColor,
  searchable = false,
  searchPlaceholder,
  maxSelections,
  maxReachedTooltip,
  emptyText,
  noMatchesText,
  panelWidth = 260,
  align = 'right',
  buttonStyle,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const counter = `${selectedIds.length}${maxSelections != null ? `/${maxSelections}` : ''}`;
  const limitReached = maxSelections != null && selectedIds.length >= maxSelections;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it => it.label.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    if (searchable) requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.removeEventListener('keydown', onKey);
  }, [open, searchable]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 8, fontFamily: 'inherit',
          background: 'var(--sf2)', border: '1px solid var(--bd)',
          color: 'var(--tx)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          ...buttonStyle,
        }}
      >
        {triggerIcon && (
          <span className="material-symbols-outlined" style={{
            fontSize: 14, color: triggerIconColor || 'var(--ac)',
          }}>{triggerIcon}</span>
        )}
        <span>{triggerLabel}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
          background: 'var(--sf3)', color: 'var(--tx2)',
          fontFamily: "'Space Grotesk',sans-serif",
        }}>{counter}</span>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--tx3)' }}>
          keyboard_arrow_down
        </span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />
          <div
            role="listbox"
            style={{
              position: 'absolute', top: '100%', marginTop: 6, zIndex: 101,
              [align === 'right' ? 'right' : 'left']: 0,
              width: panelWidth, maxHeight: 360,
              background: 'var(--sf)', border: '1px solid var(--bd)',
              borderRadius: 10, padding: 6,
              boxShadow: '0 12px 32px rgba(0,0,0,.45)',
              backdropFilter: 'blur(12px)',
              display: 'flex', flexDirection: 'column', gap: 4,
            } as CSSProperties}
          >
            {searchable && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 8px', background: 'var(--sf2)',
                borderRadius: 6, marginBottom: 2,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--tx3)' }}>search</span>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: 'var(--tx)', fontSize: 12, fontFamily: 'inherit',
                  }}
                />
              </div>
            )}

            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {items.length === 0 ? (
                <EmptyRow text={emptyText} />
              ) : filtered.length === 0 ? (
                <EmptyRow text={noMatchesText} />
              ) : (
                filtered.map(it => {
                  const checked = selectedSet.has(it.id);
                  const disabled = !checked && limitReached;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => { if (!disabled) onToggle(it.id); }}
                      disabled={disabled}
                      title={disabled ? maxReachedTooltip : undefined}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 10px', borderRadius: 6,
                        background: checked ? 'var(--ac-dim)' : 'transparent',
                        border: 'none', fontFamily: 'inherit', fontSize: 12,
                        color: 'var(--tx)', textAlign: 'left',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.4 : 1,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{
                        fontSize: 14, color: checked ? 'var(--ac)' : 'var(--tx3)',
                      }}>
                        {checked ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                      {it.icon && (
                        <span className="material-symbols-outlined" style={{
                          fontSize: 14, color: it.iconColor || 'var(--tx2)',
                        }}>{it.icon}</span>
                      )}
                      <span style={{ flex: 1, fontWeight: checked ? 600 : 400 }}>{it.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyRow({ text }: { text?: ReactNode }) {
  if (!text) return null;
  return (
    <div style={{
      padding: '10px 12px', fontSize: 11, color: 'var(--tx3)', textAlign: 'center',
    }}>{text}</div>
  );
}
