import { useState, useEffect } from 'react';
import { supabase } from '../../shared/lib/api';

const REDIRECT_URL = `${window.location.origin}/`;

export function LoginPage() {
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
    supabase
      .from('sso_config')
      .select('allow_google, allow_microsoft')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (data) { setGoogleOn(!!data.allow_google); setMicrosoftOn(!!data.allow_microsoft); }
      })
      .finally(() => setSsoReady(true));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (remember) localStorage.setItem('ws_email', email);
      else localStorage.removeItem('ws_email');
      const { data, error: err } = await supabase.auth.signInWithPassword({ email, password: pwd });
      if (err) {
        setError(err.message === 'Invalid login credentials' ? 'Invalid email or password' : err.message);
      } else if (data?.session) {
        // Navigate to root so React Router re-evaluates the protected route
        window.location.href = '/';
      }
    } finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    if (!googleOn) return;
    setSsoLoading('google'); setError('');
    const { error: err } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: REDIRECT_URL } });
    if (err) { setError(err.message); setSsoLoading(null); }
  };

  const handleMicrosoft = async () => {
    if (!microsoftOn) return;
    setSsoLoading('microsoft'); setError('');
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { redirectTo: REDIRECT_URL, scopes: 'openid profile email offline_access' },
    });
    if (err) { setError(err.message); setSsoLoading(null); }
  };

  return (
    <div style={S.root}>
      <style>{`
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .ws-btn:hover:not(:disabled){background:#1e1e2e!important;border-color:#3a3a52!important}
        .ws-btn:focus-visible{outline:2px solid #4f6ef7;outline-offset:2px}
        .ws-input:focus{border-color:#4f6ef7!important;box-shadow:0 0 0 3px rgba(79,110,247,0.15)!important}
        .ws-submit:hover:not(:disabled){background:#3d5ef0!important}
        .ws-submit:active:not(:disabled){transform:scale(0.99)}
        .ws-eye:hover{color:#8888a8!important}
      `}</style>

      <div style={S.card}>
        {/* Logo */}
        <div style={S.logo}>
          <div style={S.dot}/>
          <span style={{color:'#7b93ff',fontWeight:700}}>Work</span>
          <span style={{color:'#8888a8',fontWeight:300}}>Suite</span>
        </div>
        <p style={S.subtitle}>Sign in to your account</p>

        {/* SSO — skeleton while loading */}
        {!ssoReady ? (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {[0,1].map(i=>(
              <div key={i} style={{height:42,borderRadius:7,
                background:'linear-gradient(90deg,#1b1b22 25%,#252530 50%,#1b1b22 75%)',
                backgroundSize:'200% 100%',animation:'shimmer 1.4s infinite'}}/>
            ))}
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {/* Microsoft */}
            <button className="ws-btn" onClick={handleMicrosoft}
              disabled={!microsoftOn||!!ssoLoading||loading}
              title={!microsoftOn?'Not configured — contact your administrator':undefined}
              style={{...S.ssoBtn,opacity:microsoftOn?1:0.35,cursor:microsoftOn?'pointer':'not-allowed',
                background:microsoftOn?'#1b1b22':'#161619',borderColor:microsoftOn?'var(--bd2)':'var(--bd)'}}>
              {ssoLoading==='microsoft'?<SpinIcon/>:<MsIcon/>}
              <span style={{color:microsoftOn?'var(--tx)':'var(--tx3)',flex:1,textAlign:'left'}}>
                Continue with Microsoft
              </span>
              {!microsoftOn&&<span style={S.badge}>Unavailable</span>}
            </button>
            {/* Google */}
            <button className="ws-btn" onClick={handleGoogle}
              disabled={!googleOn||!!ssoLoading||loading}
              title={!googleOn?'Not configured — contact your administrator':undefined}
              style={{...S.ssoBtn,opacity:googleOn?1:0.35,cursor:googleOn?'pointer':'not-allowed',
                background:googleOn?'#1b1b22':'#161619',borderColor:googleOn?'var(--bd2)':'var(--bd)'}}>
              {ssoLoading==='google'?<SpinIcon/>:<GgIcon/>}
              <span style={{color:googleOn?'var(--tx)':'var(--tx3)',flex:1,textAlign:'left'}}>
                Continue with Google
              </span>
              {!googleOn&&<span style={S.badge}>Unavailable</span>}
            </button>
          </div>
        )}

        {/* Divider — only if at least one SSO active */}
        {ssoReady&&(googleOn||microsoftOn)&&(
          <div style={S.divider}>
            <div style={S.divLine}/><span style={S.divTxt}>or with email</span><div style={S.divLine}/>
          </div>
        )}
        {ssoReady&&!(googleOn||microsoftOn)&&(
          <div style={S.divider}><div style={S.divLine}/></div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={S.field}>
            <label style={S.lbl}>Email</label>
            <input className="ws-input" style={S.input} type="email" autoComplete="email"
              placeholder="you@company.com" value={email}
              onChange={e=>setEmail(e.target.value)} required/>
          </div>

          <div style={S.field}>
            <label style={S.lbl}>Password</label>
            <div style={{position:'relative'}}>
              <input className="ws-input" style={{...S.input,paddingRight:40}}
                type={showPwd?'text':'password'} autoComplete="current-password"
                placeholder="••••••••" value={pwd}
                onChange={e=>setPwd(e.target.value)} required/>
              <button type="button" className="ws-eye"
                onClick={()=>setShowPwd(s=>!s)}
                style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',
                  background:'none',border:'none',cursor:'pointer',padding:'4px',
                  color:'var(--tx3)',display:'flex',alignItems:'center',justifyContent:'center',
                  borderRadius:4,transition:'color 0.15s'}}>
                {showPwd ? <EyeOffIcon/> : <EyeIcon/>}
              </button>
            </div>
          </div>

          <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#8888a8',
            cursor:'pointer',userSelect:'none',marginTop:-4}}>
            <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}
              style={{width:14,height:14,accentColor:'#4f6ef7',cursor:'pointer'}}/>
            Remember email
          </label>

          {error&&(
            <div style={{padding:'9px 12px',background:'rgba(224,82,82,0.08)',
              border:'1px solid rgba(224,82,82,0.22)',borderRadius:6,color:'#e05252',fontSize:12,
              display:'flex',alignItems:'center',gap:8}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <button type="submit" className="ws-submit"
            style={{...S.submit,opacity:loading?0.7:1}}
            disabled={loading||!!ssoLoading}>
            {loading?(
              <span style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                <SpinIcon/> Signing in…
              </span>
            ):'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── SVG Icons (professional, no emojis) ──────────────────────────

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function GgIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function MsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" fill="none" style={{flexShrink:0}}>
      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
    </svg>
  );
}

function SpinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      style={{animation:'spin 0.8s linear infinite',flexShrink:0}}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh', background: 'var(--bg, #0d0d10)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16, fontFamily: "'Inter', system-ui, sans-serif",
  },
  card: {
    background: 'var(--sf, #141418)', border: '1px solid var(--bd, #252530)',
    borderRadius: 14, padding: '40px 36px', width: '100%', maxWidth: 400,
    boxShadow: '0 24px 64px rgba(0,0,0,0.65)',
    display: 'flex', flexDirection: 'column', gap: 22,
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: 8,
    justifyContent: 'center', fontSize: 24, fontWeight: 700, letterSpacing: -0.5,
  },
  dot: { width: 10, height: 10, borderRadius: '50%', background: '#4f6ef7', boxShadow: '0 0 12px #4f6ef7' },
  subtitle: { textAlign: 'center', color: 'var(--tx3, #50506a)', fontSize: 13, margin: '-12px 0 -4px' },
  ssoBtn: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 14px', width: '100%',
    border: '1px solid', borderRadius: 8, fontSize: 13, fontWeight: 500,
    fontFamily: 'inherit', transition: 'all 0.15s ease',
  },
  badge: {
    fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
    color: '#2a2a3a', textTransform: 'uppercase',
  },
  divider: { display: 'flex', alignItems: 'center', gap: 12, margin: '-4px 0' },
  divLine: { flex: 1, height: 1, background: 'var(--bd, #202028)' },
  divTxt: { color: 'var(--tx3, #40404e)', fontSize: 11, whiteSpace: 'nowrap', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  lbl: { fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--tx3, #50506a)' },
  input: {
    width: '100%', background: 'var(--sf2, #1b1b22)', border: '1px solid var(--bd, #252530)',
    borderRadius: 7, padding: '9px 12px', color: '#e4e4ef', fontSize: 13,
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  submit: {
    width: '100%', padding: '11px 0', background: '#4f6ef7', border: 'none',
    borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s ease',
    marginTop: 2, letterSpacing: '0.01em',
  },
};

export default LoginPage;
