import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@worksuite/i18n';

export interface CardMenuItem {
  id: string;
  labelKey: string;
  icon: string;
  /** Optional — when present, renders below other items separated by a hairline. */
  separated?: boolean;
  /** Optional danger styling (red text + red icon). */
  danger?: boolean;
  /** Hide the item entirely (e.g. role-gated "Configure" item). */
  hidden?: boolean;
  onClick: () => void;
}

interface Props {
  items: CardMenuItem[];
  /** When provided, the kebab button is hidden until the parent card is hovered.
   *  The parent supplies the hover state because hover lives at the card level.
   *  Ignored in `inline` mode — the button is always visible there. */
  showButton?: boolean;
  /** `corner` (default): pinned to top-right of the closest positioned ancestor
   *  with absolute positioning. `inline`: rendered as a normal inline-flex
   *  element, button always visible, dropdown still pops below it. */
  mode?: 'corner' | 'inline';
}

/**
 * Kebab (`⋮`) button + glassmorphic dropdown menu rendered absolutely in the
 * top-right corner of a card. Click on the kebab toggles the menu; click
 * outside or `Esc` closes it. Click on the kebab does not propagate, so the
 * parent card's onClick (which opens the TaskDetailModal) is not triggered.
 *
 * Visibility on desktop is driven by the parent card's hover state via
 * `showButton`. On touch we always show it dimly because there's no hover.
 */
export function CardMenu({ items, showButton = true, mode = 'corner' }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isInline = mode === 'inline';

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const visibleItems = items.filter(it => !it.hidden);
  if (visibleItems.length === 0) return null;

  return (
    <div
      ref={wrapRef}
      style={isInline
        ? { position: 'relative', display: 'inline-flex' }
        : { position: 'absolute', top: 6, right: 6, zIndex: 5 }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={t('vectorLogic.cardMenuAria')}
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        style={{
          width: isInline ? 32 : 24,
          height: isInline ? 32 : 24,
          borderRadius: 6,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: open ? 'var(--sf2)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: open ? 'var(--tx)' : 'var(--tx2)',
          opacity: isInline ? 1 : (showButton || open ? 1 : 0),
          transition: 'opacity .15s, background-color .15s',
          padding: 0,
          backdropFilter: 'blur(8px)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sf2)'; e.currentTarget.style.color = 'var(--tx)'; }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--tx2)';
          }
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-sm)' }}>more_vert</span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: isInline ? 36 : 28,
            right: 0,
            minWidth: 168,
            padding: 4,
            borderRadius: 10,
            background: 'var(--sf2)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 24px rgba(0,0,0,.28), 0 0 0 1px var(--bd)',
            display: 'flex', flexDirection: 'column', gap: 0,
            zIndex: 6,
          }}
        >
          {visibleItems.map((item, idx) => (
            <div key={item.id}>
              {item.separated && idx > 0 && (
                <div style={{ height: 1, background: 'var(--bd)', margin: '4px 6px' }} />
              )}
              <button
                role="menuitem"
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(false); item.onClick(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 10px',
                  border: 'none', background: 'transparent',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 'var(--fs-xs)',
                  fontWeight: 500,
                  color: item.danger ? 'var(--red)' : 'var(--tx)',
                  textAlign: 'left',
                  transition: 'background-color .12s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = item.danger ? 'var(--red-dim)' : 'var(--sf3)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 'var(--icon-sm)',
                    color: item.danger ? 'var(--red)' : 'var(--tx2)',
                  }}
                >
                  {item.icon}
                </span>
                {t(item.labelKey)}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
