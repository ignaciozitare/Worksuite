/**
 * Chrono Admin — design token wrapper.
 *
 * Maps the legacy `C` color keys (amber, green, red, etc.) to the
 * Stitch CHRONO_THEME tokens. Lives in its own file to avoid circular
 * imports — ChronoAdminPage.tsx imports the views, and the views
 * import this file instead of ChronoAdminPage.
 */
import { CHRONO_THEME as T } from '../../chrono/shared/theme';

export const CHRONO_ADMIN_COLORS = {
  bg: T.color.bg, sf: T.color.surface, sfHover: T.color.surfaceHigh, bd: T.color.surfaceHigh,
  amber: T.color.primary, amberDim: T.color.primaryStrong, amberGlow: T.color.primaryDim,
  tx: T.color.text, txDim: T.color.textDim, txMuted: T.color.textMuted,
  green: T.color.secondary, greenDim: T.color.secondaryDim,
  red: T.color.dangerStrong, redDim: T.color.dangerDim,
  blue: '#3b82f6', blueDim: 'rgba(59,130,246,0.15)',
  orange: '#f97316', purple: '#a855f7',
} as const;
