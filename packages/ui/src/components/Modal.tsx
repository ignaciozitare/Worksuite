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
    backdropFilter:  'blur(4px)',
  };

  const panelStyle: CSSProperties = {
    background:    'var(--sf)',
    border:        '1px solid var(--bd2)',
    borderRadius:  'var(--r2)',
    width:         '100%',
    maxWidth:      width,
    maxHeight:     '90vh',
    overflow:      'hidden',
    display:       'flex',
    flexDirection: 'column',
    boxShadow:     'var(--shadow)',
    animation:     'mbIn 0.18s ease',
  };

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panelStyle}>
        {title && (
          <div style={{
            padding:       '16px 18px 12px',
            borderBottom:  '1px solid var(--bd)',
            display:       'flex',
            alignItems:    'center',
            gap:           10,
            flexShrink:    0,
            background:    'var(--sf)',
          }}>
            <h3 style={{
              fontSize:   14,
              fontWeight: 700,
              letterSpacing: '-0.1px',
              color:      'var(--tx)',
              margin:     0,
              flex:       1,
            }}>
              {title}
            </h3>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background:    'transparent',
                border:        'none',
                color:         'var(--tx3)',
                cursor:        'pointer',
                fontSize:      18,
                lineHeight:    1,
                padding:       '2px 6px',
                borderRadius:  '3px',
                fontFamily:    'inherit',
                transition:    'var(--ease)',
              }}
            >
              ✕
            </button>
          </div>
        )}
        <div style={{
          overflowY: 'auto',
          flex:      1,
          padding:   noPadding ? 0 : '18px',
          background: 'var(--sf)',
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
      <p style={{ fontSize: 14, color: 'var(--tx)', marginBottom: 20, lineHeight: 1.6 }}>
        {message}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            background:   'var(--sf2)',
            border:       '1px solid var(--bd)',
            borderRadius: 'var(--r)',
            padding:      '8px 14px',
            color:        'var(--tx2)',
            cursor:       'pointer',
            fontSize:     12,
            fontWeight:   500,
            fontFamily:   'inherit',
            transition:   'var(--ease)',
          }}
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          style={{
            background:   danger ? 'var(--red)' : 'var(--ac)',
            border:       'none',
            borderRadius: 'var(--r)',
            padding:      '8px 18px',
            color:        '#fff',
            cursor:       'pointer',
            fontSize:     12,
            fontWeight:   600,
            fontFamily:   'inherit',
            transition:   'var(--ease)',
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
