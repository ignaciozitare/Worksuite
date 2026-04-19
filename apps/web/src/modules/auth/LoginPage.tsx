import { useState, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { authRepository } from './container';

const REDIRECT_URL = `${window.location.origin}/`;

export function LoginPage() {
  const { t } = useTranslation();
  const [email,    setEmail]    = useState(() => localStorage.getItem('ws_email') || '');
  const [pwd,      setPwd]      = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [remember, setRemember] = useState(!!localStorage.getItem('ws_email'));
  const [loading,  setLoading]  = useState(false);
  const [ssoLoading, setSsoLoading] = useState<'google'|'microsoft'|null>(null);
  const [error,    setError]    = useState('');
  const [ssoReady,    setSsoReady]    = useState(false);
  const [googleOn,    setGoogleOn]    = useState(false);
  const [microsoftOn, setMicrosoftOn] = useState(false);

  useEffect(() => {
    authRepository
      .getSsoConfig()
      .then((config) => {
        if (config) { setGoogleOn(config.allowGoogle); setMicrosoftOn(config.allowMicrosoft); }
      })
      .finally(() => setSsoReady(true));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (remember) { localStorage.setItem('ws_email', email); localStorage.setItem('ws_remember', '1'); }
      else { localStorage.removeItem('ws_email'); localStorage.removeItem('ws_remember'); }
      const result = await authRepository.signInWithPassword(email, pwd);
      if (result.error) {
        setError(result.error);
      } else if (result.user) {
        setTimeout(() => { window.location.href = '/'; }, 100);
      }
    } finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    if (!googleOn) return;
    setSsoLoading('google'); setError('');
    const { error: err } = await authRepository.signInWithOAuth('google', REDIRECT_URL);
    if (err) { setError(err); setSsoLoading(null); }
  };

  const handleMicrosoft = async () => {
    if (!microsoftOn) return;
    setSsoLoading('microsoft'); setError('');
    const { error: err } = await authRepository.signInWithOAuth('azure', REDIRECT_URL);
    if (err) { setError(err); setSsoLoading(null); }
  };

  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glowPulse{0%,100%{opacity:.3}50%{opacity:.6}}
        .ws-input:focus{border-color:var(--ac) !important;box-shadow:0 0 0 3px var(--ac-dim) !important}
        .ws-submit:hover:not(:disabled){box-shadow:0 6px 28px var(--ac-dim) !important;transform:translateY(-1px)}
        .ws-submit:active:not(:disabled){transform:scale(0.99)}
        .ws-sso:hover:not(:disabled){border-color:var(--bd2) !important;background:var(--sf2) !important}
      `}</style>

      {/* ═══ Left panel — branding ═══ */}
      <div style={S.leftPanel}>
        {/* Ambient glow */}
        {/* Deep blue ambient glow */}
        <div style={{
          position: 'absolute', top: '20%', left: '30%', width: 500, height: 500,
          background: 'radial-gradient(circle, rgba(30,60,140,.35) 0%, rgba(15,30,80,.15) 40%, transparent 70%)',
          filter: 'blur(60px)', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '10%', right: '20%', width: 300, height: 300,
          background: 'radial-gradient(circle, rgba(77,142,255,.12) 0%, transparent 60%)',
          filter: 'blur(80px)', pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1, animation: 'fadeUp .6s ease forwards' }}>
          {/* Tag */}
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase',
            color: 'var(--ac2)', marginBottom: 16,
          }}>
            WORKSUITE
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: 42, fontWeight: 700, color: 'var(--tx)', lineHeight: 1.15,
            letterSpacing: '-0.03em', margin: 0,
          }}>
            {t('auth.tagline')}
          </h1>

          {/* Subtitle */}
          <p style={{
            fontSize: 14, color: 'var(--tx3)', lineHeight: 1.7, marginTop: 20, maxWidth: 380,
          }}>
            {t('auth.taglineDesc')}
          </p>
        </div>
      </div>

      {/* ═══ Right panel — form ═══ */}
      <div style={S.rightPanel}>
        <div style={{ width: '100%', maxWidth: 380, animation: 'fadeUp .5s ease forwards' }}>
          {/* Title */}
          <h2 style={{
            fontSize: 24, fontWeight: 700, color: 'var(--tx)', letterSpacing: '-0.02em',
            marginBottom: 4,
          }}>
            {t('auth.welcomeBack')}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--tx3)', marginBottom: 28 }}>
            {t('auth.signInSubtitle')}
          </p>

          {/* Form */}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={S.field}>
              <label style={S.lbl}>{t('auth.email')}</label>
              <input className="ws-input" style={S.input} type="email" autoComplete="email"
                placeholder="you@company.com" value={email}
                onChange={e => setEmail(e.target.value)} required />
            </div>

            <div style={S.field}>
              <label style={S.lbl}>{t('auth.password')}</label>
              <div style={{ position: 'relative' }}>
                <input className="ws-input" style={{ ...S.input, paddingRight: 40 }}
                  type={showPwd ? 'text' : 'password'} autoComplete="current-password"
                  placeholder="••••••••" value={pwd}
                  onChange={e => setPwd(e.target.value)} required />
                <button type="button" onClick={() => setShowPwd(s => !s)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                    color: 'var(--tx3)', display: 'flex', borderRadius: 4,
                  }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    {showPwd ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', background: 'var(--red-dim)',
                border: '1px solid var(--red)', borderRadius: 8, color: 'var(--red)',
                fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
                {error}
              </div>
            )}

            <button type="submit" className="ws-submit" style={S.submit} disabled={loading || !!ssoLoading}>
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <SpinIcon /> {t('auth.signingIn')}
                </span>
              ) : t('auth.login')}
            </button>
          </form>

          {/* SSO */}
          {ssoReady && (googleOn || microsoftOn) && (
            <>
              <div style={S.divider}>
                <div style={S.divLine} /><span style={S.divTxt}>{t('auth.orContinueWith')}</span><div style={S.divLine} />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                {microsoftOn && (
                  <button className="ws-sso" onClick={handleMicrosoft}
                    disabled={!!ssoLoading || loading} style={S.ssoBtn}>
                    {ssoLoading === 'microsoft' ? <SpinIcon /> : <MsIcon />}
                    Microsoft
                  </button>
                )}
                {googleOn && (
                  <button className="ws-sso" onClick={handleGoogle}
                    disabled={!!ssoLoading || loading} style={S.ssoBtn}>
                    {ssoLoading === 'google' ? <SpinIcon /> : <GgIcon />}
                    Google
                  </button>
                )}
              </div>
            </>
          )}

          {/* Footer link */}
          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--tx3)' }}>
            {t('auth.noAccount')}{' '}
            <span style={{ color: 'var(--ac2)', cursor: 'pointer', fontWeight: 600 }}>
              {t('auth.employeeAdmin')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Icons ──────────────────────────────────────────────────────── */
function GgIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function MsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function SpinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ── Styles ──────────────────────────────────────────────────────── */
const S: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh', display: 'flex',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  leftPanel: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '60px 40px', position: 'relative', overflow: 'hidden',
    background: 'linear-gradient(135deg, #0a0a14 0%, #0d1528 40%, #111d3a 70%, #0a1225 100%)',
  },
  rightPanel: {
    width: 480, minWidth: 480, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '60px 50px', background: '#10111a',
    borderLeft: '1px solid rgba(255,255,255,.06)',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  lbl: {
    fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
    color: 'var(--tx3)',
  },
  input: {
    width: '100%', background: 'var(--sf2)', border: '1px solid var(--bd)',
    borderRadius: 8, padding: '11px 14px', color: 'var(--tx)', fontSize: 13,
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  submit: {
    width: '100%', padding: '12px 0',
    background: 'linear-gradient(135deg, var(--ac2), var(--ac-strong))',
    border: 'none', borderRadius: 8, color: 'var(--ac-on)', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease',
    boxShadow: '0 4px 20px var(--ac-dim)',
  },
  divider: {
    display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0',
  },
  divLine: { flex: 1, height: 1, background: 'var(--bd)' },
  divTxt: {
    color: 'var(--tx3)', fontSize: 11, whiteSpace: 'nowrap', fontWeight: 500,
    letterSpacing: '.04em', textTransform: 'uppercase',
  },
  ssoBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '10px 14px', background: 'var(--sf2)', border: '1px solid var(--bd)',
    borderRadius: 8, fontSize: 13, fontWeight: 500, color: 'var(--tx)',
    fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s',
  },
};

export default LoginPage;
