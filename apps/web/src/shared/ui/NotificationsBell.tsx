// @ts-nocheck
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@worksuite/i18n';
import { useNotificaciones } from '@/shared/hooks/useNotificaciones';
import type { NotificationPort } from '@/shared/domain/ports/NotificationPort';

const C = {
  amber: '#f59e0b', amberDim: '#92400e', amberGlow: 'rgba(245,158,11,0.12)',
  tx: '#e8e8e8', txDim: '#888', txMuted: '#555',
  red: '#ef4444',
  sf: '#161616', bd: '#2a2a2a',
};

interface Props {
  userId: string;
  repo: NotificationPort;
}

export function NotificationsBell({ userId, repo }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { notifs, unread, marcarLeida } = useNotificaciones(repo, userId);

  if (!userId) return null;

  function handleClick(n: any) {
    marcarLeida(n.id);
    if (n.link) {
      // navigate accepts "/path?query=value" — preserves search params
      navigate(n.link);
    }
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title={t('chrono.alertas')}
        style={{
          position: 'relative', background: 'transparent', border: '1px solid var(--bd)',
          borderRadius: 'var(--r)', cursor: 'pointer', fontSize: 14,
          color: 'var(--tx2)', padding: '4px 8px', height: 28,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
            minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
            background: C.red, color: '#fff', fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--bg)',
          }}>{unread}</span>
        )}
      </button>

      {open && createPortal(
        <>
          {/* Overlay */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9998 }}
          />

          {/* Panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, width: 360, height: '100vh',
            background: C.sf, borderLeft: `1px solid ${C.bd}`, zIndex: 9999,
            display: 'flex', flexDirection: 'column',
            boxShadow: '-8px 0 30px rgba(0,0,0,.4)',
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}>
            <div style={{
              padding: '16px 18px', borderBottom: `1px solid ${C.bd}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span className="mono" style={{
                fontSize: 13, fontWeight: 700, color: C.amber, letterSpacing: '.05em',
                fontFamily: "'IBM Plex Mono',monospace",
              }}>
                {t('chrono.alertas')} ({unread})
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: C.txDim, cursor: 'pointer', fontSize: 18 }}
              >×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
              {notifs.length === 0 && (
                <div style={{ textAlign: 'center', padding: 30, color: C.txMuted, fontSize: 12 }}>
                  {t('chrono.sinAlarmas')}
                </div>
              )}
              {notifs.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    padding: '12px 14px', borderRadius: 6, marginBottom: 6, cursor: 'pointer',
                    background: n.leida ? 'transparent' : C.amberGlow,
                    border: `1px solid ${n.leida ? C.bd : C.amberDim}`,
                    transition: 'background .15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: n.tipo === 'warning' ? C.red : n.tipo === 'action' ? C.amber : C.txDim,
                      textTransform: 'uppercase', letterSpacing: '.08em',
                      fontFamily: "'IBM Plex Mono',monospace",
                    }}>{n.tipo}</span>
                    {!n.leida && <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.amber }} />}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 2 }}>{n.titulo}</div>
                  <div style={{ fontSize: 11, color: C.txDim, lineHeight: 1.4 }}>{n.mensaje}</div>
                  <div className="mono" style={{
                    fontSize: 9, color: C.txMuted, marginTop: 6,
                    fontFamily: "'IBM Plex Mono',monospace",
                  }}>
                    {new Date(n.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
