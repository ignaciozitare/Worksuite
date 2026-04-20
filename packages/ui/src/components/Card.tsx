import React from 'react';
import type { CSSProperties, ReactNode } from 'react';

export type CardVariant = 'default' | 'stat' | 'glass';

export interface CardProps {
  variant?: CardVariant;
  accent?: string;
  glow?: boolean;
  padding?: string | number;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  onClick?: () => void;
}

const baseStyle: CSSProperties = {
  borderRadius: 8,
  position: 'relative',
  overflow: 'hidden',
  transition: 'box-shadow 0.2s ease, transform 0.15s ease',
};

function resolveVariantStyle(variant: CardVariant): CSSProperties {
  switch (variant) {
    case 'glass':
      return {
        background: 'rgba(20, 20, 24, 0.55)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--bd)',
      };
    case 'stat':
    case 'default':
    default:
      return {
        background: 'var(--sf)',
        border: '1px solid var(--sf3)',
      };
  }
}

export function Card({
  variant = 'default',
  accent,
  glow = false,
  padding = 20,
  children,
  style,
  className,
  onClick,
}: CardProps) {
  const variantStyle = resolveVariantStyle(variant);

  const accentColor = accent ?? 'var(--ac)';
  const showAccent = variant === 'default' || variant === 'stat';

  const glowActive = glow || variant === 'stat';
  const glowColor = accent ?? 'var(--ac)';

  const combinedStyle: CSSProperties = {
    ...baseStyle,
    ...variantStyle,
    padding: typeof padding === 'number' ? padding : padding,
    cursor: onClick ? 'pointer' : undefined,
    ...(glowActive
      ? { boxShadow: `0 0 40px -10px ${glowColor}33, 0 0 80px -20px ${glowColor}1a` }
      : {}),
    ...style,
  };

  return (
    <div
      className={className}
      style={combinedStyle}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      {showAccent && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(90deg, ${accentColor}, transparent)`,
            opacity: 0.7,
          }}
        />
      )}
      {children}
    </div>
  );
}
