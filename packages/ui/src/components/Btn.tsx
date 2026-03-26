import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type BtnVariant = 'primary' | 'ghost' | 'success' | 'warn' | 'danger' | 'outline';
export type BtnSize    = 'sm' | 'md' | 'lg';

interface BtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?:  BtnVariant;
  size?:     BtnSize;
  full?:     boolean;
  loading?:  boolean;
  children:  ReactNode;
}

const VARIANT_STYLES: Record<BtnVariant, string> = {
  primary: [
    'background:var(--ws-accent)',
    'color:#fff',
    'border:none',
  ].join(';'),
  ghost: [
    'background:var(--ws-surface-2)',
    'color:var(--ws-text-2)',
    'border:1px solid var(--ws-border)',
  ].join(';'),
  success: [
    'background:var(--ws-green-bg)',
    'color:var(--ws-green)',
    'border:1px solid rgba(74,222,128,.3)',
  ].join(';'),
  warn: [
    'background:var(--ws-amber-bg)',
    'color:var(--ws-amber)',
    'border:1px solid rgba(251,191,36,.3)',
  ].join(';'),
  danger: [
    'background:var(--ws-red-bg)',
    'color:var(--ws-red)',
    'border:1px solid rgba(248,113,113,.3)',
  ].join(';'),
  outline: [
    'background:transparent',
    'color:var(--ws-accent)',
    'border:1px solid var(--ws-accent)',
  ].join(';'),
};

const SIZE_STYLES: Record<BtnSize, string> = {
  sm: 'font-size:11px;padding:4px 11px;',
  md: 'font-size:13px;padding:8px 16px;',
  lg: 'font-size:14px;padding:10px 20px;',
};

export function Btn({
  variant  = 'primary',
  size     = 'md',
  full     = false,
  loading  = false,
  disabled,
  children,
  ...rest
}: BtnProps) {
  const isDisabled = disabled || loading;

  const inlineStyle = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'gap:5px',
    'border-radius:var(--ws-radius)',
    'font-weight:600',
    'font-family:inherit',
    'cursor:pointer',
    'transition:var(--ws-ease)',
    'white-space:nowrap',
    VARIANT_STYLES[variant],
    SIZE_STYLES[size],
    full   ? 'width:100%' : '',
    isDisabled ? 'opacity:0.4;cursor:not-allowed;pointer-events:none' : '',
  ].filter(Boolean).join(';');

  return (
    <button
      // @ts-expect-error style as string for zero-dependency inline CSS
      style={inlineStyle}
      disabled={isDisabled}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden
          // @ts-expect-error
          style="width:12px;height:12px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:ws-spin .6s linear infinite;display:inline-block"
        />
      )}
      {children}
    </button>
  );
}
