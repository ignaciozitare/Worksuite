import type { CSSProperties, ReactNode } from 'react';

// ─── Avatar ───────────────────────────────────────────────────────────────────

interface AvatarProps {
  initials: string;
  color?:   string;
  size?:    number;
  name?:    string;
}

export function Avatar({ initials, color = 'var(--ac)', size = 30, name }: AvatarProps) {
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
type BadgeVariant = 'pill' | 'compact';

interface BadgeProps {
  children: ReactNode;
  color?:   BadgeColor;
  variant?: BadgeVariant;
  style?:   CSSProperties;
}

const BADGE_VARS: Record<BadgeColor, [string, string]> = {
  accent: ['var(--ac-dim)',              'var(--ac2)'],
  green:  ['var(--green-dim)',           'var(--green)'],
  red:    ['var(--red-dim)',             'var(--red)'],
  amber:  ['var(--amber-dim)',           'var(--amber)'],
  purple: ['var(--purple-dim)',          'var(--purple)'],
  blue:   ['rgba(79,110,247,.12)',       'var(--ac)'],
  gray:   ['rgba(100,116,139,.12)',      'var(--tx3)'],
};

const BADGE_VARIANT: Record<BadgeVariant, CSSProperties> = {
  pill:    { padding: '2px 9px', borderRadius: 20, fontSize: 10 },
  compact: { padding: '1px 6px', borderRadius: 4,  fontSize: 9  },
};

export function Badge({ children, color = 'gray', variant = 'pill', style: styleProp }: BadgeProps) {
  const [bg, fg] = BADGE_VARS[color];
  const style: CSSProperties = {
    display:      'inline-flex',
    alignItems:   'center',
    fontWeight:   600,
    background:   bg,
    color:        fg,
    whiteSpace:   'nowrap',
    ...BADGE_VARIANT[variant],
    ...styleProp,
  };
  return <span style={style}>{children}</span>;
}

// ─── StatBox ──────────────────────────────────────────────────────────────────

interface StatBoxProps {
  label:  string;
  value:  number | string;
  color?: string;
  icon?:  ReactNode;
  style?:     CSSProperties;
  className?: string;
}

export function StatBox({ label, value, color = 'var(--ac)', icon, style: styleProp, className }: StatBoxProps) {
  return (
    <div className={className} style={{
      background:   'var(--sf)',
      border:       '1px solid var(--bd)',
      borderRadius: 'var(--r2)',
      padding:      14,
      textAlign:    'center',
      '--accent':   color,
      ...styleProp,
    } as CSSProperties}>
      {icon && <div style={{ fontSize: 18, marginBottom: 6 }}>{icon}</div>}
      <div style={{ fontSize: 26, fontWeight: 700, color }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 3 }}>
        {label}
      </div>
    </div>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export function Divider({ vertical = false }: { vertical?: boolean }) {
  return (
    <div style={vertical
      ? { width: 1, alignSelf: 'stretch', background: 'var(--bd)' }
      : { height: 1, background: 'var(--bd)', margin: '8px 0' }
    }/>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

export function Chip({ children, active = false, onClick, style: styleProp }: {
  children: ReactNode;
  active?:  boolean;
  onClick?: () => void;
  style?:   CSSProperties;
}) {
  return (
    <span
      onClick={onClick}
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          4,
        padding:      '3px 10px',
        borderRadius: 20,
        fontSize:     10,
        fontWeight:   600,
        background:   active ? 'var(--glow)' : 'var(--sf2)',
        color:        active ? 'var(--ac2)' : 'var(--tx3)',
        border:       `1px solid ${active ? 'rgba(79,110,247,.35)' : 'var(--bd)'}`,
        cursor:       onClick ? 'pointer' : 'default',
        transition:   'var(--ease)',
        userSelect:   'none',
        ...styleProp,
      }}
    >
      {children}
    </span>
  );
}
