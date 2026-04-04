// @ts-nocheck
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase }                from '@/shared/lib/supabaseClient';
// Usamos el mismo DeployTimeline de Deploy Planner — sin tocarlo
import { DeployTimeline }          from '../../deploy-planner/ui/DeployTimeline';
import { GanttTimeline }           from '@worksuite/ui';
import { JiraSyncAdapter }         from '../../jira-tracker/infra/JiraSyncAdapter';
import { SupabaseReservationHistoryRepo } from '../infra/supabase/SupabaseReservationHistoryRepo';
import type { Environment }        from '../domain/entities/Environment';
import type { Reservation, Repository, EnvPolicy } from '../domain/entities/Reservation';
import { SupabaseEnvironmentRepo } from '../infra/supabase/SupabaseEnvironmentRepo';
import { SupabaseReservationRepo } from '../infra/supabase/SupabaseReservationRepo';
import { GetEnvironments }         from '../domain/useCases/GetEnvironments';
import { GetReservations }         from '../domain/useCases/GetReservations';
import { UpsertReservation }       from '../domain/useCases/UpsertReservation';
import { UpdateReservationStatus } from '../domain/useCases/UpdateReservationStatus';

// ── Use-cases ────────────────────────────────────────────────────────────────
const envRepo  = new SupabaseEnvironmentRepo(supabase);
const resRepo  = new SupabaseReservationRepo(supabase);
const getEnvs  = new GetEnvironments(envRepo);
const getRes   = new GetReservations(resRepo);
const upsertUC = new UpsertReservation(resRepo);
const statusUC = new UpdateReservationStatus(resRepo);

// ── Adapters ─────────────────────────────────────────────────────────────────
const API_BASE = ((import.meta as any).env?.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}
const jiraSyncAdapter = new JiraSyncAdapter(API_BASE, getAuthHeaders);
const historyRepo = new SupabaseReservationHistoryRepo(supabase);

// ── Mapeo Reservation → formato que entiende DeployTimeline ──────────────────
const STATUS_MAP = {
  Reserved:        'planned',
  InUse:           'in-progress',
  Completed:       'deployed',
  Cancelled:       'cancelled',
  PolicyViolation: 'rolled-back',
};
const CAT_MAP = {
  DEV:     'development',
  PRE:     'staging',
  STAGING: 'staging',
};

function toDeploymentShape(res, env) {
  return {
    id:          res.id,
    name:        res.jiraIssueKeys.join(', ') || '—',
    status:      STATUS_MAP[res.status] ?? 'planned',
    environment: CAT_MAP[env?.category] ?? 'development',
    version:     env?.name ?? '—',
    planned_at:  res.plannedStart,
    notes:       res.description ?? undefined,
    jira_issues: res.jiraIssueKeys,
  };
}

// ── Inline helpers (sin @worksuite/ui hasta que esté listo) ──────────────────
const btnStyle = (variant='primary', extra={}) => ({
  display:'inline-flex', alignItems:'center', gap:5, padding:'6px 14px',
  borderRadius:8, fontWeight:600, fontSize:13, cursor:'pointer', border:'none',
  fontFamily:'inherit', transition:'all .15s',
  ...(variant==='primary' && { background:'var(--ac,#4f6ef7)', color:'#fff' }),
  ...(variant==='ghost'   && { background:'var(--sf2,#1b1b22)', color:'var(--tx3,#50506a)', border:'1px solid var(--bd,#2a2a38)' }),
  ...(variant==='danger'  && { background:'rgba(239,68,68,.12)', color:'#ef4444', border:'1px solid rgba(239,68,68,.3)' }),
  ...(variant==='success' && { background:'rgba(34,197,94,.12)', color:'#22c55e', border:'1px solid rgba(34,197,94,.3)' }),
  ...(variant==='warn'    && { background:'rgba(245,158,11,.12)', color:'#f59e0b', border:'1px solid rgba(245,158,11,.3)' }),
  ...(variant==='outline' && { background:'transparent', color:'var(--ac,#4f6ef7)', border:'1px solid var(--ac,#4f6ef7)' }),
  ...extra,
});
const inpStyle = (extra={}) => ({
  width:'100%', padding:'7px 10px', fontSize:13, fontFamily:'inherit',
  background:'var(--sf2,#1b1b22)', border:'1px solid var(--bd,#2a2a38)',
  borderRadius:8, color:'var(--tx,#e4e4ef)', outline:'none', ...extra,
});
const lblStyle = {
  fontSize:11, fontWeight:700, color:'var(--tx3,#50506a)',
  textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:5,
};

const uid    = () => Math.random().toString(36).slice(2,10);
const fmtDt  = iso => new Date(iso).toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'});
const durH   = (s,e) => ((new Date(e)-new Date(s))/3600000).toFixed(1);
const isJira = k => /^[A-Z][A-Z0-9]+-\d+$/.test(k.trim());
const CAT    = {
  DEV:     {color:'#a78bfa', bg:'rgba(124,58,237,.15)'},
  PRE:     {color:'#fbbf24', bg:'rgba(180,83,9,.15)'},
  STAGING: {color:'#22d3ee', bg:'rgba(14,116,144,.15)'},
};

// ── REPO_FIELD: campo personalizado de Jira que contiene repos ───────────────
const JIRA_REPO_FIELD = 'customfield_10146';

// ── Modal ─────────────────────────────────────────────────────────────────────
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
      <div style={{background:'var(--sf,#141418)',border:'1px solid var(--bd,#2a2a38)',
        borderRadius:16,width:'100%',maxWidth:width,maxHeight:'90vh',overflow:'hidden',
        display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,.6)'}}>
        {title&&(
          <div style={{padding:'16px 20px',borderBottom:'1px solid var(--bd,#2a2a38)',
            display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <h3 style={{fontSize:15,fontWeight:700,color:'var(--tx,#e4e4ef)',margin:0,flex:1}}>{title}</h3>
            <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',
              color:'var(--tx3,#50506a)',fontSize:20,lineHeight:1,fontFamily:'inherit'}}>✕</button>
          </div>
        )}
        <div style={{overflowY:'auto',flex:1,padding:'18px 20px'}}>{children}</div>
      </div>
    </div>
  );
}

// ── Jira Ticket Search (reemplaza JiraTagInput) ──────────────────────────────
function JiraTicketSearch({ value, onChange }) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const [ticketMap, setTicketMap] = useState({});
  const debounceRef = useRef(null);
  const wrapRef     = useRef(null);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Buscar tickets con debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const jql = `text ~ "${query.trim()}" ORDER BY updated DESC`;
        const resp = await jiraSyncAdapter.searchIssues(jql, 15, `summary,issuetype,status,${JIRA_REPO_FIELD}`);
        const issues = resp?.data ?? resp?.issues ?? [];
        setResults(issues);
        setShowDrop(true);
      } catch (err) {
        console.error('[JiraTicketSearch] error buscando tickets', err);
        setResults([]);
      } finally { setLoading(false); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const selectTicket = (issue) => {
    const key = issue.key;
    if (value.includes(key)) return;
    const newMap = { ...ticketMap, [key]: issue };
    setTicketMap(newMap);
    const newKeys = [...value, key];
    onChange(newKeys, newKeys.map(k => newMap[k]).filter(Boolean));
    setQuery('');
    setResults([]);
    setShowDrop(false);
  };

  const removeTicket = (key) => {
    const newKeys = value.filter(k => k !== key);
    const newMap = { ...ticketMap };
    delete newMap[key];
    setTicketMap(newMap);
    onChange(newKeys, newKeys.map(k => newMap[k]).filter(Boolean));
  };

  const getSummary = (key) => {
    const t = ticketMap[key];
    return t?.fields?.summary ?? t?.summary ?? '';
  };

  return (
    <div ref={wrapRef} style={{position:'relative'}}>
      {/* Chips de tickets seleccionados */}
      <div style={{...inpStyle({display:'flex',flexWrap:'wrap',gap:4,minHeight:40,
        cursor:'text',width:'auto',padding:'6px 10px'})}}>
        {value.map(k=>(
          <span key={k} style={{display:'flex',alignItems:'center',gap:4,padding:'2px 8px',
            background:'rgba(124,58,237,.15)',color:'#a78bfa',borderRadius:6,fontSize:12,fontFamily:'monospace',
            maxWidth:260,overflow:'hidden'}}>
            <strong>{k}</strong>
            {getSummary(k) && <span style={{fontSize:11,opacity:.8,overflow:'hidden',textOverflow:'ellipsis',
              whiteSpace:'nowrap',maxWidth:160}}>{getSummary(k)}</span>}
            <span onClick={()=>removeTicket(k)} style={{cursor:'pointer',opacity:.7,flexShrink:0}}>×</span>
          </span>
        ))}
        <input value={query}
          onChange={e=>{setQuery(e.target.value);}}
          onFocus={()=>{ if(results.length) setShowDrop(true); }}
          placeholder={value.length?'Buscar mas tickets…':'Buscar tickets Jira…'}
          style={{background:'transparent',border:'none',outline:'none',fontSize:12,
            color:'var(--tx,#e4e4ef)',fontFamily:'inherit',flex:1,minWidth:140}}/>
        {loading && <span style={{fontSize:11,color:'var(--tx3,#50506a)'}}>…</span>}
      </div>

      {/* Dropdown de resultados */}
      {showDrop && results.length > 0 && (
        <div style={{position:'absolute',left:0,right:0,top:'100%',marginTop:4,zIndex:50,
          background:'var(--sf,#141418)',border:'1px solid var(--bd,#2a2a38)',borderRadius:8,
          maxHeight:240,overflowY:'auto',boxShadow:'0 8px 24px rgba(0,0,0,.5)'}}>
          {results.map(issue => {
            const key = issue.key;
            const summary = issue.fields?.summary ?? issue.summary ?? '';
            const type = issue.fields?.issuetype?.name ?? issue.issueType ?? '';
            const alreadySelected = value.includes(key);
            return (
              <div key={key}
                onClick={()=>!alreadySelected && selectTicket(issue)}
                style={{padding:'8px 12px',cursor:alreadySelected?'default':'pointer',
                  display:'flex',alignItems:'center',gap:8,fontSize:12,
                  borderBottom:'1px solid var(--bd,#2a2a38)',
                  opacity:alreadySelected?.5:1,
                  background:alreadySelected?'rgba(124,58,237,.05)':'transparent'}}>
                <span style={{fontFamily:'monospace',fontWeight:700,color:'#a78bfa',flexShrink:0}}>{key}</span>
                {type && <span style={{fontSize:10,padding:'1px 6px',borderRadius:4,
                  background:'var(--sf2,#1b1b22)',color:'var(--tx3,#50506a)',flexShrink:0}}>{type}</span>}
                <span style={{color:'var(--tx,#e4e4ef)',overflow:'hidden',textOverflow:'ellipsis',
                  whiteSpace:'nowrap'}}>{summary}</span>
                {alreadySelected && <span style={{marginLeft:'auto',fontSize:10,color:'var(--tx3,#50506a)'}}>Agregada</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Extract repos from Jira ticket data ──────────────────────────────────────
function extractReposFromTickets(ticketData) {
  const repos = new Set();
  for (const ticket of ticketData) {
    const repoField = ticket?.fields?.[JIRA_REPO_FIELD];
    if (!repoField) continue;
    // El campo puede ser string (separado por comas), array, u objeto
    if (Array.isArray(repoField)) {
      repoField.forEach(r => { if (typeof r === 'string') repos.add(r.trim()); else if (r?.name) repos.add(r.name.trim()); });
    } else if (typeof repoField === 'string') {
      repoField.split(',').map(s => s.trim()).filter(Boolean).forEach(r => repos.add(r));
    }
  }
  return [...repos];
}

// ── Reservation form ──────────────────────────────────────────────────────────
function ReservationForm({ res, envs, repos, allRes, policy, currentUser, onSave, onClose }) {
  const isEdit  = !!res;
  const isAdmin = currentUser?.role==='admin';
  const [envId,setEnvId]           = useState(res?.environmentId??'');
  const [jiras,setJiras]           = useState(res?.jiraIssueKeys??[]);
  const [ticketData,setTicketData] = useState([]);
  const [desc,setDesc]             = useState(res?.description??'');
  const [start,setStart]           = useState(res?.plannedStart?res.plannedStart.slice(0,16):'');
  const [end,setEnd]               = useState(res?.plannedEnd?res.plannedEnd.slice(0,16):'');
  const [error,setError]           = useState('');
  const selEnv = envs.find(e=>e.id===envId);

  const extractedRepos = useMemo(() => extractReposFromTickets(ticketData), [ticketData]);

  const handleJiraChange = (keys, data) => {
    setJiras(keys);
    setTicketData(data);
  };

  const submit = () => {
    if(!envId)       {setError('Selecciona un entorno.');return;}
    if(!jiras.length){setError('Añade al menos una clave Jira.');return;}
    if(!start||!end) {setError('Inicio y fin son obligatorios.');return;}
    const draft = {
      id:res?.id??uid(), environmentId:envId,
      reservedByUserId:res?.reservedByUserId??currentUser?.id,
      jiraIssueKeys:jiras, description:desc.trim()||null,
      plannedStart:new Date(start).toISOString(), plannedEnd:new Date(end).toISOString(),
      status:res?.status??(new Date(start)<=new Date()?'InUse':'Reserved'),
      selectedRepositoryIds:[], usageSession:res?.usageSession??null,
      policyFlags:{exceedsMaxDuration:false},
      extractedRepos,
    };
    const err = upsertUC.validate(draft,allRes,selEnv?.maxReservationDuration??999,policy,isAdmin);
    if(err){setError(err);return;}
    onSave(draft);
  };

  return (
    <Modal title={isEdit?'Editar reserva':'Nueva reserva'} onClose={onClose}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div>
          <label style={lblStyle}>Entorno</label>
          <select value={envId} onChange={e=>setEnvId(e.target.value)} style={inpStyle()}>
            <option value="">Selecciona entorno…</option>
            {envs.filter(e=>!e.isArchived&&(isAdmin||!e.isLocked)).map(e=>(
              <option key={e.id} value={e.id}>
                {e.isLocked?'🔒 ':''}{e.name} ({e.category}) — max {e.maxReservationDuration}h
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={lblStyle}>Tickets Jira</label>
          <JiraTicketSearch value={jiras} onChange={handleJiraChange}/>
        </div>
        <div>
          <label style={lblStyle}>Descripción <span style={{fontWeight:400,textTransform:'none'}}>(opcional)</span></label>
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={2}
            style={inpStyle({resize:'vertical'})} placeholder="Propósito de la reserva…"/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div><label style={lblStyle}>Inicio</label>
            <input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} style={inpStyle()}/></div>
          <div><label style={lblStyle}>Fin</label>
            <input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} style={inpStyle()}/></div>
        </div>
        {/* Repositorios extraidos de los tickets Jira (solo lectura) */}
        {extractedRepos.length > 0 && (
          <div>
            <label style={lblStyle}>Repositorios (desde Jira)</label>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {extractedRepos.map(name => (
                <span key={name} style={{padding:'4px 10px',fontSize:12,borderRadius:20,fontFamily:'inherit',
                  background:'rgba(124,58,237,.15)',color:'#a78bfa',
                  border:'1px solid rgba(124,58,237,.3)'}}>
                  📦 {name}
                </span>
              ))}
            </div>
          </div>
        )}
        {error&&<div style={{padding:'8px 12px',background:'rgba(239,68,68,.1)',
          border:'1px solid rgba(239,68,68,.3)',borderRadius:8,fontSize:12,color:'#ef4444'}}>⛔ {error}</div>}
        <div style={{display:'flex',justifyContent:'flex-end',gap:8,paddingTop:8,
          borderTop:'1px solid var(--bd,#2a2a38)'}}>
          <button style={btnStyle('ghost')} onClick={onClose}>Cancelar</button>
          <button style={btnStyle('primary')} onClick={submit}>{isEdit?'Actualizar':'Crear'}</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Reservation detail ────────────────────────────────────────────────────────
function ReservationDetail({ res, envs, repos, users, currentUser, onClose, onEdit, onCheckIn, onCheckOut, onCancel, onAddBranch, jiraBaseUrl="" }) {
  const env     = envs.find(e=>e.id===res.environmentId);
  const isOwner = currentUser?.id===res.reservedByUserId;
  const isAdmin = currentUser?.role==='admin';
  const owner   = users?.find(u=>u.id===res.reservedByUserId);
  const [branch,setBranch] = useState('');
  const [showB,setShowB]   = useState(false);
  const repoNames = (res.selectedRepositoryIds??[]).map(id=>repos.find(r=>r.id===id)?.name).filter(Boolean);
  const extractedRepoNames = res.extractedRepos ?? [];
  const canEdit   = (isOwner||isAdmin)&&['Reserved','PolicyViolation','InUse'].includes(res.status);
  const canCI     = isOwner&&res.status==='Reserved';
  const canCO     = isOwner&&res.status==='InUse';
  const canCancel = (isOwner||isAdmin)&&['Reserved','InUse','PolicyViolation'].includes(res.status);
  const cat = CAT[env?.category]??CAT.DEV;

  const allRepos = [...new Set([...repoNames, ...extractedRepoNames])];

  return (
    <Modal title="Detalle de reserva" onClose={onClose}>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {env&&<span style={{padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:700,
            background:cat.bg,color:cat.color}}>{env.category}</span>}
          <span style={{fontWeight:700,fontSize:16,color:'var(--tx,#e4e4ef)'}}>{env?.name}</span>
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
          {(res.jiraIssueKeys??[]).map(k=>(
            <a key={k} href={`${jiraBaseUrl}/browse/${k}`} target="_blank" rel="noopener noreferrer"
              style={{padding:'3px 10px',borderRadius:6,fontSize:12,fontFamily:'monospace',
              background:'rgba(124,58,237,.15)',color:'#a78bfa',textDecoration:'none'}}>{k} ↗</a>
          ))}
        </div>
        {res.description&&<p style={{fontSize:13,color:'var(--tx3,#50506a)',lineHeight:1.5}}>{res.description}</p>}
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
              <div style={{fontSize:10,fontWeight:700,color:'var(--tx3,#50506a)',
                textTransform:'uppercase',letterSpacing:'.04em',marginBottom:2}}>{l}</div>
              <div style={{color:'var(--tx,#e4e4ef)'}}>{v}</div>
            </div>
          ))}
        </div>
        {allRepos.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:4}}>
          {allRepos.map(n=><span key={n} style={{padding:'2px 8px',borderRadius:4,fontSize:12,
            background:'var(--sf2,#1b1b22)',color:'var(--tx3,#50506a)'}}>📦 {n}</span>)}
        </div>}
        {(res.usageSession?.branches??[]).length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:4}}>
          {res.usageSession.branches.map(b=><span key={b} style={{padding:'2px 8px',borderRadius:4,
            fontSize:12,fontFamily:'monospace',background:'rgba(124,58,237,.12)',color:'#a78bfa'}}>{b}</span>)}
        </div>}
        {res.status==='InUse'&&isOwner&&(
          <div>
            {showB?(
              <div style={{display:'flex',gap:6}}>
                <input value={branch} onChange={e=>setBranch(e.target.value)} autoFocus placeholder="nombre-rama"
                  style={inpStyle({fontFamily:'monospace',flex:1,width:'auto'})}
                  onKeyDown={e=>{if(e.key==='Enter'&&branch.trim()){onAddBranch(branch.trim());setBranch('');setShowB(false);}}}/>
                <button style={btnStyle('primary',{padding:'6px 12px'})}
                  onClick={()=>{if(branch.trim()){onAddBranch(branch.trim());setBranch('');setShowB(false);}}}>Añadir</button>
                <button style={btnStyle('ghost',{padding:'6px 12px'})} onClick={()=>setShowB(false)}>×</button>
              </div>
            ):(
              <button style={btnStyle('outline',{fontSize:12})} onClick={()=>setShowB(true)}>+ Añadir rama</button>
            )}
          </div>
        )}
        {env?.url&&<a href={env.url} target="_blank" rel="noopener noreferrer"
          style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'9px 14px',
            background:'var(--ac,#4f6ef7)',color:'#fff',borderRadius:8,textDecoration:'none',fontSize:14,fontWeight:600}}>
          🔗 Acceder al entorno
        </a>}
        <div style={{display:'flex',flexWrap:'wrap',gap:8,paddingTop:12,borderTop:'1px solid var(--bd,#2a2a38)'}}>
          {canEdit  &&<button style={btnStyle('primary')} onClick={()=>onEdit(res)}>✏️ Editar</button>}
          {canCI    &&<button style={btnStyle('success')} onClick={onCheckIn}>▶ Iniciar</button>}
          {canCO    &&<button style={btnStyle('warn')}    onClick={onCheckOut}>⏹ Finalizar</button>}
          {canCancel&&<button style={btnStyle('danger')}  onClick={onCancel}>✕ Cancelar</button>}
          <div style={{marginLeft:'auto'}}>
            <button style={btnStyle('ghost')} onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Confirm ───────────────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{position:'fixed',inset:0,zIndex:300,display:'flex',alignItems:'center',
      justifyContent:'center',background:'rgba(0,0,0,.7)',padding:16}} onClick={onCancel}>
      <div onClick={e=>e.stopPropagation()}
        style={{background:'var(--sf,#141418)',border:'1px solid var(--bd,#2a2a38)',
          borderRadius:14,maxWidth:400,width:'100%',overflow:'hidden',
          boxShadow:'0 24px 60px rgba(0,0,0,.6)'}}>
        <div style={{padding:'18px 20px 16px',borderBottom:'1px solid var(--bd,#2a2a38)'}}>
          <span style={{fontWeight:700,fontSize:15,color:'var(--tx,#e4e4ef)'}}>⚠️ Confirmar acción</span>
        </div>
        <div style={{padding:'16px 20px'}}>
          <p style={{color:'var(--tx3,#50506a)',fontSize:13,lineHeight:1.6,marginBottom:20}}>{message}</p>
          <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
            <button style={btnStyle('ghost')} onClick={onCancel}>Cancelar</button>
            <button style={btnStyle('danger')} onClick={()=>{onConfirm();onCancel();}}>Confirmar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Gantt view ────────────────────────────────────────────────────────────────
const GANTT_CAT_COLORS = {
  DEV:     { color: '#a78bfa', bg: 'rgba(124,58,237,.15)' },
  PRE:     { color: '#fbbf24', bg: 'rgba(180,83,9,.15)' },
  STAGING: { color: '#22d3ee', bg: 'rgba(14,116,144,.15)' },
};

function GanttView({ reservations, envs, onBarClick }) {
  const bars = useMemo(() => reservations
    .filter(r => r.plannedStart && r.plannedEnd)
    .map(r => {
      const env = envs.find(e => e.id === r.environmentId);
      const catColors = GANTT_CAT_COLORS[env?.category] ?? GANTT_CAT_COLORS.DEV;
      const startDate = r.plannedStart.slice(0, 10);
      const endDate = r.plannedEnd.slice(0, 10);
      const jiraStr = (r.jiraIssueKeys ?? []).join(', ');
      return {
        id: r.id,
        label: env?.name ?? '—',
        startDate,
        endDate,
        color: catColors.color,
        bgColor: catColors.bg,
        status: r.status,
        meta: `${durH(r.plannedStart, r.plannedEnd)}h${jiraStr ? ' · ' + jiraStr : ''}`,
      };
    }), [reservations, envs]);

  if (!bars.length) {
    return (
      <div style={{textAlign:'center',padding:'40px 0',color:'var(--tx3,#50506a)',fontSize:13}}>
        No hay reservas con fechas para mostrar en el Gantt.
      </div>
    );
  }

  return <GanttTimeline bars={bars} onBarClick={onBarClick} />;
}

// ── History view ──────────────────────────────────────────────────────────────
function HistoryView() {
  const [history, setHistory]   = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await historyRepo.findRecent(2);
        if (!cancelled) setHistory(data);
      } catch (err) {
        console.error('[HistoryView] error cargando historial', err);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const thStyle = {
    padding:'8px 12px', fontSize:11, fontWeight:700, color:'var(--tx3,#50506a)',
    textTransform:'uppercase', letterSpacing:'.04em', textAlign:'left',
    borderBottom:'1px solid var(--bd,#2a2a38)', background:'var(--sf2,#1b1b22)',
  };
  const tdStyle = {
    padding:'8px 12px', fontSize:12, color:'var(--tx,#e4e4ef)',
    borderBottom:'1px solid var(--bd,#2a2a38)',
  };

  const statusBadge = (status) => {
    const map = {
      Reserved:  { color:'#4f6ef7', bg:'rgba(79,110,247,.12)' },
      InUse:     { color:'#22c55e', bg:'rgba(34,197,94,.12)' },
      Completed: { color:'#a78bfa', bg:'rgba(124,58,237,.12)' },
      Cancelled: { color:'#ef4444', bg:'rgba(239,68,68,.12)' },
    };
    const s = map[status] ?? map.Reserved;
    return (
      <span style={{padding:'2px 8px',borderRadius:12,fontSize:11,fontWeight:600,
        background:s.bg,color:s.color}}>{status}</span>
    );
  };

  if (loading) {
    return (
      <div style={{textAlign:'center',padding:'40px 0',color:'var(--tx3,#50506a)',fontSize:13}}>
        Cargando historial…
      </div>
    );
  }

  if (!history.length) {
    return (
      <div style={{textAlign:'center',padding:'40px 0',color:'var(--tx3,#50506a)',fontSize:13}}>
        Sin registros en los últimos 2 meses.
      </div>
    );
  }

  return (
    <div style={{overflowX:'auto'}}>
      <table style={{width:'100%',borderCollapse:'collapse',minWidth:800}}>
        <thead>
          <tr>
            <th style={thStyle}>Fecha</th>
            <th style={thStyle}>Usuario</th>
            <th style={thStyle}>Entorno</th>
            <th style={thStyle}>Claves Jira</th>
            <th style={thStyle}>Repos</th>
            <th style={thStyle}>Duración</th>
            <th style={thStyle}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {history.map(h => (
            <tr key={h.id}>
              <td style={tdStyle}>{fmtDt(h.created_at)}</td>
              <td style={tdStyle}>{h.reserved_by_name || '—'}</td>
              <td style={tdStyle}>{h.environment_name || '—'}</td>
              <td style={tdStyle}>
                <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                  {(h.jira_issue_keys??[]).map(k=>(
                    <span key={k} style={{padding:'1px 6px',borderRadius:4,fontSize:11,fontFamily:'monospace',
                      background:'rgba(124,58,237,.12)',color:'#a78bfa'}}>{k}</span>
                  ))}
                </div>
              </td>
              <td style={tdStyle}>
                <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                  {(h.repos??[]).map(r=>(
                    <span key={r} style={{padding:'1px 6px',borderRadius:4,fontSize:11,
                      background:'var(--sf2,#1b1b22)',color:'var(--tx3,#50506a)'}}>{r}</span>
                  ))}
                  {(!h.repos||!h.repos.length)&&<span style={{color:'var(--tx3,#50506a)'}}>—</span>}
                </div>
              </td>
              <td style={tdStyle}>
                {h.planned_start && h.planned_end
                  ? durH(h.planned_start, h.actual_end ?? h.planned_end) + 'h'
                  : '—'}
              </td>
              <td style={tdStyle}>{statusBadge(h.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────
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
  const [mainTab, setMainTab] = useState('reservas');
  const [jiraBaseUrl, setJiraBaseUrl] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, { reservations, repositories, policy:pol }] = await Promise.all([
        getEnvs.execute(), getRes.execute(),
      ]);
      setEnvs(e); setRes(reservations); setRepos(repositories); setPolicy(pol);
      // Load Jira base URL
      try {
        const connRes = await fetch(`${API_BASE}/jira/connection`, { headers: await getAuthHeaders() });
        const connData = await connRes.json();
        if(connData.ok && connData.data?.base_url) setJiraBaseUrl(connData.data.base_url.replace(/\/$/,''));
      } catch {}
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

  // Mapear al formato que entiende DeployTimeline (sin modificarlo)
  const deploymentShapes = visible.map(r => toDeploymentShape(r, envs.find(e=>e.id===r.environmentId)));

  const patchLocal = (id,patch) => setRes(p=>p.map(x=>x.id===id?{...x,...patch}:x));

  const handleSave = async draft => {
    await upsertUC.execute(draft);
    setRes(prev=>{ const i=prev.findIndex(r=>r.id===draft.id);
      return i>=0?prev.map(r=>r.id===draft.id?draft:r):[...prev,draft]; });
    setForm(null);
  };

  const handleCheckIn = async r => {
    const session={actual_start:new Date().toISOString(),actual_end:null,branches:[]};
    await statusUC.checkIn(r.id); patchLocal(r.id,{status:'InUse',usageSession:session}); setDetail(null);
  };
  const handleCheckOut = async r => {
    await statusUC.checkOut(r.id,r); patchLocal(r.id,{status:'Completed'}); setDetail(null);
  };
  const handleCancel = r => setConfirm({
    message:'¿Seguro que quieres cancelar esta reserva?',
    onConfirm:async()=>{ await statusUC.cancel(r.id); patchLocal(r.id,{status:'Cancelled'}); setDetail(null); },
  });
  const handleAddBranch = async (r,branch) => {
    await statusUC.addBranch(r.id,branch,r);
    const branches=[...(r.usageSession?.branches??[]),branch];
    const session={...r.usageSession,branches};
    patchLocal(r.id,{usageSession:session});
    setDetail(d=>d?.id===r.id?{...d,usageSession:session}:d);
  };

  // DeployTimeline llama onSelect con el objeto que le pasamos → buscamos la reserva por id
  const handleSelect = deployment => {
    const reservation = res.find(r=>r.id===deployment.id);
    if(reservation) setDetail(reservation);
  };

  const handleGanttBarClick = (barId) => {
    const reservation = res.find(r => r.id === barId);
    if (reservation) setDetail(reservation);
  };

  const filterTabs=[{id:'all',label:'Todas'},{id:'active',label:'Activas'},{id:'mine',label:'Mis reservas'}];
  const mainTabs=[{id:'reservas',label:'Reservas'},{id:'gantt',label:'Timeline'},{id:'historial',label:'Historial'}];

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Main tabs */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 20px',
        borderBottom:'1px solid var(--bd,#2a2a38)',background:'var(--sf,#141418)',flexShrink:0}}>
        <div style={{display:'flex',gap:2,background:'var(--sf2,#1b1b22)',
          border:'1px solid var(--bd,#2a2a38)',borderRadius:8,padding:3}}>
          {mainTabs.map(t=>(
            <button key={t.id} onClick={()=>setMainTab(t.id)}
              style={{padding:'4px 12px',fontSize:12,fontWeight:mainTab===t.id?600:400,borderRadius:6,
                border:'none',cursor:'pointer',fontFamily:'inherit',
                background:mainTab===t.id?'var(--ac,#4f6ef7)':'transparent',
                color:mainTab===t.id?'#fff':'var(--tx3,#50506a)',
                boxShadow:mainTab===t.id?'0 1px 3px rgba(0,0,0,.15)':'none'}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Filter bar solo en vista Reservas */}
        {mainTab==='reservas'&&(
          <>
            <div style={{display:'flex',gap:2,background:'var(--sf2,#1b1b22)',
              border:'1px solid var(--bd,#2a2a38)',borderRadius:8,padding:3,marginLeft:8}}>
              {filterTabs.map(t=>(
                <button key={t.id} onClick={()=>setFilter(t.id)}
                  style={{padding:'4px 12px',fontSize:12,fontWeight:filter===t.id?600:400,borderRadius:6,
                    border:'none',cursor:'pointer',fontFamily:'inherit',
                    background:filter===t.id?'var(--sf,#141418)':'transparent',
                    color:filter===t.id?'var(--tx,#e4e4ef)':'var(--tx3,#50506a)',
                    boxShadow:filter===t.id?'0 1px 3px rgba(0,0,0,.15)':'none'}}>
                  {t.label}
                </button>
              ))}
            </div>
            <input placeholder="Buscar por ticket o entorno…" value={search} onChange={e=>setSearch(e.target.value)}
              style={inpStyle({width:200,padding:'6px 10px',fontSize:12})}/>
          </>
        )}

        <div style={{marginLeft:'auto'}}>
          <button style={btnStyle('primary',{padding:'7px 14px'})} onClick={()=>setForm('new')}>
            + Nueva reserva
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>
        {mainTab==='reservas' && (
          <>
            {loading ? (
              <div style={{textAlign:'center',padding:'40px 0',color:'var(--tx3,#50506a)',fontSize:13}}>
                Cargando reservas…
              </div>
            ) : (
              <div style={{maxWidth:760}}>
                <DeployTimeline
                  deployments={deploymentShapes}
                  onSelect={handleSelect}
                />
              </div>
            )}
          </>
        )}

        {mainTab==='gantt' && (
          <>
            {loading ? (
              <div style={{textAlign:'center',padding:'40px 0',color:'var(--tx3,#50506a)',fontSize:13}}>
                Cargando…
              </div>
            ) : (
              <GanttView reservations={visible} envs={envs} onBarClick={handleGanttBarClick} />
            )}
          </>
        )}

        {mainTab==='historial' && <HistoryView />}
      </div>

      {form&&<ReservationForm res={form==='new'?null:form} envs={envs} repos={repos} allRes={res}
        policy={policy} currentUser={currentUser} onSave={handleSave} onClose={()=>setForm(null)}/>}

      {detail&&<ReservationDetail res={detail} envs={envs} repos={repos} users={wsUsers??[]}
        currentUser={currentUser} onClose={()=>setDetail(null)}
        onEdit={r=>{setDetail(null);setForm(r);}}
        onCheckIn={()=>handleCheckIn(detail)} onCheckOut={()=>handleCheckOut(detail)}
        onCancel={()=>handleCancel(detail)} onAddBranch={b=>handleAddBranch(detail,b)}
        jiraBaseUrl={jiraBaseUrl}/>}

      {confirm&&<ConfirmDialog message={confirm.message}
        onConfirm={confirm.onConfirm} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
