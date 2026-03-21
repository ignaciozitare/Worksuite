import { useState, type FormEvent } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';

export function LoginPage(): JSX.Element {
  const { login } = useAuth();
  const [email, setEmail] = useState(() => localStorage.getItem('ws_remembered_email') ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem('ws_remembered_email'));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (rememberMe) {
        localStorage.setItem('ws_remembered_email', email);
      } else {
        localStorage.removeItem('ws_remembered_email');
      }
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.root}>
      <div style={S.card}>
        <div style={S.logo}>
          <div style={S.dot} />
          <span style={S.logoJt}>Work</span>
          <span style={S.logoSuite}>Suite</span>
        </div>
        <p style={S.sub}>Sign in to your workspace</p>
        <form onSubmit={(e) => { void handleSubmit(e); }} style={S.form}>
          <div style={S.field}>
            <label style={S.label}>Email</label>
            <input
              style={S.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
            />
          </div>
          <div style={S.field}>
            <label style={S.label}>Password</label>
            <div style={S.passwordWrap}>
              <input
                style={{ ...S.input, paddingRight: 40 }}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={S.eyeBtn}
                tabIndex={-1}
                title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? (
                  // Eye-off icon
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  // Eye icon
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Remember me */}
          <label style={S.rememberRow}>
            <div
              style={{ ...S.checkbox, ...(rememberMe ? S.checkboxOn : {}) }}
              onClick={() => setRememberMe(v => !v)}
            >
              {rememberMe && (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2,6 5,9 10,3"/>
                </svg>
              )}
            </div>
            <span
              style={S.rememberLabel}
              onClick={() => setRememberMe(v => !v)}
            >
              Recordar email
            </span>
          </label>

          {error && <div style={S.error}>{error}</div>}
          <button style={{ ...S.btn, ...(loading ? S.btnDisabled : {}) }} type="submit" disabled={loading}>
            {loading ? 'Iniciando sesión…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root:         { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0d10', padding: 16 },
  card:         { width: '100%', maxWidth: 380, background: '#141418', border: '1px solid #2a2a38', borderRadius: 12, padding: '36px 32px', boxShadow: '0 8px 30px rgba(0,0,0,.55)' },
  logo:         { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, justifyContent: 'center' },
  dot:          { width: 8, height: 8, borderRadius: '50%', background: '#4f6ef7', boxShadow: '0 0 10px #4f6ef7' },
  logoJt:       { fontSize: 22, fontWeight: 700, color: '#7b93ff', letterSpacing: '-0.5px' },
  logoSuite:    { fontSize: 22, fontWeight: 300, color: '#8888a8', letterSpacing: '-0.5px' },
  sub:          { textAlign: 'center', color: '#50506a', fontSize: 13, margin: '0 0 28px' },
  form:         { display: 'flex', flexDirection: 'column', gap: 16 },
  field:        { display: 'flex', flexDirection: 'column', gap: 6 },
  label:        { fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#50506a' },
  input:        { background: '#1b1b22', border: '1px solid #2a2a38', borderRadius: 6, padding: '9px 12px', color: '#e4e4ef', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  passwordWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  eyeBtn:       { position: 'absolute', right: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#50506a', padding: 2, display: 'flex', alignItems: 'center', transition: 'color .15s' },
  rememberRow:  { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' },
  checkbox:     { width: 16, height: 16, borderRadius: 4, border: '1.5px solid #2a2a38', background: '#1b1b22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', transition: 'all .15s' },
  checkboxOn:   { background: '#4f6ef7', borderColor: '#4f6ef7' },
  rememberLabel:{ fontSize: 12, color: '#8888a8', cursor: 'pointer' },
  error:        { background: 'rgba(224,82,82,.08)', border: '1px solid rgba(224,82,82,.25)', borderRadius: 6, padding: '8px 12px', color: '#e05252', fontSize: 12 },
  btn:          { background: '#4f6ef7', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, padding: '10px 0', cursor: 'pointer', marginTop: 4, transition: 'opacity .15s' },
  btnDisabled:  { opacity: 0.6, cursor: 'not-allowed' },
};
