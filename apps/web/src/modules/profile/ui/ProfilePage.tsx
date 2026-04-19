// @ts-nocheck
import { useTranslation } from '@worksuite/i18n';
import { useAuth } from '@/shared/hooks/useAuth';

const C = {
  bg: 'var(--bg)', sf: 'var(--sf)', sfHover: 'var(--sf2)', bd: 'var(--bd)',
  amber: 'var(--amber)', amberDim: 'var(--sf-low, #1c1b1b)', amberGlow: 'var(--amber-dim)',
  tx: 'var(--tx)', txDim: 'var(--tx2)', txMuted: 'var(--tx3)',
};

export function ProfilePage() {
  const { t, locale, setLocale } = useTranslation();
  const { user } = useAuth();

  if (!user) return null;

  const fields: { labelKey: string; value: string | null | undefined }[] = [
    { labelKey: 'profile.name',     value: user.name },
    { labelKey: 'profile.email',    value: user.email },
    { labelKey: 'profile.role',     value: user.role },
    { labelKey: 'profile.deskType', value: (user as any).desk_type },
  ];

  return (
    <div style={{
      padding: '32px 40px', minHeight: '100%', background: C.bg, color: C.tx,
      fontFamily: "'IBM Plex Sans', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap');
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.tx }}>
          {t('profile.title')}
        </div>
        <div style={{ fontSize: 12, color: C.txDim, marginTop: 4 }}>
          {t('profile.subtitle')}
        </div>
      </div>

      {/* Identity card */}
      <div style={{
        background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10,
        padding: 28, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 24,
      }}>
        <div style={{
          width: 96, height: 96, borderRadius: '50%',
          background: `linear-gradient(135deg,${C.amberDim},${C.bd})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, fontWeight: 700, color: C.amber,
          fontFamily: "'IBM Plex Mono',monospace",
          boxShadow: `0 0 40px ${C.amberGlow}`,
        }}>
          {(user.name || user.email || '?').charAt(0).toUpperCase()}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.tx, marginBottom: 4 }}>
            {user.name || user.email}
          </div>
          <div style={{ fontSize: 13, color: C.txDim }}>
            {user.email}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 4,
              background: C.amberGlow, color: C.amber, textTransform: 'uppercase',
              letterSpacing: '.08em', fontFamily: "'IBM Plex Mono',monospace",
            }}>
              {user.role || 'user'}
            </span>
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div style={{
        background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 24,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.amber, textTransform: 'uppercase',
          letterSpacing: '.1em', marginBottom: 18, fontFamily: "'IBM Plex Mono',monospace",
        }}>
          {t('profile.detailsSection')}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {fields.map(f => (
            <div key={f.labelKey}>
              <div style={{
                fontSize: 10, color: C.txMuted, textTransform: 'uppercase',
                letterSpacing: '.08em', marginBottom: 6, fontWeight: 600,
              }}>
                {t(f.labelKey)}
              </div>
              <div style={{
                fontSize: 13, color: C.tx, fontFamily: "'IBM Plex Mono',monospace",
              }}>
                {f.value || '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Language selector */}
      <div style={{
        marginTop: 24, background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 24,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.amber, textTransform: 'uppercase',
          letterSpacing: '.1em', marginBottom: 8, fontFamily: "'IBM Plex Mono',monospace",
        }}>
          {t('profile.languageSection')}
        </div>
        <div style={{ fontSize: 12, color: C.txDim, marginBottom: 16 }}>
          {t('profile.languageHelp')}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setLocale('en')}
            style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'pointer', transition: 'all .15s',
              background: locale === 'en' ? `linear-gradient(135deg, var(--ac2), var(--ac-strong))` : C.sfHover,
              color: locale === 'en' ? 'var(--ac-on)' : C.tx,
              boxShadow: locale === 'en' ? `0 0 12px var(--ac-dim)` : 'none',
              fontFamily: "'IBM Plex Mono',monospace",
            }}
          >
            EN
          </button>
          <button
            onClick={() => setLocale('es')}
            style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'pointer', transition: 'all .15s',
              background: locale === 'es' ? `linear-gradient(135deg, var(--ac2), var(--ac-strong))` : C.sfHover,
              color: locale === 'es' ? 'var(--ac-on)' : C.tx,
              boxShadow: locale === 'es' ? `0 0 12px var(--ac-dim)` : 'none',
              fontFamily: "'IBM Plex Mono',monospace",
            }}
          >
            ES
          </button>
        </div>
      </div>

      {/* Future: stats / hours / etc. */}
      <div style={{
        marginTop: 24, padding: 20, background: C.sf, border: `1px dashed ${C.bd}`,
        borderRadius: 10, textAlign: 'center', color: C.txMuted, fontSize: 12,
      }}>
        {t('profile.comingSoon')}
      </div>
    </div>
  );
}
