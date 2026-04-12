// Small inline atoms shared by the Deploy Planner views.
// Pure presentational — no state.
import type { CSSProperties, ReactNode } from 'react';

/* ─── Deploy Planner branded icon ─────────────────────────────── */
interface DeployPlannerIconProps {
  size?: number;
}

/** Branded icon for the Deploy Planner module — "hub" Material Symbol
 *  inside a primary gradient box. Reusable across sidebar, nav, etc. */
export const DeployPlannerIcon = ({ size = 40 }: DeployPlannerIconProps) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.2,
      background: 'rgba(77,142,255,.12)',
      border: '1px solid rgba(77,142,255,.2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <span
      className="material-symbols-outlined"
      style={{ fontSize: size * 0.5, color: '#4d8eff' }}
    >
      hub
    </span>
  </div>
);

interface SLabelProps {
  children: ReactNode;
  style?: CSSProperties;
}

export const SLabel = ({ children, style = {} }: SLabelProps) => (
  <div
    style={{
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '.12em',
      textTransform: 'uppercase',
      color: 'var(--dp-tx3,#8c909f)',
      ...style,
    }}
  >
    {children}
  </div>
);

interface RepoChipProps {
  name: string;
}

export const RepoChip = ({ name }: RepoChipProps) => (
  <span
    style={{
      fontSize: 9,
      padding: '2px 7px',
      borderRadius: 3,
      background: 'var(--dp-sf2,#201f1f)',
      border: '1px solid rgba(66,71,84,.15)',
      color: 'var(--dp-tx3,#8c909f)',
    }}
  >
    {name}
  </span>
);
