/**
 * ChronoStatCard — bento-style metric card shared by the Chrono dashboards.
 *
 * Look based on the Stitch redesign:
 *   - Dark surface with a subtle radial glow tinted by the accent color
 *   - Icon in the accent color, large numeric value, small caps label
 *   - Optional subtext under the value (e.g. "Available for rollover")
 *   - Optional trend indicator on the right ("On Track", "+2h", etc.)
 *
 * Purely presentational. It receives already-formatted strings — no
 * date math, no Supabase calls, no state.
 */

import type { CSSProperties, ReactNode } from 'react';
import { CHRONO_THEME } from '../../shared/theme';

export interface ChronoStatCardProps {
  /** Big label on top (UPPERCASE small caps). */
  label: string;
  /** The main number/value shown in large type. */
  value: ReactNode;
  /**
   * Accent color for the icon, the glow, and any trend indicator.
   * Defaults to the theme primary.
   */
  accent?: string;
  /** Optional icon node rendered top-left. A simple glyph is fine. */
  icon?: ReactNode;
  /** Optional subtext rendered below the value (captions). */
  subtext?: ReactNode;
  /**
   * Optional right-aligned trend/status chip (e.g. "On Track", "+2h").
   * Rendered next to the value on the same row.
   */
  trend?: ReactNode;
  /**
   * Optional progress bar shown at the bottom of the card.
   * `pct` must be 0-100. `track` lets the caller pick a color for the
   * background of the bar (defaults to a subtle dark tint).
   */
  progressBar?: { pct: number; track?: string };
  /**
   * Optional sparkline of mini vertical bars at the bottom of the card.
   * Each entry is 0-100. Useful for things like "last 7 days" at a glance.
   */
  bars?: number[];
  /** Forwarded style override for the root card. */
  style?: CSSProperties;
}

const T = CHRONO_THEME;

export function ChronoStatCard({
  label,
  value,
  accent = T.color.primary,
  icon,
  subtext,
  trend,
  progressBar,
  bars,
  style,
}: ChronoStatCardProps) {
  return (
    <div
      style={{
        position: 'relative',
        background: T.color.surface,
        border: `1px solid ${T.color.surfaceHigh}`,
        borderRadius: T.radius.lg,
        padding: '18px 20px',
        overflow: 'hidden',
        transition: 'border-color .2s, transform .15s',
        ...style,
      }}
    >
      {/* Subtle accent glow in the top-right corner */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -40,
          right: -40,
          width: 140,
          height: 140,
          background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Header row: icon + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, position: 'relative' }}>
        {icon && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: T.radius.md,
              background: `${accent}1a`,
              color: accent,
              fontSize: 16,
              fontFamily: T.font.mono,
            }}
          >
            {icon}
          </span>
        )}
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.12em',
            color: T.color.textMuted,
          }}
        >
          {label}
        </span>
      </div>

      {/* Value row: value + optional trend chip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          position: 'relative',
        }}
      >
        <span
          style={{
            fontFamily: T.font.mono,
            fontSize: 30,
            fontWeight: 700,
            lineHeight: 1.1,
            color: T.color.text,
            letterSpacing: '-0.01em',
          }}
        >
          {value}
        </span>
        {trend && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              fontWeight: 700,
              color: accent,
              textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}
          >
            {trend}
          </span>
        )}
      </div>

      {/* Optional subtext */}
      {subtext && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: T.color.textDim,
            position: 'relative',
          }}
        >
          {subtext}
        </div>
      )}

      {/* Optional progress bar */}
      {progressBar && (
        <div
          style={{
            marginTop: 14,
            height: 5,
            background: progressBar.track ?? T.color.surfaceLow,
            borderRadius: T.radius.full,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(100, progressBar.pct))}%`,
              height: '100%',
              background: accent,
              borderRadius: T.radius.full,
              transition: 'width .4s ease',
            }}
          />
        </div>
      )}

      {/* Optional mini bars (sparkline) */}
      {bars && bars.length > 0 && (
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 4,
            height: 24,
            position: 'relative',
          }}
        >
          {bars.map((h, i) => {
            const clamped = Math.max(0, Math.min(100, h));
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${Math.max(4, clamped)}%`,
                  background: clamped > 0 ? accent : T.color.surfaceLow,
                  opacity: clamped > 0 ? 0.35 + (clamped / 100) * 0.65 : 0.2,
                  borderRadius: 2,
                  minHeight: 3,
                  transition: 'height .3s ease, opacity .3s ease',
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
