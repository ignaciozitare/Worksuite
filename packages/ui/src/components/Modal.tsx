import { useEffect, type ReactNode, type CSSProperties } from 'react';

interface ModalProps {
  title?:    string;
  onClose:   () => void;
  children:  ReactNode;
  width?:    number;
  noPadding?: boolean;
}

export function Modal({ title, onClose, children, width = 520, noPadding = false }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const overlayStyle: CSSProperties = {
    position:        'fixed',
    inset:           0,
    background:      'rgba(0, 0, 0, 0.6)',
    zIndex:          200,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         20,
    backdropFilter:  'blur(2px)',
  };

  const panelStyle: CSSProperties = {
    background:    'var(--ws-surface)',
    border:        '1px solid var(--ws-border)',
    borderRadius:  'var(--ws-radius-xl)',
    width:         '100%',
    maxWidth:      width,
    maxHeight:     '90vh',
    overflow:      'hidden',
    display:       'flex',
    flexDirection: 'column',
    boxShadow:     'var(--ws-shadow-xl)',
    animation:     'ws-fade-in 0.15s ease',
  };

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panelStyle}>
        {title && (
          <div style={{
            padding:       '16px 20px',
            borderBottom:  '1px solid var(--ws-border)',
            display:       'flex',
            alignItems:    'center',
            gap:           10,
            flexShrink:    0,
          }}>
            <h3 style={{
              fontFamily: 'var(--ws-font-heading)',
              fontSize:   15,
              fontWeight: 700,
              color:      'var(--ws-text)',
              margin:     0,
              flex:       1,
            }}>
              {title}
            </h3>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              style={{
                background:    'transparent',
                border:        'none',
                color:         'var(--ws-text-3)',
                cursor:        'pointer',
                fontSize:      20,
                lineHeight:    1,
                padding:       '2px 6px',
                borderRadius:  'var(--ws-radius-sm)',
                fontFamily:    'inherit',
              }}
            >
              ✕
            </button>
          </div>
        )}
        <div style={{
          overflowY: 'auto',
          flex:      1,
          padding:   noPadding ? 0 : '18px 20px',
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  message:   string;
  onConfirm: () => void;
  onCancel:  () => void;
  danger?:   boolean;
  confirmLabel?: string;
  cancelLabel?:  string;
}

export function ConfirmModal({
  message,
  onConfirm,
  onCancel,
  danger = false,
  confirmLabel = 'Confirmar',
  cancelLabel  = 'Cancelar',
}: ConfirmModalProps) {
  return (
    <Modal title="Confirmar" onClose={onCancel} width={380}>
      <p style={{ fontSize: 14, color: 'var(--ws-text)', marginBottom: 20, lineHeight: 1.6 }}>
        {message}
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            background:   'var(--ws-surface-2)',
            border:       '1px solid var(--ws-border)',
            borderRadius: 'var(--ws-radius)',
            padding:      '7px 16px',
            color:        'var(--ws-text-2)',
            cursor:       'pointer',
            fontSize:     13,
            fontFamily:   'inherit',
          }}
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          style={{
            background:   danger ? 'var(--ws-red)' : 'var(--ws-accent)',
            border:       'none',
            borderRadius: 'var(--ws-radius)',
            padding:      '7px 16px',
            color:        '#fff',
            cursor:       'pointer',
            fontSize:     13,
            fontWeight:   600,
            fontFamily:   'inherit',
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
