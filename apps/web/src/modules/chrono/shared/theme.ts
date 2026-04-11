/**
 * Chrono + Chrono Admin — design tokens.
 *
 * Shared between `modules/chrono/ui/ChronoPage.tsx` and
 * `modules/chrono-admin/ui/ChronoAdminPage.tsx`. Both modules share the
 * "command center" look, so it's the same palette.
 *
 * Based on the Stitch redesign. These tokens are scoped under the `.ch`
 * CSS namespace that both modules already use — they never leak into
 * the rest of the app.
 *
 * The old `C` object is still in use across the components; this file
 * is the target we'll migrate to, one piece at a time. Do not remove
 * the old tokens until every consumer has been ported.
 */

export const CHRONO_THEME = {
  /** Typography — Inter for everything except runtime readouts. */
  font: {
    body:  "'Inter', system-ui, -apple-system, sans-serif",
    /** Kept monospaced so timers/clocks line up. */
    mono:  "'Inter', 'IBM Plex Mono', monospace",
  },

  /** Corner radius. Stitch uses 0.5rem as the "main" radius. */
  radius: {
    sm:   '4px',
    md:   '6px',
    lg:   '8px',   // the "xl" of Stitch → most cards
    xl:   '12px',
    full: '9999px',
  },

  /** Color palette — direct from the Stitch tailwind config. */
  color: {
    /** Page background (surface-dim). */
    bg:                 '#131313',
    /** Primary surface for cards / raised containers. */
    surface:            '#201f1f',
    /** A step up in elevation (hover, nested cards). */
    surfaceHigh:        '#2a2a2a',
    /** Brighter step, used for inputs and highlights. */
    surfaceBright:      '#3a3939',
    /** Lowest-elevation surface (sidebar background, subtle wells). */
    surfaceLow:         '#1c1b1b',
    /** Even lower (sidebar root, footer). */
    surfaceLowest:      '#0e0e0e',

    /** Borders and dividers. */
    border:             '#424754',
    /** Subtle outline color for separators. */
    outline:            '#8c909f',

    /** Main foreground text. */
    text:               '#e5e2e1',
    /** Secondary text — captions, labels. */
    textMuted:          '#c2c6d6',
    /** Tertiary text — hints, disabled. */
    textDim:            '#8c909f',

    /** Brand primary (buttons, active tabs, accents). */
    primary:            '#adc6ff',
    primaryStrong:      '#4d8eff',
    primaryOn:          '#00285d',
    primaryDim:         'rgba(77, 142, 255, 0.12)',

    /** Brand secondary (success, on-track, clocked-in indicator). */
    secondary:          '#4ae176',
    secondaryStrong:    '#00b954',
    secondaryDim:       'rgba(74, 225, 118, 0.12)',

    /** Brand tertiary (violet — hours bank, highlights). */
    tertiary:           '#ddb7ff',
    tertiaryStrong:     '#b76dff',
    tertiaryDim:        'rgba(221, 183, 255, 0.12)',

    /** Semantic. */
    warning:            '#f59e0b',
    warningDim:         'rgba(245, 158, 11, 0.12)',
    danger:             '#ffb4ab',
    dangerStrong:       '#ef4444',
    dangerDim:          'rgba(255, 180, 171, 0.12)',
  },

  /** Shadows. Stitch uses a subtle glow on active elements. */
  shadow: {
    card:       '0 4px 20px rgba(0, 0, 0, 0.35)',
    glowPrimary: '0 0 15px rgba(77, 142, 255, 0.3)',
  },
} as const;

export type ChronoTheme = typeof CHRONO_THEME;
