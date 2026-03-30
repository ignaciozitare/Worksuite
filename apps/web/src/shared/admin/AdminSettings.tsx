// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { supabase } from '../lib/api';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function SSOConfig() {
  const [cfg, setCfg] = useState({ ad_group_id: '', ad_group_name: '', allow_google: true, allow_microsoft: true });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [ok,      setOk]      = useState('');
  const [err,     setErr]     = useState('');

  useEffect(() => {
    supabase.from('sso_config').select('*').eq('id', 1).single()
      .then(({ data }) => {
        if (data) setCfg({
          ad_group_id:   data.ad_group_id   ?? '',
          ad_group_name: data.ad_group_name ?? '',
          allow_google:      data.allow_google      ?? true,
          allow_microsoft:   data.allow_microsoft   ?? true,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true); setErr(''); setOk('');
    const { error } = await supabase.from('sso_config').update({
      ad_group_id:   cfg.ad_group_id.trim()   || null,
      ad_group_name: cfg.ad_group_name.trim() || null,
      allow_google:      cfg.allow_google,
      allow_microsoft:   cfg.allow_microsoft,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    if (error) setErr(error.message);
    else { setOk('\u2713 Configuraci\u00f3n guardada'); setTimeout(() => setOk(''), 3000); }
    setSaving(false);
  };

  if (loading) return <div style={{color:'var(--tx3)',fontSize:12}}>Cargando...</div>;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>

      {/* Providers habilitados */}
      <div>
        <div className="a-lbl" style={{marginBottom:10}}>Providers habilitados</div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {[
            { key:'allow_microsoft', icon:'🏢', label:'Microsoft / Azure AD', desc:'Login con cuenta corporativa Microsoft 365' },
            { key:'allow_google',    icon:'🌐', label:'Google',               desc:'Login con cuenta Google' },
          ].map(({ key, icon, label, desc }) => (
            <div key={key}
              onClick={() => setCfg(c => ({ ...c, [key]: !c[key] }))}
              style={{
                display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                background:'var(--sf2)', borderRadius:'var(--r)',
                border:`1px solid ${cfg[key] ? 'rgba(62,207,142,.3)' : 'var(--bd)'}`,
                cursor:'pointer', transition:'var(--ease)',
              }}>
              <div style={{
                width:18, height:18, borderRadius:4, flexShrink:0,
                background: cfg[key] ? 'var(--green)' : 'transparent',
                border: `2px solid ${cfg[key] ? 'var(--green)' : 'var(--bd2)'}`,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                {cfg[key] && <span style={{color:'#fff',fontSize:11,fontWeight:700,lineHeight:1}}>\u2713</span>}
              </div>
              <span style={{fontSize:16}}>{icon}</span>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:'var(--tx)'}}>{label}</div>
                <div style={{fontSize:11,color:'var(--tx3)'}}>{desc}</div>
              </div>
              <div style={{marginLeft:'auto',fontSize:10,fontWeight:700,
                color: cfg[key] ? 'var(--green)' : 'var(--tx3)'}}>
                {cfg[key] ? 'ACTIVO' : 'INACTIVO'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grupo AD */}
      {cfg.allow_microsoft && (
        <div>
          <div className="a-lbl" style={{marginBottom:6}}>Restricci\u00f3n por grupo de Azure AD</div>
          <div style={{fontSize:11,color:'var(--tx3)',marginBottom:10,lineHeight:1.6}}>
            Solo los usuarios que pertenezcan a este grupo podr\u00e1n acceder con Microsoft.
            Deja en blanco para permitir cualquier cuenta de tu tenant.
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <div>
              <div style={{fontSize:10,color:'var(--tx3)',marginBottom:4}}>Object ID del grupo</div>
              <input className="a-inp" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={cfg.ad_group_id}
                onChange={e => setCfg(c => ({ ...c, ad_group_id: e.target.value }))}
                style={{fontFamily:'var(--mono)',fontSize:12}}/>
              <div style={{fontSize:10,color:'var(--tx3)',marginTop:4}}>
                Azure Portal \u2192 Azure Active Directory \u2192 Groups \u2192 [tu grupo] \u2192 Object ID
              </div>
            </div>
            <div>
              <div style={{fontSize:10,color:'var(--tx3)',marginBottom:4}}>Nombre del grupo (referencia)</div>
              <input className="a-inp" placeholder="ej. WorkSuite-Users"
                value={cfg.ad_group_name}
                onChange={e => setCfg(c => ({ ...c, ad_group_name: e.target.value }))}/>
            </div>
          </div>
          {cfg.ad_group_id && (
            <div style={{marginTop:10,padding:'8px 12px',background:'rgba(62,207,142,.06)',
              border:'1px solid rgba(62,207,142,.2)',borderRadius:'var(--r)',fontSize:11,color:'var(--green)'}}>
              \u2713 Solo usuarios del grupo <strong>{cfg.ad_group_name || cfg.ad_group_id}</strong> podr\u00e1n entrar con Microsoft
            </div>
          )}
          {!cfg.ad_group_id && (
            <div style={{marginTop:10,padding:'8px 12px',background:'rgba(245,166,35,.06)',
              border:'1px solid rgba(245,166,35,.2)',borderRadius:'var(--r)',fontSize:11,color:'var(--amber)'}}>
              \u26a0 Sin restricci\u00f3n de grupo: cualquier usuario de tu tenant podr\u00e1 acceder
            </div>
          )}
        </div>
      )}

      <button className="btn-p" onClick={save} disabled={saving} style={{maxWidth:220}}>
        {saving ? 'Guardando...' : 'Guardar configuraci\u00f3n SSO'}
      </button>
      {ok  && <div className="saved-ok"><span className="dot-ok"/> {ok}</div>}
      {err && <div style={{fontSize:11,color:'var(--red)'}}>{err}</div>}

      {/* Instrucciones colapsables */}
      <SSOInstructions/>
    </div>
  );
}

function SSOInstructions() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{borderTop:'1px solid var(--bd)',paddingTop:12}}>
      <button className="btn-g" onClick={() => setOpen(o => !o)} style={{width:'100%',textAlign:'left',display:'flex',justifyContent:'space-between'}}>
        <span>\u{2139} C\u00f3mo configurar los providers en los portales externos</span>
        <span>{open ? '\u25b2' : '\u25bc'}</span>
      </button>
      {open && (
        <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:16,fontSize:12,color:'var(--tx2)',lineHeight:1.7}}>
          <div>
            <div style={{fontWeight:700,color:'var(--tx)',marginBottom:6}}>\uD83C\uDFE2 Microsoft Azure AD</div>
            <ol style={{margin:0,paddingLeft:18,display:'flex',flexDirection:'column',gap:4}}>
              <li>Ve a <a href="https://portal.azure.com" target="_blank" rel="noreferrer" style={{color:'var(--ac2)'}}>portal.azure.com</a> \u2192 Azure Active Directory \u2192 App registrations \u2192 New registration</li>
              <li>Name: <code style={{fontFamily:'var(--mono)',background:'var(--sf3)',padding:'1px 5px',borderRadius:3}}>WorkSuite</code> \u2014 Supported account types: <em>this organizational directory only</em></li>
              <li>Redirect URI: <code style={{fontFamily:'var(--mono)',background:'var(--sf3)',padding:'1px 5px',borderRadius:3,fontSize:10}}>https://enclhswdbwbgxbjykdtj.supabase.co/auth/v1/callback</code></li>
              <li>Certificates & secrets \u2192 New client secret \u2192 copia el valor</li>
              <li>Token configuration \u2192 Add groups claim \u2192 Security groups</li>
              <li>En Supabase Dashboard \u2192 Authentication \u2192 Providers \u2192 Azure: pega Client ID, Secret y Tenant ID</li>
            </ol>
          </div>
          <div>
            <div style={{fontWeight:700,color:'var(--tx)',marginBottom:6}}>\uD83C\uDF10 Google</div>
            <ol style={{margin:0,paddingLeft:18,display:'flex',flexDirection:'column',gap:4}}>
              <li>Ve a <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{color:'var(--ac2)'}}>console.cloud.google.com</a> \u2192 APIs & Services \u2192 Credentials \u2192 Create OAuth 2.0 Client ID</li>
              <li>Redirect URI: <code style={{fontFamily:'var(--mono)',background:'var(--sf3)',padding:'1px 5px',borderRadius:3,fontSize:10}}>https://enclhswdbwbgxbjykdtj.supabase.co/auth/v1/callback</code></li>
              <li>En Supabase Dashboard \u2192 Authentication \u2192 Providers \u2192 Google: pega Client ID y Secret</li>
            </ol>
          </div>
          <div>
            <div style={{fontWeight:700,color:'var(--tx)',marginBottom:6}}>\uD83E\uDD1D Auth Hook (una sola vez)</div>
            <ol style={{margin:0,paddingLeft:18,display:'flex',flexDirection:'column',gap:4}}>
              <li>Supabase Dashboard \u2192 Authentication \u2192 Hooks</li>
              <li>Add hook \u2192 selecciona <em>Before User Creation</em></li>
              <li>Edge function: <code style={{fontFamily:'var(--mono)',background:'var(--sf3)',padding:'1px 5px',borderRadius:3}}>auth-hook-sso</code></li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

function PersonalJiraToken() {
  const [token,    setToken]    = useState('');
  const [show,     setShow]     = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [ok,       setOk]       = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('users').select('jira_api_token').eq('id', user.id).single()
        .then(({ data }) => setHasToken(!!data?.jira_api_token));
    });
  }, []);

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await supabase.from('users')
      .update({ jira_api_token: token.trim() || null })
      .eq('id', user.id);
    if (!error) {
      setHasToken(!!token.trim());
      setToken('');
      setOk(token.trim() ? '✓ Token guardado' : '✓ Token eliminado');
      setTimeout(() => setOk(''), 3000);
    }
    setSaving(false);
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <div style={{width:8,height:8,borderRadius:'50%',
          background:hasToken?'var(--green)':'var(--tx3)',
          boxShadow:hasToken?'0 0 5px var(--green)':'none'}}/>
        <span style={{fontSize:12,color:hasToken?'var(--green)':'var(--tx3)'}}>
          {hasToken
            ? 'Token personal configurado — tus imputaciones aparecerán con tu nombre en Jira'
            : 'Sin token personal — se usará el token del admin (con nota de autor en comentario)'}
        </span>
      </div>
      <div style={{display:'flex',gap:6}}>
        <input className="a-inp" type={show?'text':'password'}
          placeholder={hasToken ? '••••••••• (dejar vacío para eliminar)' : 'ATatt3x...'}
          value={token} onChange={e=>setToken(e.target.value)} style={{flex:1}}/>
        <button className="btn-g" onClick={()=>setShow(s=>!s)}
          style={{padding:'0 10px',flexShrink:0}}>
          {show?'Ocultar':'Mostrar'}
        </button>
      </div>
      <div style={{fontSize:10,color:'var(--tx3)',lineHeight:1.6}}>
        Genera tu token en{' '}
        <a href="https://id.atlassian.com/manage-profile/security/api-tokens"
          target="_blank" rel="noreferrer" style={{color:'var(--ac2)'}}>
          id.atlassian.com → Security → API tokens
        </a>
      </div>
      <button className="btn-p" onClick={save} disabled={saving} style={{maxWidth:200}}>
        {saving ? 'Guardando...' : hasToken ? 'Actualizar token' : 'Guardar token'}
      </button>
      {ok && <div className="saved-ok"><span className="dot-ok"/> {ok}</div>}
    </div>
  );
}

function AdminSettings() {
  const { t } = useTranslation();
  const [jiraUrl,   setJiraUrl]   = useState("");
  const [email,     setEmail]     = useState("");
  const [token,     setToken]     = useState("");
  const [showTok,   setShowTok]   = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [conn,      setConn]      = useState(null);
  const [errMsg,    setErrMsg]    = useState("");
  const [okMsg,     setOkMsg]     = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/jira/connection`, { headers: await getAuthHeader() });
        const json = await res.json();
        if (json.ok && json.data) {
          setConn(json.data);
          setJiraUrl(json.data.base_url || "");
          setEmail(json.data.email || "");
        }
      } catch { } finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    setErrMsg(""); setOkMsg("");
    if (!jiraUrl.trim() || !email.trim()) { setErrMsg("Completa URL y email"); return; }
    if (!conn && !token.trim()) { setErrMsg("Introduce el API Token"); return; }
    setSaving(true);
    try {
      const body: any = { baseUrl: jiraUrl.trim(), email: email.trim() };
      if (token.trim()) body.apiToken = token.trim();
      if (!token.trim() && conn) body.apiToken = "__keep__";
      const res  = await fetch(`${API_BASE}/jira/connection`, {
        method: "POST",
        headers: { ...await getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) { setErrMsg(json.error?.message || "Error al guardar"); return; }
      setConn({ base_url: jiraUrl.trim(), email: email.trim() });
      setToken("");
      setOkMsg("✓ Configuración guardada");
      setTimeout(() => setOkMsg(""), 3000);
    } catch { setErrMsg("Error de red"); } finally { setSaving(false); }
  };

  const handleDisconnect = async () => {
    await fetch(`${API_BASE}/jira/connection`, { method: "DELETE", headers: await getAuthHeader() });
    setConn(null); setJiraUrl(""); setEmail(""); setToken("");
    setOkMsg("Desconectado"); setTimeout(() => setOkMsg(""), 3000);
  };

  if (loading) return <div style={{padding:20,color:"var(--tx3)",fontSize:13}}>Cargando...</div>;

  return (
    <div>
      <div className="sec-t">{t("admin.settingsTitle")}</div>
      <div className="sec-sub">Configure the connection to your Jira Cloud instance and global preferences.</div>
      <div className="a-card">
        <div className="a-ct">🔗 {t("admin.jiraConnection")}</div>
        <div className="a-form">
          <div><div className="a-lbl">{t("admin.jiraUrl")}</div><input className="a-inp" placeholder="https://yourcompany.atlassian.net" value={jiraUrl} onChange={e=>setJiraUrl(e.target.value)}/></div>
          <div><div className="a-lbl">{t("admin.jiraEmail")}</div><input className="a-inp" type="email" placeholder="you@company.com" value={email} onChange={e=>setEmail(e.target.value)}/></div>
          <div>
            <div className="a-lbl">{t("admin.apiToken")}</div>
            <div style={{display:"flex",gap:6}}>
              <input className="a-inp" type={showTok?"text":"password"}
                placeholder={conn ? "••••••••• (dejar vacío para mantener)" : "ATatt3x..."}
                value={token} onChange={e=>setToken(e.target.value)} style={{flex:1}}/>
              <button className="btn-g" onClick={()=>setShowTok(s=>!s)} style={{padding:"0 10px",flexShrink:0}}>
                {showTok?t("admin.hideToken"):t("admin.showToken")}
              </button>
            </div>
            <div className="a-hint">{t("admin.tokenHint")}</div>
          </div>
          <button className="btn-p" onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : t("admin.saveConfig")}</button>
          {conn && <button className="btn-g" onClick={handleDisconnect} style={{marginTop:4,color:"var(--red)",borderColor:"var(--red)"}}>Desconectar</button>}
          {errMsg && <div style={{marginTop:8,padding:"8px 12px",background:"rgba(229,62,62,.08)",border:"1px solid rgba(229,62,62,.25)",borderRadius:"var(--r)",color:"var(--red)",fontSize:12}}>{errMsg}</div>}
          {okMsg  && <div className="saved-ok"><span className="dot-ok"/>  {okMsg}</div>}
        </div>
      </div>
      <div className="a-card">
        <div className="a-ct">📡 Connection status</div>
        <div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:"10px 14px"}}>
          {conn ? (<>
            <div className="info-r"><span className="ik2">{t("admin.connStatus")}</span><div style={{display:"flex",alignItems:"center",gap:5}}><div className="dot-ok"/><span className="iv" style={{color:"var(--green)"}}>{t("admin.connected")}</span></div></div>
            <div className="info-r"><span className="ik2">{t("admin.connInstance")}</span><span className="iv">{conn.base_url?.replace("https://","")}</span></div>
            <div className="info-r" style={{border:"none"}}><span className="ik2">Email</span><span className="iv">{conn.email}</span></div>
          </>) : (
            <div className="info-r" style={{border:"none"}}><span className="ik2">{t("admin.connStatus")}</span><span className="iv" style={{color:"var(--tx3)"}}>No conectado</span></div>
          )}
        </div>
      </div>

      {/* ── Token personal del usuario ── */}
      <div className="a-card">
        <div className="a-ct">🔑 Mi token personal de Jira</div>
        <PersonalJiraToken />
      </div>

      {/* ── SSO & Acceso ── */}
      <div className="a-card">
        <div className="a-ct">🔐 SSO &amp; Control de acceso</div>
        <SSOConfig />
      </div>
    </div>
  );
}

export { AdminSettings, SSOConfig, SSOInstructions, PersonalJiraToken };
