import { useState, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { authRepository } from './container';

const REDIRECT_URL = `${window.location.origin}/`;
const HERO_BREAKPOINT = 1024;

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
  const [isWide, setIsWide] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= HERO_BREAKPOINT : true,
  );

  useEffect(() => {
    authRepository
      .getSsoConfig()
      .then((config) => {
        if (config) { setGoogleOn(config.allowGoogle); setMicrosoftOn(config.allowMicrosoft); }
      })
      .finally(() => setSsoReady(true));
  }, []);

  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= HERO_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !pwd) {
      setError(t('auth.errorRequired'));
      return;
    }
    setLoading(true);
    try {
      if (remember) { localStorage.setItem('ws_email', email); localStorage.setItem('ws_remember', '1'); }
      else { localStorage.removeItem('ws_email'); localStorage.removeItem('ws_remember'); }
      const result = await authRepository.signInWithPassword(email, pwd);
      if (result.error) {
        setError(result.error);
      } else if (result.user) {
        setTimeout(() => { window.location.href = '/'; }, 100);
      }
    } catch {
      setError(t('auth.errorNetwork'));
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

  const showSso = ssoReady && (googleOn || microsoftOn);

  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .ws-input:focus{box-shadow:0 0 0 3px var(--ac-dim) !important}
        .ws-submit:hover:not(:disabled){box-shadow:0 6px 28px var(--ac-dim) !important;transform:translateY(-1px)}
        .ws-submit:active:not(:disabled){transform:scale(0.99)}
        .ws-sso:hover:not(:disabled){background:var(--sf3) !important}
      `}</style>

      {isWide && (
        <div style={S.leftPanel}>
          <div style={{
            position: 'absolute', top: '20%', left: '30%', width: 500, height: 500,
            background: 'var(--login-hero-glow-1)',
            filter: 'blur(60px)', pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', bottom: '10%', right: '20%', width: 300, height: 300,
            background: 'var(--login-hero-glow-2)',
            filter: 'blur(80px)', pointerEvents: 'none',
          }} />

          <div style={S.heroInner}>
            <div style={S.eyebrow}>{t('app.name').toUpperCase()}</div>
            <h1 style={S.headline}>{t('auth.tagline')}</h1>
            <p style={S.tagline}>{t('auth.taglineDesc')}</p>
          </div>
        </div>
      )}

      <div style={isWide ? S.rightPanelWide : S.rightPanelFull}>
        <div style={S.formContainer}>
          <div style={S.headerBlock}>
            <h2 style={S.title}>{t('auth.welcomeBack')}</h2>
            <p style={S.subtitle}>{t('auth.signInSubtitle')}</p>
          </div>

          <form onSubmit={handleLogin} style={S.form}>
            {error && (
              <div role="alert" style={S.errorBanner}>
                <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-md)' }}>error</span>
                <span>{error}</span>
              </div>
            )}

            <div style={S.field}>
              <label htmlFor="login-email" style={S.lbl}>{t('auth.email')}</label>
              <input
                id="login-email"
                className="ws-input"
                style={S.input}
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div style={S.field}>
              <label htmlFor="login-pwd" style={S.lbl}>{t('auth.password')}</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-pwd"
                  className="ws-input"
                  style={{ ...S.input, paddingRight: 44 }}
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  aria-label={showPwd ? t('auth.hidePassword') : t('auth.showPassword')}
                  style={S.pwdToggle}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-md)' }}>
                    {showPwd ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="ws-submit"
              style={S.submit}
              disabled={loading || !!ssoLoading}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <SpinIcon /> {t('auth.signingIn')}
                </span>
              ) : t('auth.login')}
            </button>
          </form>

          {showSso && (
            <div style={S.ssoBlock}>
              <div style={S.divider}>
                <div style={S.divLine} />
                <span style={S.divTxt}>{t('auth.orContinueWith')}</span>
                <div style={S.divLine} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {microsoftOn && (
                  <button
                    type="button"
                    className="ws-sso"
                    onClick={handleMicrosoft}
                    disabled={!!ssoLoading || loading}
                    style={S.ssoBtn}
                  >
                    {ssoLoading === 'microsoft' ? <SpinIcon /> : <MsIcon />}
                    Microsoft
                  </button>
                )}
                {googleOn && (
                  <button
                    type="button"
                    className="ws-sso"
                    onClick={handleGoogle}
                    disabled={!!ssoLoading || loading}
                    style={S.ssoBtn}
                  >
                    {ssoLoading === 'google' ? <SpinIcon /> : <GgIcon />}
                    Google
                  </button>
                )}
              </div>
            </div>
          )}

          <div style={S.footer}>
            {t('auth.noAccount')}{' '}
            <span style={S.footerAccent}>{t('auth.contactAdmin')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

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

const S: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    fontFamily: "'Inter', system-ui, sans-serif",
    background: 'var(--bg)',
  },
  leftPanel: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    position: 'relative',
    overflow: 'hidden',
    background: 'var(--login-hero-gradient)',
  },
  heroInner: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 24,
    maxWidth: 480,
    animation: 'fadeUp .6s ease forwards',
    textAlign: 'center',
  },
  eyebrow: {
    fontSize: 'var(--fs-2xs)',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: 'var(--ac-strong)',
  },
  headline: {
    fontSize: 'var(--fs-display)',
    fontWeight: 600,
    color: 'var(--tx)',
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
    margin: 0,
    whiteSpace: 'pre-line',
  },
  tagline: {
    fontSize: 'var(--fs-body)',
    fontWeight: 400,
    color: 'var(--tx2)',
    lineHeight: 1.6,
    margin: 0,
    maxWidth: 400,
  },
  rightPanelWide: {
    width: 480,
    minWidth: 480,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    background: 'var(--sf-lowest)',
  },
  rightPanelFull: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    background: 'var(--sf-lowest)',
  },
  formContainer: {
    width: '100%',
    maxWidth: 384,
    display: 'flex',
    flexDirection: 'column',
    gap: 32,
    animation: 'fadeUp .5s ease forwards',
  },
  headerBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  title: {
    fontSize: 'var(--fs-xl)',
    fontWeight: 600,
    color: 'var(--tx)',
    letterSpacing: '-0.02em',
    margin: 0,
  },
  subtitle: {
    fontSize: 'var(--fs-sm)',
    fontWeight: 400,
    color: 'var(--tx2)',
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: 'var(--red-dim)',
    color: 'var(--red)',
    borderRadius: 8,
    fontSize: 'var(--fs-xs)',
    fontWeight: 500,
    border: 'none',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  lbl: {
    fontSize: 'var(--fs-xs)',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--tx2)',
  },
  input: {
    width: '100%',
    background: 'var(--sf)',
    border: 'none',
    outline: 'none',
    borderRadius: 8,
    padding: '10px 14px',
    color: 'var(--tx)',
    fontSize: 'var(--fs-sm)',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    transition: 'box-shadow 0.15s',
  },
  pwdToggle: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    color: 'var(--tx3)',
    display: 'flex',
    borderRadius: 4,
  },
  submit: {
    width: '100%',
    padding: '10px 20px',
    background: 'linear-gradient(135deg, var(--ac), var(--ac-strong))',
    border: 'none',
    borderRadius: 12,
    color: 'var(--ac-on)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 12px var(--ac-dim)',
  },
  ssoBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  divLine: { flex: 1, height: 1, background: 'var(--bd)' },
  divTxt: {
    color: 'var(--tx3)',
    fontSize: 'var(--fs-2xs)',
    whiteSpace: 'nowrap',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  ssoBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 14px',
    background: 'var(--sf2)',
    border: 'none',
    borderRadius: 8,
    fontSize: 'var(--fs-xs)',
    fontWeight: 500,
    color: 'var(--tx)',
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  footer: {
    textAlign: 'center',
    fontSize: 'var(--fs-xs)',
    color: 'var(--tx3)',
  },
  footerAccent: {
    color: 'var(--ac-strong)',
    fontWeight: 500,
  },
};

export default LoginPage;
