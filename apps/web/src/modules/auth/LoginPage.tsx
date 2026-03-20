import { useState, type FormEvent } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';

export function LoginPage(): JSX.Element {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
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
            <input style={S.input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com"/>
          </div>
          <div style={S.field}>
            <label style={S.label}>Password</label>
            <input style={S.input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••"/>
          </div>
          {error && <div style={S.error}>{error}</div>}
          <button style={S.btn} type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root:      { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0d10', padding: 16 },
  card:      { width: '100%', maxWidth: 380, background: '#141418', border: '1px solid #2a2a38', borderRadius: 12, padding: '36px 32px', boxShadow: '0 8px 30px rgba(0,0,0,.55)' },
  logo:      { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, justifyContent: 'center' },
  dot:       { width: 8, height: 8, borderRadius: '50%', background: '#4f6ef7', boxShadow: '0 0 10px #4f6ef7' },
  logoJt:    { fontSize: 22, fontWeight: 700, color: '#7b93ff', letterSpacing: '-0.5px' },
  logoSuite: { fontSize: 22, fontWeight: 300, color: '#8888a8', letterSpacing: '-0.5px' },
  sub:       { textAlign: 'center', color: '#50506a', fontSize: 13, margin: '0 0 28px' },
  form:      { display: 'flex', flexDirection: 'column', gap: 16 },
  field:     { display: 'flex', flexDirection: 'column', gap: 6 },
  label:     { fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#50506a' },
  input:     { background: '#1b1b22', border: '1px solid #2a2a38', borderRadius: 6, padding: '9px 12px', color: '#e4e4ef', fontSize: 13, outline: 'none', fontFamily: 'inherit' },
  error:     { background: 'rgba(224,82,82,.08)', border: '1px solid rgba(224,82,82,.25)', borderRadius: 6, padding: '8px 12px', color: '#e05252', fontSize: 12 },
  btn:       { background: '#4f6ef7', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, padding: '10px 0', cursor: 'pointer', marginTop: 4 },
};
