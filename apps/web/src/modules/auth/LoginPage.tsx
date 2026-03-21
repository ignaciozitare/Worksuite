import { useState } from 'react';
import { supabase } from '../shared/lib/api';

const REDIRECT_URL = `${window.location.origin}/`;

export function LoginPage() {
  const [email,    setEmail]    = useState(() => localStorage.getItem('ws_email') || '');
  const [pwd,      setPwd]      = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [remember, setRemember] = useState(!!localStorage.getItem('ws_email'));
  const [loading,  setLoading]  = useState(false);
  const [ssoLoading, setSsoLoading] = useState<'google'|'microsoft'|null>(null);
  const [error,    setError]    = useState('');

  // ── Email / password login ──────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (remember) localStorage.setItem('ws_email', email);
      else          localStorage.removeItem('ws_email');

      const { error: err } = await supabase.auth.signInWithPassword({ email, password: pwd });
      if (err) setError(err.message === 'Invalid login credentials'
        ? 'Email o contraseña incorrectos'
        : err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── SSO login ───────────────────────────────────────────────────
  const handleGoogle = async () => {
    setSsoLoading('google');
    setError('');
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: REDIRECT_URL },
    });
    if (err) { setError(err.message); setSsoLoading(null); }
  };

  const handleMicrosoft = async () => {
    setSsoLoading('microsoft');
    setError('');
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: REDIRECT_URL,
        scopes: 'openid profile email offline_access',
      },
    });
    if (err) { setError(err.message); setSsoLoading(null); }
  };

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <div style={styles.logoDot}/>
          <span style={{color:'#7b93ff',fontWeight:700}}>Work</span>
          <span style={{color:'#8888a8',fontWeight:300}}>Suite</span>
        </div>
        <div style={styles.subtitle}>Inicia sesión para continuar</div>

        {/* SSO buttons */}
        <div style={styles.ssoRow}>
          <button
            style={{...styles.ssoBtn, opacity: ssoLoading==='microsoft' ? 0.7 : 1}}
            onClick={handleMicrosoft}
            disabled={!!ssoLoading || loading}
          >
            {ssoLoading==='microsoft' ? (
              <Spinner color="#0078d4"/>
            ) : (
              <MicrosoftIcon/>
            )}
            <span>Continuar con Microsoft</span>
          </button>

          <button
            style={{...styles.ssoBtn, opacity: ssoLoading==='google' ? 0.7 : 1}}
            onClick={handleGoogle}
            disabled={!!ssoLoading || loading}
          >
            {ssoLoading==='google' ? (
              <Spinner color="#4285f4"/>
            ) : (
              <GoogleIcon/>
            )}
            <span>Continuar con Google</span>
          </button>
        </div>

        {/* Divider */}
        <div style={styles.divider}>
          <div style={styles.dividerLine}/>
          <span style={styles.dividerText}>o con email</span>
          <div style={styles.dividerLine}/>
        </div>

        {/* Email/password form */}
        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              autoComplete="email"
              placeholder="tu@empresa.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Contraseña</label>
            <div style={{position:'relative'}}>
              <input
                style={{...styles.input, paddingRight:40}}
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={pwd}
                onChange={e => setPwd(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPwd(s => !s)}
                style={styles.eyeBtn}
                tabIndex={-1}
              >
                {showPwd ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <div style={styles.rememberRow}>
            <label style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                style={{marginRight:6}}
              />
              Recordar email
            </label>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button
            type="submit"
            style={{...styles.submitBtn, opacity: loading ? 0.7 : 1}}
            disabled={loading || !!ssoLoading}
          >
            {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
    </svg>
  );
}

function Spinner({ color }: { color: string }) {
  return (
    <div style={{
      width: 16, height: 16, border: `2px solid ${color}33`,
      borderTop: `2px solid ${color}`, borderRadius: '50%',
      animation: 'spin 0.8s linear infinite', flexShrink: 0,
    }}/>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: '#0d0d10',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  card: {
    background: '#141418',
    border: '1px solid #2a2a38',
    borderRadius: 12,
    padding: '36px 32px',
    width: '100%',
    maxWidth: 400,
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: -0.5,
  },
  logoDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#4f6ef7',
    boxShadow: '0 0 10px #4f6ef7',
  },
  subtitle: {
    textAlign: 'center',
    color: '#50506a',
    fontSize: 13,
    marginTop: -10,
  },
  ssoRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  ssoBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 16px',
    background: '#1b1b22',
    border: '1px solid #2a2a38',
    borderRadius: 7,
    color: '#e4e4ef',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    width: '100%',
    fontFamily: 'inherit',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: '#2a2a38',
  },
  dividerText: {
    color: '#50506a',
    fontSize: 11,
    whiteSpace: 'nowrap',
    fontWeight: 500,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  label: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#50506a',
  },
  input: {
    width: '100%',
    background: '#1b1b22',
    border: '1px solid #2a2a38',
    borderRadius: 6,
    padding: '9px 12px',
    color: '#e4e4ef',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 15,
    padding: '2px 4px',
    color: '#50506a',
  },
  rememberRow: {
    display: 'flex',
    alignItems: 'center',
    marginTop: -4,
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 12,
    color: '#8888a8',
    cursor: 'pointer',
    userSelect: 'none',
  },
  error: {
    padding: '8px 12px',
    background: 'rgba(224,82,82,0.08)',
    border: '1px solid rgba(224,82,82,0.25)',
    borderRadius: 6,
    color: '#e05252',
    fontSize: 12,
  },
  submitBtn: {
    width: '100%',
    padding: '10px 0',
    background: '#4f6ef7',
    border: 'none',
    borderRadius: 7,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
    marginTop: 2,
  },
};

export default LoginPage;
