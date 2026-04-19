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

  /** Color palette — uses CSS custom properties for light/dark mode support. */
  color: {
    /** Page background (surface-dim). */
    bg:                 'var(--bg)',
    /** Primary surface for cards / raised containers. */
    surface:            'var(--sf)',
    /** A step up in elevation (hover, nested cards). */
    surfaceHigh:        'var(--sf3)',
    /** Brighter step, used for inputs and highlights. */
    surfaceBright:      'var(--sf-bright, #3a3939)',
    /** Lowest-elevation surface (sidebar background, subtle wells). */
    surfaceLow:         'var(--sf-low, #1c1b1b)',
    /** Even lower (sidebar root, footer). */
    surfaceLowest:      'var(--sf-lowest, #0e0e0e)',

    /** Borders and dividers. */
    border:             'var(--bd2)',
    /** Subtle outline color for separators. */
    outline:            'var(--tx3)',

    /** Main foreground text. */
    text:               'var(--tx)',
    /** Secondary text — captions, labels. */
    textMuted:          'var(--tx2)',
    /** Tertiary text — hints, disabled. */
    textDim:            'var(--tx3)',

    /** Brand primary (buttons, active tabs, accents). */
    primary:            'var(--ac2)',
    primaryStrong:      'var(--ac-strong, #4d8eff)',
    primaryOn:          'var(--ac-on, #00285d)',
    primaryDim:         'var(--ac-dim)',

    /** Brand secondary (success, on-track, clocked-in indicator). */
    secondary:          'var(--green)',
    secondaryStrong:    'var(--green-strong, #00b954)',
    secondaryDim:       'var(--green-dim)',

    /** Brand tertiary (violet — hours bank, highlights). */
    tertiary:           'var(--tertiary, #ddb7ff)',
    tertiaryStrong:     'var(--purple-strong, #b76dff)',
    tertiaryDim:        'var(--purple-dim)',

    /** Semantic. */
    warning:            'var(--amber)',
    warningDim:         'var(--amber-dim)',
    danger:             'var(--danger, #ffb4ab)',
    dangerStrong:       'var(--danger-strong, #ef4444)',
    dangerDim:          'var(--red-dim)',
  },

  /** Shadows. Stitch uses a subtle glow on active elements. */
  shadow: {
    card:       '0 4px 20px rgba(0, 0, 0, 0.35)',
    glowPrimary: '0 0 15px rgba(77, 142, 255, 0.3)',
  },
} as const;

export type ChronoTheme = typeof CHRONO_THEME;
