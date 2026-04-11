// Small inline atoms shared by the Deploy Planner views.
// Pure presentational — no state.
import type { CSSProperties, ReactNode } from 'react';

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
      color: 'var(--dp-tx3,#334155)',
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
      background: 'var(--dp-sf2,#0d111a)',
      border: '1px solid var(--dp-bd,#1e293b)',
      color: 'var(--dp-tx3,#475569)',
    }}
  >
    {name}
  </span>
);
