import type { CSSProperties, ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TimelineItemStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface TimelineItem {
  id:          string;
  title:       string;
  description?: string;
  status:      TimelineItemStatus;
  date?:       string;      // ISO string
  badge?:      string;      // e.g. "v1.4.2", "PROD"
  meta?:       string;      // e.g. assignee, duration
  children?:   ReactNode;  // slot for extra content
}

interface TimelineProps {
  items:     TimelineItem[];
  /** Show connector line between items */
  connected?: boolean;
  /** Compact mode — less spacing */
  compact?:   boolean;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TimelineItemStatus, {
  icon:    string;
  color:   string;
  bg:      string;
  border:  string;
  label:   string;
}> = {
  pending: {
    icon: '○', color: 'var(--ws-text-3)', bg: 'var(--ws-surface-2)',
    border: 'var(--ws-border)', label: 'Pendiente',
  },
  running: {
    icon: '▶', color: 'var(--ws-deploy)', bg: 'var(--ws-deploy-bg)',
    border: 'rgba(245,158,11,.35)', label: 'En progreso',
  },
  done: {
    icon: '✓', color: 'var(--ws-green)', bg: 'var(--ws-green-bg)',
    border: 'rgba(74,222,128,.35)', label: 'Completado',
  },
  failed: {
    icon: '✕', color: 'var(--ws-red)', bg: 'var(--ws-red-bg)',
    border: 'rgba(248,113,113,.35)', label: 'Fallido',
  },
  cancelled: {
    icon: '—', color: 'var(--ws-text-3)', bg: 'var(--ws-surface-2)',
    border: 'var(--ws-border)', label: 'Cancelado',
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function TimelineDot({ status }: { status: TimelineItemStatus }) {
  const cfg = STATUS_CONFIG[status];
  const dotStyle: CSSProperties = {
    width:          28,
    height:         28,
    borderRadius:   '50%',
    background:     cfg.bg,
    border:         `1px solid ${cfg.border}`,
    color:          cfg.color,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    fontSize:       12,
    fontWeight:     700,
    flexShrink:     0,
    zIndex:         1,
    position:       'relative',
  };
  return <div style={dotStyle} title={cfg.label}>{cfg.icon}</div>;
}

function TimelineConnector({ status }: { status: TimelineItemStatus }) {
  const isDone = status === 'done';
  return (
    <div style={{
      width:      2,
      flex:       1,
      minHeight:  20,
      marginLeft: 13,
      background: isDone ? 'var(--ws-green-bg)' : 'var(--ws-border)',
      borderRadius: 1,
    }}/>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Timeline({ items, connected = true, compact = false }: TimelineProps) {
  if (!items.length) return null;

  const vGap = compact ? 8 : 14;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {items.map((item, idx) => {
        const cfg = STATUS_CONFIG[item.status];
        const isLast = idx === items.length - 1;

        return (
          <div key={item.id} style={{ display: 'flex', gap: 12 }}>
            {/* Left: dot + connector */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <TimelineDot status={item.status} />
              {connected && !isLast && <TimelineConnector status={item.status} />}
            </div>

            {/* Right: content */}
            <div style={{
              flex:          1,
              paddingBottom: isLast ? 0 : vGap,
              paddingTop:    2,
            }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize:   'var(--ws-text-base)',
                  fontWeight: 600,
                  color:      item.status === 'cancelled' ? 'var(--ws-text-3)' : 'var(--ws-text)',
                  textDecoration: item.status === 'cancelled' ? 'line-through' : 'none',
                }}>
                  {item.title}
                </span>

                {item.badge && (
                  <span style={{
                    fontSize:     'var(--ws-text-xs)',
                    fontWeight:   700,
                    padding:      '2px 8px',
                    borderRadius: 'var(--ws-radius-full)',
                    background:   cfg.bg,
                    color:        cfg.color,
                    border:       `1px solid ${cfg.border}`,
                  }}>
                    {item.badge}
                  </span>
                )}

                {item.date && (
                  <span style={{
                    fontSize:   'var(--ws-text-xs)',
                    color:      'var(--ws-text-3)',
                    marginLeft: 'auto',
                  }}>
                    {new Date(item.date).toLocaleDateString('es-ES', {
                      day:   'numeric',
                      month: 'short',
                      year:  'numeric',
                    })}
                  </span>
                )}
              </div>

              {/* Description */}
              {item.description && (
                <p style={{
                  fontSize:    'var(--ws-text-sm)',
                  color:       'var(--ws-text-3)',
                  lineHeight:  1.5,
                  marginBottom: item.meta || item.children ? 6 : 0,
                }}>
                  {item.description}
                </p>
              )}

              {/* Meta */}
              {item.meta && (
                <p style={{ fontSize: 'var(--ws-text-xs)', color: 'var(--ws-text-dim)' }}>
                  {item.meta}
                </p>
              )}

              {/* Slot */}
              {item.children}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── TimelineCard — item con fondo, más visual ────────────────────────────────

interface TimelineCardProps {
  item:       TimelineItem;
  onClick?:   () => void;
}

export function TimelineCard({ item, onClick }: TimelineCardProps) {
  const cfg = STATUS_CONFIG[item.status];

  return (
    <div
      onClick={onClick}
      style={{
        background:   'var(--ws-surface)',
        border:       `1px solid ${cfg.border}`,
        borderLeft:   `3px solid ${cfg.color}`,
        borderRadius: 'var(--ws-radius)',
        padding:      '10px 14px',
        cursor:       onClick ? 'pointer' : 'default',
        transition:   'var(--ws-ease)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: cfg.color, fontWeight: 700 }}>
          {cfg.icon} {cfg.label}
        </span>
        {item.badge && (
          <span style={{
            fontSize:     'var(--ws-text-xs)',
            fontWeight:   700,
            padding:      '1px 7px',
            borderRadius: 'var(--ws-radius-full)',
            background:   cfg.bg,
            color:        cfg.color,
          }}>
            {item.badge}
          </span>
        )}
        {item.date && (
          <span style={{ fontSize: 'var(--ws-text-xs)', color: 'var(--ws-text-3)', marginLeft: 'auto' }}>
            {item.date}
          </span>
        )}
      </div>
      <p style={{ fontSize: 'var(--ws-text-sm)', fontWeight: 600, color: 'var(--ws-text)', marginBottom: 2 }}>
        {item.title}
      </p>
      {item.description && (
        <p style={{ fontSize: 'var(--ws-text-xs)', color: 'var(--ws-text-3)', lineHeight: 1.4 }}>
          {item.description}
        </p>
      )}
      {item.meta && (
        <p style={{ fontSize: 'var(--ws-text-xs)', color: 'var(--ws-text-dim)', marginTop: 4 }}>
          {item.meta}
        </p>
      )}
      {item.children}
    </div>
  );
}
