// @ts-nocheck
import { useState, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { Avatar } from '@worksuite/ui';

interface User {
  id: string;
  name?: string;
  email: string;
  avatar?: string;
}

interface Props {
  users: User[];
  value: string | null;
  onChange: (userId: string | null) => void;
  placeholder?: string;
}

export function UserPicker({ users, value, onChange, placeholder }: Props) {
  const { t } = useTranslation();
  const effectivePlaceholder = placeholder ?? t('vectorLogic.selectUser');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = useMemo(() => users.find(u => u.id === value), [users, value]);
  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(u =>
      (u.name?.toLowerCase().includes(q)) ||
      u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', padding: '7px 10px', fontSize: 'var(--fs-xs)', fontFamily: 'inherit',
          background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 8,
          color: selected ? 'var(--tx)' : 'var(--tx3)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
          transition: 'border-color .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--ac)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--bd)'}>
        {selected ? (
          <>
            <Avatar initials={(selected.name ?? selected.email).slice(0,2)} color="linear-gradient(135deg, var(--ac), var(--ac2))" size={18} name={selected.name} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.name ?? selected.email}
            </span>
          </>
        ) : (
          <span style={{ flex: 1 }}>{effectivePlaceholder}</span>
        )}
        <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-sm)', color: 'var(--tx3)' }}>
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 101,
            background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 10,
            boxShadow: '0 16px 48px rgba(0,0,0,.5)',
            maxHeight: 320, overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: 8, borderBottom: '1px solid var(--bd)' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} autoFocus
                placeholder={t('common.search')}
                style={{
                  width: '100%', padding: '6px 10px', fontSize: 'var(--fs-xs)', fontFamily: 'inherit',
                  background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 6,
                  color: 'var(--tx)', outline: 'none',
                }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
              {value && (
                <button
                  type="button"
                  onClick={() => { onChange(null); setOpen(false); }}
                  style={{ ...rowStyle, color: 'var(--tx3)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--sf2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-sm)' }}>close</span>
                  <span>{t('common.clear')}</span>
                </button>
              )}
              {filtered.map(u => {
                const isSelected = u.id === value;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => { onChange(u.id); setOpen(false); }}
                    style={{
                      ...rowStyle,
                      background: isSelected ? 'rgba(79,110,247,.1)' : 'transparent',
                      color: isSelected ? 'var(--ac)' : 'var(--tx)',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--sf2)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                    <Avatar initials={(u.name ?? u.email).slice(0,2)} color="linear-gradient(135deg, var(--ac), var(--ac2))" size={20} name={u.name} />
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.name ?? u.email}
                      </div>
                      {u.name && (
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.email}
                        </div>
                      )}
                    </div>
                    {isSelected && <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-sm)' }}>check</span>}
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)', textAlign: 'center', padding: '16px 0' }}>
                  {t('common.noResults')}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}


const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
  borderRadius: 6, cursor: 'pointer', border: 'none', width: '100%',
  fontFamily: 'inherit', fontSize: 'var(--fs-xs)', transition: 'background .12s',
};
