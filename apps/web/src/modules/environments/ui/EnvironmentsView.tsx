// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { supabase }                from '@/shared/lib/supabaseClient';
import type { Environment }        from '../domain/entities/Environment';
import type { Reservation, Repository, EnvPolicy } from '../domain/entities/Reservation';
import { SupabaseEnvironmentRepo } from '../infra/supabase/SupabaseEnvironmentRepo';
import { SupabaseReservationRepo } from '../infra/supabase/SupabaseReservationRepo';
import { GetEnvironments }         from '../domain/useCases/GetEnvironments';
import { GetReservations }         from '../domain/useCases/GetReservations';
import { UpsertReservation }       from '../domain/useCases/UpsertReservation';
import { UpdateReservationStatus } from '../domain/useCases/UpdateReservationStatus';

// ── Use-cases (singleton) ────────────────────────────────────────────────────
const envRepo  = new SupabaseEnvironmentRepo(supabase);
const resRepo  = new SupabaseReservationRepo(supabase);
const getEnvs  = new GetEnvironments(envRepo);
const getRes   = new GetReservations(resRepo);
const upsertUC = new UpsertReservation(resRepo);
const statusUC = new UpdateReservationStatus(resRepo);

// ── Status config ────────────────────────────────────────────────────────────
const STATUS = {
  Reserved:        { label:'Reservado',         color:'#3b82f6', bg:'rgba(59,130,246,.12)',  icon:'⏳' },
  InUse:           { label:'En uso',             color:'#22c55e', bg:'rgba(34,197,94,.12)',   icon:'🟢' },
  Completed:       { label:'Completado',         color:'#6b7280', bg:'rgba(107,114,128,.12)', icon:'✅' },
  Cancelled:       { label:'Cancelado',          color:'#ef4444', bg:'rgba(239,68,68,.12)',   icon:'❌' },
  PolicyViolation: { label:'Violación política', color:'#f97316', bg:'rgba(249,115,22,.12)',  icon:'⚠️' },
};
const CAT = {
  DEV:     { color:'#a78bfa', bg:'rgba(124,58,237,.15)' },
  PRE:     { color:'#fbbf24', bg:'rgba(180,83,9,.15)'   },
  STAGING: { color:'#22d3ee', bg:'rgba(14,116,144,.15)' },
};

// ── Style helpers (inline — no @worksuite/ui hasta que esté listo) ───────────
const btn = (variant='primary', extra={}) => ({
  display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5,
  padding:'6px 14px', borderRadius:'var(--ws-radius,8px)', fontWeight:600,
  fontSize:13, cursor:'pointer', border:'none', fontFamily:'inherit',
  transition:'all .15s',
  ...(variant==='primary'  && { background:'var(--ws-accent,#6366f1)', color:'#fff' }),
  ...(variant==='ghost'    && { background:'var(--ws-surface-2,#1b1b22)', color:'var(--ws-text-3,#6a6a9a)', border:'1px solid var(--ws-border,#2a2a38)' }),
  ...(variant==='danger'   && { background:'rgba(239,68,68,.12)', color:'#ef4444', border:'1px solid rgba(239,68,68,.3)' }),
  ...(variant==='success'  && { background:'rgba(34,197,94,.12)', color:'#22c55e', border:'1px solid rgba(34,197,94,.3)' }),
  ...(variant==='warn'     && { background:'rgba(245,158,11,.12)', color:'#f59e0b', border:'1px solid rgba(245,158,11,.3)' }),
  ...(variant==='outline'  && { background:'transparent', color:'var(--ws-accent,#6366f1)', border:'1px solid var(--ws-accent,#6366f1)' }),
  ...extra,
});
const inp = (extra={}) => ({
  width:'100%', padding:'7px 10px', fontSize:13, fontFamily:'inherit',
  background:'var(--ws-surface-2,#1b1b22)', border:'1px solid var(--ws-border,#2a2a38)',
  borderRadius:8, color:'var(--ws-text,#e4e4ef)', outline:'none', ...extra,
});
const lbl = { fontSize:11, fontWeight:700, color:'var(--ws-text-3,#6a6a9a)',
  textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:5 };

// ── Helpers ──────────────────────────────────────────────────────────────────
const uid    = () => Math.random().toString(36).slice(2,10);
const fmtDt  = iso => new Date(iso).toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'});
const durH   = (s,e) => ((new Date(e)-new Date(s))/3600000).toFixed(1);
const isJira = k => /^[A-Z][A-Z0-9]+-\d+$/.test(k.trim());

// ── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, width=520 }) {
  useEffect(()=>{
    const h = e => { if(e.key==='Escape') onClose(); };
    document.addEventListener('keydown',h);
    return () => document.removeEventListener('keydown',h);
  },[onClose]);
  return (
    <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',
      justifyContent:'center',padding:20,background:'rgba(0,0,0,.6)',backdropFilter:'blur(2px)'}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'var(--ws-surface,#12121e)',border:'1px solid var(--ws-border,#2a2a38)',
        borderRadius:16,width:'100%',maxWidth:width,maxHeight:'90vh',overflow:'hidden',
        display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,.6)'}}>
        {title&&(
          <div style={{padding:'16px 20px',borderBottom:'1px solid var(--ws-border,#2a2a38)',
            display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <h3 style={{fontSize:15,fontWeight:700,color:'var(--ws-text,#e4e4ef)',margin:0,flex:1}}>{title}</h3>
            <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',
              color:'var(--ws-text-3,#6a6a9a)',fontSize:20,lineHeight:1,padding:'2px 6px',fontFamily:'inherit'}}>✕</button>
          </div>
        )}
        <div style={{overflowY:'auto',flex:1,padding:'18px 20px'}}>{children}</div>
      </div>
    </div>
  );
}

// ── Jira tag input ─────────────────────────────────────────────────────────────
function JiraTagInput({ value, onChange }) {
  const [draft,setDraft] = useState('');
  const [err,setErr]     = useState('');
  const add = raw => {
    const key = raw.trim().toUpperCase();
    if(!key) return;
    if(!isJira(key)){setErr('Formato inválido — usa PROYECTO-123');return;}
    if(value.includes(key)){setErr('Ya añadida');return;}
    onChange([...value,key]); setDraft(''); setErr('');
  };
  return (
    <div>
      <div style={{...inp({display:'flex',flexWrap:'wrap',gap:4,minHeight:40,cursor:'text',width:'auto',padding:'6px 10px'})}}
        onClick={()=>document.getElementById('jtag')?.focus()}>
        {value.map(k=>(
          <span key={k} style={{display:'flex',alignItems:'center',gap:4,padding:'2px 8px',
            background:'rgba(124,58,237,.15)',color:'#a78bfa',borderRadius:6,fontSize:12,fontFamily:'monospace'}}>
            {k}<span onClick={()=>onChange(value.filter(v=>v!==k))} style={{cursor:'pointer',opacity:.7}}>×</span>
          </span>
        ))}
        <input id="jtag" value={draft}
          onChange={e=>{setDraft(e.target.value.toUpperCase());setErr('');}}
          onKeyDown={e=>{if(['Enter','Tab',',',' '].includes(e.key)){e.preventDefault();add(draft);}
            if(e.key==='Backspace'&&!draft&&value.length) onChange(value.slice(0,-1));}}
          onBlur={()=>{if(draft.trim())add(draft);}}
          placeholder={value.length?'':'PROJ-123 → Enter'}
          style={{background:'transparent',border:'none',outline:'none',fontSize:12,
            color:'var(--ws-text,#e4e4ef)',fontFamily:'monospace',flex:1,minWidth:120}}/>
      </div>
      {err&&<p style={{color:'#ef4444',fontSize:11,marginTop:3}}>⚠ {err}</p>}
    </div>
  );
}

// ── Reservation card (inline — equivalente a TimelineCard de @worksuite/ui) ──
function ResCard({ res, env, onClick }) {
  const st = STATUS[res.status] ?? STATUS.Reserved;
  const dt = fmtDt(res.plannedStart);
  const dur = durH(res.plannedStart, res.plannedEnd);
  const envName = env?.name ?? '—';
  const cat = CAT[env?.category] ?? CAT.DEV;
  return (
    <div onClick={onClick} style={{background:'var(--ws-surface,#12121e)',
      border:'1px solid '+st.color+'44',borderLeft:'3px solid '+st.color,
      borderRadius:8,padding:'10px 14px',cursor:'pointer',transition:'all .15s'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
        <span style={{fontSize:12,color:st.color,fontWeight:700}}>{st.icon} {st.label}</span>
        <span style={{fontSize:11,fontWeight:700,padding:'1px 7px',borderRadius:20,
          background:st.bg,color:st.color}}>{envName} · {dur}h</span>
        {env?.category&&<span style={{fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:10,
          background:cat.bg,color:cat.color}}>{env.category}</span>}
        <span style={{fontSize:11,color:'var(--ws-text-3,#6a6a9a)',marginLeft:'auto'}}>{dt}</span>
      </div>
      <p style={{fontSize:13,fontWeight:600,color:'var(--ws-text,#e4e4ef)',marginBottom:res.description?4:0}}>
        {res.jiraIssueKeys.join(', ')||'—'}
      </p>
      {res.description&&<p style={{fontSize:11,color:'var(--ws-text-3,#6a6a9a)',lineHeight:1.4,margin:0}}>{res.description}</p>}
    </div>
  );
}

// ── Reservation form ──────────────────────────────────────────────────────────
function ReservationForm({ res, envs, repos, allRes, policy, currentUser, onSave, onClose }) {
  const isEdit  = !!res;
  const isAdmin = currentUser?.role==='admin';
  const [envId, setEnvId] = useState(res?.environmentId??'');
  const [jiras, setJiras] = useState(res?.jiraIssueKeys??[]);
  const [desc,  setDesc]  = useState(res?.description??'');
  const [start, setStart] = useState(res?.plannedStart?res.plannedStart.slice(0,16):'');
  const [end,   setEnd]   = useState(res?.plannedEnd?res.plannedEnd.slice(0,16):'');
  const [rids,  setRids]  = useState(res?.selectedRepositoryIds??[]);
  const [error, setError] = useState('');
  const selEnv = envs.find(e=>e.id===envId);

  const submit = () => {
    if(!envId)       {setError('Selecciona un entorno.');return;}
    if(!jiras.length){setError('Añade al menos una clave Jira.');return;}
    if(!start||!end) {setError('Inicio y fin son obligatorios.');return;}
    const draft = {
      id: res?.id??uid(), environmentId:envId,
      reservedByUserId: res?.reservedByUserId??currentUser?.id,
      jiraIssueKeys:jiras, description:desc.trim()||null,
      plannedStart:new Date(start).toISOString(), plannedEnd:new Date(end).toISOString(),
      status: res?.status??(new Date(start)<=new Date()?'InUse':'Reserved'),
      selectedRepositoryIds:rids, usageSession:res?.usageSession??null,
      policyFlags:{exceedsMaxDuration:false},
    };
    const err = upsertUC.validate(draft,allRes,selEnv?.maxReservationDuration??999,policy,isAdmin);
    if(err){setError(err);return;}
    onSave(draft);
  };

  return (
    <Modal title={isEdit?'Editar reserva':'Nueva reserva'} onClose={onClose}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div>
          <label style={lbl}>Entorno</label>
          <select value={envId} onChange={e=>setEnvId(e.target.value)} style={inp()}>
            <option value="">Selecciona entorno…</option>
            {envs.filter(e=>!e.isArchived&&(isAdmin||!e.isLocked)).map(e=>(
              <option key={e.id} value={e.id}>
                {e.isLocked?'🔒 ':''}{e.name} ({e.category}) — max {e.maxReservationDuration}h
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={lbl}>Claves Jira</label>
          <JiraTagInput value={jiras} onChange={setJiras}/>
        </div>
        <div>
          <label style={lbl}>Descripción <span style={{fontWeight:400,textTransform:'none'}}>(opcional)</span></label>
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={2}
            style={inp({resize:'vertical'})} placeholder="Propósito de la reserva…"/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div><label style={lbl}>Inicio</label><input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} style={inp()}/></div>
          <div><label style={lbl}>Fin</label><input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} style={inp()}/></div>
        </div>
        {repos.filter(r=>!r.isArchived).length>0&&(
          <div>
            <label style={lbl}>Repositorios</label>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {repos.filter(r=>!r.isArchived).map(r=>(
                <button key={r.id}
                  onClick={()=>setRids(p=>p.includes(r.id)?p.filter(x=>x!==r.id):[...p,r.id])}
                  style={{padding:'4px 10px',fontSize:12,borderRadius:20,cursor:'pointer',fontFamily:'inherit',
                    background:rids.includes(r.id)?'rgba(124,58,237,.15)':'var(--ws-surface-2,#1b1b22)',
                    color:rids.includes(r.id)?'#a78bfa':'var(--ws-text-3,#6a6a9a)',
                    border:rids.includes(r.id)?'1px solid #a78bfa':'1px solid var(--ws-border,#2a2a38)'}}>
                  📦 {r.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {error&&<div style={{padding:'8px 12px',background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,fontSize:12,color:'#ef4444'}}>⛔ {error}</div>}
        <div style={{display:'flex',justifyContent:'flex-end',gap:8,paddingTop:8,borderTop:'1px solid var(--ws-border,#2a2a38)'}}>
          <button style={btn('ghost')} onClick={onClose}>Cancelar</button>
          <button style={btn('primary')} onClick={submit}>{isEdit?'Actualizar':'Crear'}</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Reservation detail ────────────────────────────────────────────────────────
function ReservationDetail({ res, envs, repos, users, currentUser, onClose, onEdit, onCheckIn, onCheckOut, onCancel, onAddBranch }) {
  const env     = envs.find(e=>e.id===res.environmentId);
  const isOwner = currentUser?.id===res.reservedByUserId;
  const isAdmin = currentUser?.role==='admin';
  const owner   = users?.find(u=>u.id===res.reservedByUserId);
  const [branch,setBranch] = useState('');
  const [showB,setShowB]   = useState(false);
  const repoNames = (res.selectedRepositoryIds??[]).map(id=>repos.find(r=>r.id===id)?.name).filter(Boolean);
  const canEdit   = (isOwner||isAdmin)&&['Reserved','PolicyViolation','InUse'].includes(res.status);
  const canCI     = isOwner&&res.status==='Reserved';
  const canCO     = isOwner&&res.status==='InUse';
  const canCancel = (isOwner||isAdmin)&&['Reserved','InUse','PolicyViolation'].includes(res.status);
  const cat = CAT[env?.category] ?? CAT.DEV;

  return (
    <Modal title="Detalle de reserva" onClose={onClose}>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {env&&<span style={{padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:700,background:cat.bg,color:cat.color}}>{env.category}</span>}
          <span style={{fontWeight:700,fontSize:16,color:'var(--ws-text,#e4e4ef)'}}>{env?.name}</span>
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
          {(res.jiraIssueKeys??[]).map(k=>(
            <span key={k} style={{padding:'3px 10px',borderRadius:6,fontSize:12,fontFamily:'monospace',background:'rgba(124,58,237,.15)',color:'#a78bfa'}}>{k}</span>
          ))}
        </div>
        {res.description&&<p style={{fontSize:13,color:'var(--ws-text-3,#6a6a9a)',lineHeight:1.5}}>{res.description}</p>}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,fontSize:12}}>
          {[
            ['Responsable', owner?.name??owner?.email??'—'],
            ['Duración',    durH(res.plannedStart,res.plannedEnd)+'h'],
            ['Inicio',      fmtDt(res.plannedStart)],
            ['Fin',         fmtDt(res.plannedEnd)],
            ...(res.usageSession?[
              ['Inicio real', fmtDt(res.usageSession.actual_start)],
              ['Fin real',    res.usageSession.actual_end?fmtDt(res.usageSession.actual_end):'—'],
            ]:[]),
          ].map(([l,v])=>(
            <div key={l}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--ws-text-3,#6a6a9a)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:2}}>{l}</div>
              <div style={{color:'var(--ws-text,#e4e4ef)'}}>{v}</div>
            </div>
          ))}
        </div>
        {repoNames.length>0&&(
          <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
            {repoNames.map(n=><span key={n} style={{padding:'2px 8px',borderRadius:4,fontSize:12,background:'var(--ws-surface-2,#1b1b22)',color:'var(--ws-text-3,#6a6a9a)'}}>📦 {n}</span>)}
          </div>
        )}
        {(res.usageSession?.branches??[]).length>0&&(
          <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
            {res.usageSession.branches.map(b=><span key={b} style={{padding:'2px 8px',borderRadius:4,fontSize:12,fontFamily:'monospace',background:'rgba(124,58,237,.12)',color:'#a78bfa'}}>{b}</span>)}
          </div>
        )}
        {res.status==='InUse'&&isOwner&&(
          <div>
            {showB?(
              <div style={{display:'flex',gap:6}}>
                <input value={branch} onChange={e=>setBranch(e.target.value)} autoFocus placeholder="nombre-rama"
                  style={inp({fontFamily:'monospace',flex:1,width:'auto'})}
                  onKeyDown={e=>{if(e.key==='Enter'&&branch.trim()){onAddBranch(branch.trim());setBranch('');setShowB(false);}}}/>
                <button style={btn('primary',{padding:'6px 12px'})} onClick={()=>{if(branch.trim()){onAddBranch(branch.trim());setBranch('');setShowB(false);}}}>Añadir</button>
                <button style={btn('ghost',{padding:'6px 12px'})} onClick={()=>setShowB(false)}>×</button>
              </div>
            ):(
              <button style={btn('outline',{fontSize:12})} onClick={()=>setShowB(true)}>+ Añadir rama</button>
            )}
          </div>
        )}
        {env?.url&&(
          <a href={env.url} target="_blank" rel="noopener noreferrer"
            style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'9px 14px',
              background:'var(--ws-accent,#6366f1)',color:'#fff',borderRadius:8,textDecoration:'none',fontSize:14,fontWeight:600}}>
            🔗 Acceder al entorno
          </a>
        )}
        <div style={{display:'flex',flexWrap:'wrap',gap:8,paddingTop:12,borderTop:'1px solid var(--ws-border,#2a2a38)'}}>
          {canEdit  &&<button style={btn('primary')}  onClick={()=>onEdit(res)}>✏️ Editar</button>}
          {canCI    &&<button style={btn('success')}  onClick={onCheckIn}>▶ Iniciar</button>}
          {canCO    &&<button style={btn('warn')}     onClick={onCheckOut}>⏹ Finalizar</button>}
          {canCancel&&<button style={btn('danger')}   onClick={onCancel}>✕ Cancelar</button>}
          <div style={{marginLeft:'auto'}}><button style={btn('ghost')} onClick={onClose}>Cerrar</button></div>
        </div>
      </div>
    </Modal>
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{position:'fixed',inset:0,zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',
      background:'rgba(0,0,0,.7)',padding:16}} onClick={onCancel}>
      <div onClick={e=>e.stopPropagation()}
        style={{background:'var(--ws-surface,#12121e)',border:'1px solid var(--ws-border,#2a2a38)',
          borderRadius:14,maxWidth:400,width:'100%',overflow:'hidden',boxShadow:'0 24px 60px rgba(0,0,0,.6)'}}>
        <div style={{padding:'18px 20px 16px',borderBottom:'1px solid var(--ws-border,#2a2a38)'}}>
          <span style={{fontWeight:700,fontSize:15,color:'var(--ws-text,#e4e4ef)'}}>⚠️ Confirmar acción</span>
        </div>
        <div style={{padding:'16px 20px'}}>
          <p style={{color:'var(--ws-text-3,#6a6a9a)',fontSize:13,lineHeight:1.6,marginBottom:20}}>{message}</p>
          <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
            <button style={btn('ghost')} onClick={onCancel}>Cancelar</button>
            <button style={btn('danger')} onClick={()=>{onConfirm();onCancel();}}>Confirmar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main exported view ────────────────────────────────────────────────────────
export function EnvironmentsView({ currentUser, wsUsers }) {
  const [envs,   setEnvs]   = useState([]);
  const [res,    setRes]    = useState([]);
  const [repos,  setRepos]  = useState([]);
  const [policy, setPolicy] = useState({
    bookingWindowDays:30, minDurationHours:.5, allowPastStart:true,
    businessHoursOnly:false, businessHoursStart:8, businessHoursEnd:20,
  });
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('active');
  const [search,  setSearch]  = useState('');
  const [form,    setForm]    = useState(null);
  const [detail,  setDetail]  = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, { reservations, repositories, policy:pol }] = await Promise.all([
        getEnvs.execute(),
        getRes.execute(),
      ]);
      setEnvs(e); setRes(reservations); setRepos(repositories); setPolicy(pol);
    } catch(err) {
      console.error('[EnvironmentsView]', err);
    } finally { setLoading(false); }
  }, []);

  useEffect(()=>{ void load(); },[load]);

  const visible = res.filter(r=>{
    if(filter==='active'&&!['Reserved','InUse','PolicyViolation'].includes(r.status)) return false;
    if(filter==='mine'&&r.reservedByUserId!==currentUser?.id) return false;
    if(search){
      const q=search.toLowerCase(), env=envs.find(e=>e.id===r.environmentId);
      if(!r.jiraIssueKeys.some(k=>k.toLowerCase().includes(q))&&
         !(env?.name??'').toLowerCase().includes(q)&&
         !(r.description??'').toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a,b)=>new Date(b.plannedStart)-new Date(a.plannedStart));

  const patchLocal = (id,patch) => setRes(p=>p.map(x=>x.id===id?{...x,...patch}:x));

  const handleSave = async draft => {
    await upsertUC.execute(draft);
    setRes(prev=>{ const i=prev.findIndex(r=>r.id===draft.id); return i>=0?prev.map(r=>r.id===draft.id?draft:r):[...prev,draft]; });
    setForm(null);
  };

  const handleCheckIn = async r => {
    const session={actual_start:new Date().toISOString(),actual_end:null,branches:[]};
    await statusUC.checkIn(r.id); patchLocal(r.id,{status:'InUse',usageSession:session}); setDetail(null);
  };
  const handleCheckOut = async r => {
    await statusUC.checkOut(r.id,r); patchLocal(r.id,{status:'Completed'}); setDetail(null);
  };
  const handleCancel = r => {
    setConfirm({ message:'¿Seguro que quieres cancelar esta reserva?',
      onConfirm:async()=>{ await statusUC.cancel(r.id); patchLocal(r.id,{status:'Cancelled'}); setDetail(null); }});
  };
  const handleAddBranch = async (r,branch) => {
    await statusUC.addBranch(r.id,branch,r);
    const branches=[...(r.usageSession?.branches??[]),branch];
    const session={...r.usageSession,branches};
    patchLocal(r.id,{usageSession:session});
    setDetail(d=>d?.id===r.id?{...d,usageSession:session}:d);
  };

  const tabs=[{id:'all',label:'Todas'},{id:'active',label:'Activas'},{id:'mine',label:'Mis reservas'}];

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Filter bar */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 20px',
        borderBottom:'1px solid var(--ws-border,#2a2a38)',background:'var(--ws-surface,#12121e)',flexShrink:0}}>
        <div style={{display:'flex',gap:2,background:'var(--ws-surface-2,#1b1b22)',
          border:'1px solid var(--ws-border,#2a2a38)',borderRadius:8,padding:3}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setFilter(t.id)}
              style={{padding:'4px 12px',fontSize:12,fontWeight:filter===t.id?600:400,borderRadius:6,
                border:'none',cursor:'pointer',fontFamily:'inherit',
                background:filter===t.id?'var(--ws-surface,#12121e)':'transparent',
                color:filter===t.id?'var(--ws-text,#e4e4ef)':'var(--ws-text-3,#6a6a9a)',
                boxShadow:filter===t.id?'0 1px 3px rgba(0,0,0,.15)':'none'}}>
              {t.label}
            </button>
          ))}
        </div>
        <input placeholder="Buscar Jira, entorno…" value={search} onChange={e=>setSearch(e.target.value)}
          style={inp({width:200,padding:'6px 10px',fontSize:12})}/>
        <div style={{marginLeft:'auto'}}>
          <button style={btn('primary',{padding:'7px 14px'})} onClick={()=>setForm('new')}>+ Nueva reserva</button>
        </div>
      </div>

      {/* List */}
      <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>
        {loading&&(
          <div style={{textAlign:'center',padding:'40px 0',color:'var(--ws-text-3,#6a6a9a)',fontSize:13}}>
            Cargando reservas…
          </div>
        )}
        {!loading&&visible.length===0&&(
          <div style={{textAlign:'center',padding:'60px 0',color:'var(--ws-text-3,#6a6a9a)'}}>
            <div style={{fontSize:32,marginBottom:12}}>📭</div>
            <div style={{fontSize:14,fontWeight:500}}>No hay reservas{filter!=='all'?' en este filtro':''}</div>
            {filter!=='all'&&(
              <button onClick={()=>setFilter('all')}
                style={{marginTop:12,background:'none',border:'none',cursor:'pointer',
                  color:'var(--ws-accent,#6366f1)',fontSize:13,fontFamily:'inherit'}}>
                Ver todas →
              </button>
            )}
          </div>
        )}
        {!loading&&visible.length>0&&(
          <div style={{display:'flex',flexDirection:'column',gap:8,maxWidth:760}}>
            {visible.map(r=>(
              <ResCard key={r.id} res={r} env={envs.find(e=>e.id===r.environmentId)} onClick={()=>setDetail(r)}/>
            ))}
          </div>
        )}
      </div>

      {form&&<ReservationForm res={form==='new'?null:form} envs={envs} repos={repos} allRes={res}
        policy={policy} currentUser={currentUser} onSave={handleSave} onClose={()=>setForm(null)}/>}

      {detail&&<ReservationDetail res={detail} envs={envs} repos={repos} users={wsUsers??[]}
        currentUser={currentUser} onClose={()=>setDetail(null)}
        onEdit={r=>{setDetail(null);setForm(r);}}
        onCheckIn={()=>handleCheckIn(detail)} onCheckOut={()=>handleCheckOut(detail)}
        onCancel={()=>handleCancel(detail)} onAddBranch={b=>handleAddBranch(detail,b)}/>}

      {confirm&&<ConfirmDialog message={confirm.message}
        onConfirm={confirm.onConfirm} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
