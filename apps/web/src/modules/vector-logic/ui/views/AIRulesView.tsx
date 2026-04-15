// @ts-nocheck
import { useState, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { AIRule } from '../../domain/entities/AI';
import { aiRulesRepo } from '../../container';

interface Props {
  currentUser: { id: string; [k: string]: unknown };
}

export function AIRulesView({ currentUser }: Props) {
  const { t } = useTranslation();
  const [rules, setRules] = useState<AIRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AIRule | null>(null);

  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');

  useEffect(() => {
    aiRulesRepo.list(currentUser.id).then(r => { setRules(r); setLoading(false); });
  }, [currentUser.id]);

  const openNew = () => {
    setEditing(null);
    setFormName('');
    setFormDesc('');
    setShowForm(true);
  };

  const openEdit = (r: AIRule) => {
    setEditing(r);
    setFormName(r.name);
    setFormDesc(r.description);
    setShowForm(true);
  };

  const save = async () => {
    if (!formName.trim() || !formDesc.trim()) return;
    if (editing) {
      await aiRulesRepo.update(editing.id, { name: formName.trim(), description: formDesc.trim() });
      setRules(prev => prev.map(r => r.id === editing.id ? { ...r, name: formName, description: formDesc } : r));
    } else {
      const created = await aiRulesRepo.create({
        userId: currentUser.id,
        name: formName.trim(),
        description: formDesc.trim(),
        isActive: true,
      });
      setRules(prev => [created, ...prev]);
    }
    setShowForm(false);
  };

  const toggleActive = async (r: AIRule) => {
    await aiRulesRepo.update(r.id, { isActive: !r.isActive });
    setRules(prev => prev.map(x => x.id === r.id ? { ...x, isActive: !x.isActive } : x));
  };

  const remove = async (r: AIRule) => {
    await aiRulesRepo.remove(r.id);
    setRules(prev => prev.filter(x => x.id !== r.id));
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)' }}>{t('common.loading')}</div>;
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx)', margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
            {t('vectorLogic.aiRules')}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4, maxWidth: 620 }}>
            {t('vectorLogic.aiRulesDesc')}
          </p>
        </div>
        <button onClick={openNew} style={btnStyle('primary')}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
          {t('vectorLogic.newRule')}
        </button>
      </div>

      {rules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--tx3)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: .2, display: 'block', marginBottom: 12 }}>rule</span>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{t('vectorLogic.noRules')}</div>
          <div style={{ fontSize: 11 }}>{t('vectorLogic.noRulesHint')}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rules.map(r => (
            <div key={r.id} style={{
              background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 10,
              padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12,
              opacity: r.isActive ? 1 : .55,
            }}>
              <button onClick={() => toggleActive(r)} style={{
                background: r.isActive ? 'var(--green)' : 'var(--sf3)', border: 'none',
                borderRadius: 10, width: 36, height: 20, cursor: 'pointer',
                position: 'relative', flexShrink: 0, marginTop: 2, transition: 'background .2s',
              }}>
                <div style={{
                  width: 14, height: 14, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3, left: r.isActive ? 19 : 3, transition: 'left .2s',
                }} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 4 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.5 }}>{r.description}</div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={() => openEdit(r)} style={iconBtn}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                </button>
                <button onClick={() => remove(r)} style={iconBtn}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--red)' }}>delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)',
        }} onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div style={{
            background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 16,
            width: '100%', maxWidth: 560, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.6)',
          }}>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid var(--bd)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx)', margin: 0 }}>
                {editing ? t('vectorLogic.editRule') : t('vectorLogic.newRule')}
              </h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lblStyle}>{t('vectorLogic.ruleName')}</label>
                <input value={formName} onChange={e => setFormName(e.target.value)}
                  placeholder={t('vectorLogic.ruleNamePlaceholder')}
                  style={inpStyle()} autoFocus />
              </div>
              <div>
                <label style={lblStyle}>{t('vectorLogic.ruleDescription')}</label>
                <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)}
                  placeholder={t('vectorLogic.ruleDescriptionPlaceholder')}
                  rows={6}
                  style={{ ...inpStyle(), fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5 }} />
                <p style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 6, lineHeight: 1.4 }}>
                  {t('vectorLogic.ruleDescriptionHint')}
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid var(--bd)' }}>
                <button style={btnStyle('ghost')} onClick={() => setShowForm(false)}>{t('common.cancel')}</button>
                <button style={btnStyle('primary')} onClick={save}>{t('common.save')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle = (variant = 'primary', extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
  borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer', border: 'none',
  fontFamily: 'inherit', transition: 'all .15s',
  ...(variant === 'primary' && { background: 'var(--ac)', color: '#fff' }),
  ...(variant === 'ghost' && { background: 'var(--sf2)', color: 'var(--tx3)', border: '1px solid var(--bd)' }),
  ...extra,
});

const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)',
  padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center',
};

const inpStyle = (extra = {}) => ({
  width: '100%', padding: '8px 12px', fontSize: 13, fontFamily: 'inherit',
  background: 'var(--sf2)', border: '1px solid var(--bd)',
  borderRadius: 8, color: 'var(--tx)', outline: 'none', ...extra,
});

const lblStyle = {
  fontSize: 10, fontWeight: 700, color: 'var(--tx3)',
  textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5,
};
