import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

export type BtnVariant = 'primary' | 'ghost' | 'success' | 'warn' | 'danger' | 'outline';
export type BtnSize    = 'sm' | 'md' | 'lg';

interface BtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?:  BtnVariant;
  size?:     BtnSize;
  full?:     boolean;
  loading?:  boolean;
  style?:    CSSProperties;
  children:  ReactNode;
}

const VARIANT_STYLES: Record<BtnVariant, CSSProperties> = {
  primary: {
    background: 'var(--ac)',
    color: '#fff',
    border: 'none',
  },
  ghost: {
    background: 'var(--sf2)',
    color: 'var(--tx2)',
    border: '1px solid var(--bd)',
  },
  success: {
    background: 'var(--green-dim)',
    color: 'var(--green)',
    border: '1px solid rgba(62,207,142,.3)',
  },
  warn: {
    background: 'var(--amber-dim)',
    color: 'var(--amber)',
    border: '1px solid rgba(245,166,35,.3)',
  },
  danger: {
    background: 'var(--red-dim)',
    color: 'var(--red)',
    border: '1px solid rgba(224,82,82,.3)',
  },
  outline: {
    background: 'transparent',
    color: 'var(--ac)',
    border: '1px solid var(--ac)',
  },
};

const SIZE_STYLES: Record<BtnSize, CSSProperties> = {
  sm: { fontSize: 11, padding: '4px 11px' },
  md: { fontSize: 13, padding: '8px 16px' },
  lg: { fontSize: 14, padding: '10px 20px' },
};

export function Btn({
  variant  = 'primary',
  size     = 'md',
  full     = false,
  loading  = false,
  disabled,
  children,
  style: styleProp,
  ...rest
}: BtnProps) {
  const isDisabled = disabled || loading;

  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 'var(--r2)',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'var(--ease)',
    whiteSpace: 'nowrap',
    ...VARIANT_STYLES[variant],
    ...SIZE_STYLES[size],
    ...(full ? { width: '100%' } : {}),
    ...(isDisabled ? { opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' as const } : {}),
    ...styleProp,
  };

  return (
    <button style={style} disabled={isDisabled} {...rest}>
      {loading && (
        <span
          aria-hidden
          style={{
            width: 12,
            height: 12,
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'ws-spin .6s linear infinite',
            display: 'inline-block',
          }}
        />
      )}
      {children}
    </button>
  );
}
