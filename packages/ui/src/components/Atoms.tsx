import type { CSSProperties, ReactNode } from 'react';

// ─── Avatar ───────────────────────────────────────────────────────────────────

interface AvatarProps {
  initials: string;
  color?:   string;
  size?:    number;
  name?:    string;   // tooltip
}

export function Avatar({ initials, color = 'var(--ws-accent)', size = 30, name }: AvatarProps) {
  const style: CSSProperties = {
    width:          size,
    height:         size,
    borderRadius:   '50%',
    background:     color,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    fontSize:       size * 0.34,
    fontWeight:     700,
    color:          '#fff',
    flexShrink:     0,
    userSelect:     'none',
  };
  return <div style={style} title={name}>{(initials || '?').slice(0, 2).toUpperCase()}</div>;
}

// ─── Badge ────────────────────────────────────────────────────────────────────

type BadgeColor = 'accent' | 'green' | 'red' | 'amber' | 'purple' | 'blue' | 'gray';

interface BadgeProps {
  children: ReactNode;
  color?:   BadgeColor;
}

const BADGE_VARS: Record<BadgeColor, [string, string]> = {
  accent: ['var(--ws-accent-bg)',  'var(--ws-accent)'],
  green:  ['var(--ws-green-bg)',   'var(--ws-green)'],
  red:    ['var(--ws-red-bg)',     'var(--ws-red)'],
  amber:  ['var(--ws-amber-bg)',   'var(--ws-amber)'],
  purple: ['var(--ws-purple-bg)',  'var(--ws-purple)'],
  blue:   ['var(--ws-blue-bg)',    'var(--ws-blue)'],
  gray:   ['rgba(100,116,139,.12)','var(--ws-text-3)'],
};

export function Badge({ children, color = 'gray' }: BadgeProps) {
  const [bg, fg] = BADGE_VARS[color];
  const style: CSSProperties = {
    display:      'inline-flex',
    alignItems:   'center',
    padding:      '2px 9px',
    borderRadius: 'var(--ws-radius-full)',
    fontSize:     'var(--ws-text-xs)',
    fontWeight:   600,
    background:   bg,
    color:        fg,
    whiteSpace:   'nowrap',
  };
  return <span style={style}>{children}</span>;
}

// ─── StatBox ──────────────────────────────────────────────────────────────────

interface StatBoxProps {
  label:  string;
  value:  number | string;
  color?: string;
  icon?:  ReactNode;
}

export function StatBox({ label, value, color = 'var(--ws-accent)', icon }: StatBoxProps) {
  return (
    <div style={{
      background:   'var(--ws-surface)',
      border:       '1px solid var(--ws-border)',
      borderRadius: 'var(--ws-radius-lg)',
      padding:      14,
      textAlign:    'center',
    }}>
      {icon && <div style={{ fontSize: 18, marginBottom: 6 }}>{icon}</div>}
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--ws-font-heading)', color }}>
        {value}
      </div>
      <div style={{ fontSize: 'var(--ws-text-xs)', color: 'var(--ws-text-3)', marginTop: 3 }}>
        {label}
      </div>
    </div>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export function Divider({ vertical = false }: { vertical?: boolean }) {
  return (
    <div style={vertical
      ? { width: 1, alignSelf: 'stretch', background: 'var(--ws-border)' }
      : { height: 1, background: 'var(--ws-border)', margin: '8px 0' }
    }/>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

export function Chip({ children, active = false, onClick }: {
  children: ReactNode;
  active?:  boolean;
  onClick?: () => void;
}) {
  return (
    <span
      onClick={onClick}
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          4,
        padding:      '3px 10px',
        borderRadius: 'var(--ws-radius-full)',
        fontSize:     'var(--ws-text-xs)',
        fontWeight:   600,
        background:   active ? 'var(--ws-accent-bg)' : 'var(--ws-surface-2)',
        color:        active ? 'var(--ws-accent)'    : 'var(--ws-text-3)',
        border:       `1px solid ${active ? 'rgba(99,102,241,.35)' : 'var(--ws-border)'}`,
        cursor:       onClick ? 'pointer' : 'default',
        transition:   'var(--ws-ease)',
        userSelect:   'none',
      }}
    >
      {children}
    </span>
  );
}
