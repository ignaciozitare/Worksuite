import React, { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type DialogType = 'confirm' | 'alert' | 'prompt';

interface DialogState {
  type: DialogType;
  title?: string;
  message: string;
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  defaultValue?: string;
  placeholder?: string;
  icon?: string;
}

interface DialogApi {
  confirm: (message: string, opts?: { title?: string; danger?: boolean; confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;
  alert: (message: string, opts?: { title?: string; icon?: string }) => Promise<void>;
  prompt: (message: string, opts?: { title?: string; defaultValue?: string; placeholder?: string }) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within <DialogProvider>');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const resolveRef = useRef<((value: any) => void) | null>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);

  const close = useCallback((value: any) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setDialog(null);
    setPromptValue('');
  }, []);

  const api = useRef<DialogApi>({
    confirm: (message, opts) => new Promise(resolve => {
      resolveRef.current = resolve;
      setDialog({ type: 'confirm', message, ...opts });
    }),
    alert: (message, opts) => new Promise(resolve => {
      resolveRef.current = resolve;
      setDialog({ type: 'alert', message, ...opts });
    }),
    prompt: (message, opts) => new Promise(resolve => {
      resolveRef.current = resolve;
      setPromptValue(opts?.defaultValue ?? '');
      setDialog({ type: 'prompt', message, ...opts });
    }),
  }).current;

  // Focus prompt input when shown
  useEffect(() => {
    if (dialog?.type === 'prompt') {
      setTimeout(() => promptInputRef.current?.focus(), 50);
    }
  }, [dialog]);

  // Close on Escape
  useEffect(() => {
    if (!dialog) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close(dialog.type === 'confirm' ? false : dialog.type === 'prompt' ? null : undefined);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [dialog, close]);

  const iconName = dialog?.type === 'alert'
    ? (dialog.icon ?? 'info')
    : dialog?.type === 'confirm'
      ? (dialog.danger ? 'warning' : 'help')
      : 'edit';

  const iconColor = dialog?.danger ? 'var(--red)' : 'var(--ac)';

  return (
    <DialogContext.Provider value={api}>
      {children}

      {dialog && (
        <div
          onClick={e => {
            if (e.target === e.currentTarget) {
              close(dialog.type === 'confirm' ? false : dialog.type === 'prompt' ? null : undefined);
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            animation: 'ws-dialog-overlay .15s ease-out',
          }}
        >
          <div
            style={{
              background: 'var(--sf)',
              border: '1px solid var(--bd)',
              borderRadius: 12,
              width: '100%',
              maxWidth: 400,
              boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
              animation: 'ws-dialog-panel .2s ease-out',
              overflow: 'hidden',
            }}
          >
            {/* Header with icon */}
            <div style={{
              padding: '24px 24px 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: dialog.danger
                  ? 'rgba(239, 68, 68, 0.12)'
                  : 'rgba(77, 142, 255, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 'var(--fs-xl)',
                    color: iconColor,
                    fontVariationSettings: "'wght' 400, 'FILL' 1",
                  }}
                >
                  {iconName}
                </span>
              </div>

              {dialog.title && (
                <h3 style={{
                  fontSize: 'var(--fs-sm)',
                  fontWeight: 700,
                  color: 'var(--tx)',
                  margin: 0,
                  textAlign: 'center',
                  letterSpacing: '-0.01em',
                }}>
                  {dialog.title}
                </h3>
              )}
            </div>

            {/* Message */}
            <div style={{
              padding: dialog.title ? '8px 24px 20px' : '16px 24px 20px',
              textAlign: 'center',
            }}>
              <p style={{
                fontSize: 'var(--fs-xs)',
                color: 'var(--tx2)',
                margin: 0,
                lineHeight: 1.6,
                whiteSpace: 'pre-line',
              }}>
                {dialog.message}
              </p>
            </div>

            {/* Prompt input */}
            {dialog.type === 'prompt' && (
              <div style={{ padding: '0 24px 16px' }}>
                <input
                  ref={promptInputRef}
                  value={promptValue}
                  onChange={e => setPromptValue(e.target.value)}
                  placeholder={dialog.placeholder}
                  onKeyDown={e => { if (e.key === 'Enter') close(promptValue || null); }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    fontSize: 'var(--fs-xs)',
                    background: 'var(--sf2)',
                    border: '1px solid var(--bd)',
                    borderRadius: 8,
                    color: 'var(--tx)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    transition: 'border-color .15s ease',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--ac)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--bd)'; }}
                />
              </div>
            )}

            {/* Actions */}
            <div style={{
              padding: '0 24px 20px',
              display: 'flex',
              gap: 10,
              justifyContent: dialog.type === 'alert' ? 'center' : 'flex-end',
            }}>
              {dialog.type !== 'alert' && (
                <button
                  onClick={() => close(dialog.type === 'confirm' ? false : null)}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    fontSize: 'var(--fs-xs)',
                    fontWeight: 500,
                    fontFamily: 'inherit',
                    background: 'var(--sf3)',
                    border: 'none',
                    borderRadius: 8,
                    color: 'var(--tx2)',
                    cursor: 'pointer',
                    transition: 'background .15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--sf2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--sf3)'; }}
                >
                  {dialog.cancelLabel ?? 'Cancel'}
                </button>
              )}

              <button
                onClick={() => {
                  if (dialog.type === 'confirm') close(true);
                  else if (dialog.type === 'prompt') close(promptValue || null);
                  else close(undefined);
                }}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  fontSize: 'var(--fs-xs)',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  background: dialog.danger
                    ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                    : 'var(--ac-grad)',
                  border: 'none',
                  borderRadius: 8,
                  color: dialog.danger ? '#fff' : '#0a0a0a',
                  cursor: 'pointer',
                  transition: 'box-shadow .15s ease, transform .1s ease',
                  boxShadow: dialog.danger
                    ? '0 4px 12px rgba(239,68,68,0.3)'
                    : '0 4px 12px rgba(77,142,255,0.3)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = dialog.danger
                    ? '0 6px 20px rgba(239,68,68,0.4)'
                    : '0 6px 20px rgba(77,142,255,0.4)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = dialog.danger
                    ? '0 4px 12px rgba(239,68,68,0.3)'
                    : '0 4px 12px rgba(77,142,255,0.3)';
                }}
              >
                {dialog.confirmLabel ?? (dialog.type === 'alert' ? 'OK' : 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ws-dialog-overlay {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes ws-dialog-panel {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </DialogContext.Provider>
  );
}
