interface BugIconProps {
  size?: number;
  color?: string;
}

/**
 * Circuit-board style bug icon (SVG).
 * Based on the WorkSuite brand bug illustration.
 */
export function BugIcon({ size = 16, color = 'currentColor' }: BugIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      {/* Body */}
      <path d="M8 7.5C8 5.01 10.01 3 12.5 3C14.99 3 17 5.01 17 7.5V12C17 14.76 14.76 17 12 17H9C8.45 17 8 16.55 8 16V7.5Z" fill={color} />
      {/* Head */}
      <circle cx="15.5" cy="5.5" r="3" fill={color} />
      {/* Antennae */}
      <path d="M14 3.5L12.5 1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M17 3.5L18.5 1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Legs left */}
      <path d="M8 9L5.5 7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 12L5 12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 15L5.5 17" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Legs right */}
      <path d="M17 9L19.5 7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M17 12L20 12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M17 15L19.5 17" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Circuit traces on body */}
      <circle cx="11" cy="9" r="1.2" fill="none" stroke="#fff" strokeWidth="0.8" />
      <circle cx="14" cy="11" r="1" fill="none" stroke="#fff" strokeWidth="0.8" />
      <path d="M11 10.2V12.5H13" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" />
      <circle cx="11.5" cy="14" r="0.8" fill="none" stroke="#fff" strokeWidth="0.7" />
      <path d="M14 12V14H12.3" stroke="#fff" strokeWidth="0.7" strokeLinecap="round" />
    </svg>
  );
}
