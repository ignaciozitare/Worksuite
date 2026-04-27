// @ts-nocheck
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@worksuite/i18n';
import { UserAvatar } from '@worksuite/ui';

interface Props {
  user: { id?: string; name?: string; email?: string; avatar?: string; avatarUrl?: string | null };
  onLogout: () => void;
}

export function UserMenu({ user, onLogout }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  function handleLogout() {
    setOpen(false);
    onLogout();
  }

  const items: { labelKey: string; icon: string; action: () => void; danger?: boolean }[] = [
    { labelKey: 'userMenu.profile',  icon: '👤', action: () => go('/profile') },
    { labelKey: 'userMenu.settings', icon: '⚙️', action: () => go('/admin') },
    { labelKey: 'userMenu.logout',   icon: '⏻',  action: handleLogout, danger: true },
  ];

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: open ? 'var(--bg2, rgba(255,255,255,.06))' : 'transparent',
          border: '1px solid var(--bd)', borderRadius: 'var(--r)',
          padding: '4px 10px 4px 4px', cursor: 'pointer',
          transition: 'background .15s, border-color .15s',
          height: 32,
        }}
      >
        <UserAvatar user={user} size={24} imageWidth={64} />
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx2)', fontWeight: 600 }}>
          {user.name || user.email}
        </span>
        <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)', marginLeft: 2 }}>
          ▾
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          minWidth: 220, background: 'var(--sf)', border: '1px solid var(--bd)',
          borderRadius: 'var(--r2, 8px)', boxShadow: '0 8px 32px rgba(0,0,0,.35)',
          zIndex: 9999, padding: 6, fontFamily: "'IBM Plex Sans', sans-serif",
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 12px 12px',
            borderBottom: '1px solid var(--bd)',
            marginBottom: 6,
          }}>
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--tx)' }}>
              {user.name}
            </div>
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)', marginTop: 2 }}>
              {user.email}
            </div>
          </div>

          {/* Items */}
          {items.map((item, idx) => {
            const isLast = idx === items.length - 1;
            return (
              <div key={item.labelKey}>
                {item.danger && (
                  <div style={{ height: 1, background: 'var(--bd)', margin: '6px 0' }} />
                )}
                <button
                  onClick={item.action}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '10px 12px', borderRadius: 6,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: item.danger ? '#ef4444' : 'var(--tx2)',
                    fontSize: 'var(--fs-xs)', fontWeight: 500, textAlign: 'left',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2, rgba(255,255,255,.05))')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: 'var(--fs-sm)', width: 18, textAlign: 'center' }}>{item.icon}</span>
                  <span>{t(item.labelKey)}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
