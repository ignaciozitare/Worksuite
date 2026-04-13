// @ts-nocheck
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase }                from '@/shared/lib/supabaseClient';
// Usamos el mismo DeployTimeline de Deploy Planner — sin tocarlo
import { DeployTimeline }          from '../../deploy-planner/ui/DeployTimeline';
import { GanttTimeline, JiraTicketPicker, DateRangePicker } from '@worksuite/ui';
import { useTranslation }                 from '@worksuite/i18n';
import { extractReposFromTickets }        from '@worksuite/jira-service';
import { SupabaseReservationHistoryRepo } from '../infra/supabase/SupabaseReservationHistoryRepo';
import { SupabaseJiraConfigRepo }         from '../infra/supabase/SupabaseJiraConfigRepo';
import { SupabaseReservationStatusRepo }  from '../infra/supabase/SupabaseReservationStatusRepo';
import { SupabaseJiraFilterConfigRepo }   from '../infra/supabase/SupabaseJiraFilterConfigRepo';
import type { Environment }        from '../domain/entities/Environment';
import type { Reservation, Repository, EnvPolicy } from '../domain/entities/Reservation';
import { SupabaseEnvironmentRepo } from '../infra/supabase/SupabaseEnvironmentRepo';
import { SupabaseReservationRepo } from '../infra/supabase/SupabaseReservationRepo';
import { GetEnvironments }         from '../domain/useCases/GetEnvironments';
import { GetReservations }         from '../domain/useCases/GetReservations';
import { UpsertReservation }       from '../domain/useCases/UpsertReservation';
import { UpdateReservationStatus } from '../domain/useCases/UpdateReservationStatus';
import { HttpJiraApiAdapter }      from '@/shared/infra/HttpJiraApiAdapter';

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
const jiraApi = new HttpJiraApiAdapter(API_BASE, getAuthHeaders);
const historyRepo        = new SupabaseReservationHistoryRepo(supabase);
const jiraConfigRepo     = new SupabaseJiraConfigRepo(supabase);
const statusRepo         = new SupabaseReservationStatusRepo(supabase);
const jiraFilterRepo     = new SupabaseJiraFilterConfigRepo(supabase);

// ── Map reservation status category → DeployTimeline's visual vocabulary ────
const CATEGORY_TO_TIMELINE_STATUS = {
  reserved:  'planned',
  in_use:    'in-progress',
  completed: 'deployed',
  cancelled: 'cancelled',
  violation: 'rolled-back',
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
    status:      CATEGORY_TO_TIMELINE_STATUS[res.statusCategory] ?? 'planned',
    environment: CAT_MAP[env?.category] ?? 'development',
    version:     env?.name ?? '—',
    planned_at:  res.plannedStart,
    notes:       res.description ?? undefined,
    jira_issues: res.jiraIssueKeys,
    repos:       res.extractedRepos ?? [],
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

// NOTE: JiraTicketSearch + extractReposFromTickets now live in
// @worksuite/ui and @worksuite/jira-service (see imports at the top).

// ── Reservation form ──────────────────────────────────────────────────────────
function ReservationForm({ res, envs, repos, allRes, policy, currentUser, onSave, onClose, availableTickets, ticketsLoading, repoField, reservedStatus, inUseStatus }) {
  const { t } = useTranslation();
  const isEdit  = !!res;
  const isAdmin = currentUser?.role==='admin';
  const [envId,setEnvId]           = useState(res?.environmentId??'');
  const [jiras,setJiras]           = useState(res?.jiraIssueKeys??[]);
  const [selectedTickets,setSelectedTickets] = useState([]);
  const [desc,setDesc]             = useState(res?.description??'');
  const [start,setStart]           = useState(res?.plannedStart?res.plannedStart.slice(0,16):'');
  const [end,setEnd]               = useState(res?.plannedEnd?res.plannedEnd.slice(0,16):'');
  const [error,setError]           = useState('');
  const selEnv = envs.find(e=>e.id===envId);

  const extractedRepos = useMemo(
    () => extractReposFromTickets(selectedTickets.map(t=>({ fields: t.fields ?? {} })), repoField),
    [selectedTickets, repoField],
  );

  const handleTicketsChange = (keys, tickets) => {
    setJiras(keys);
    setSelectedTickets(tickets);
  };

  const submit = () => {
    if(!envId)       {setError('Selecciona un entorno.');return;}
    if(!jiras.length){setError('Añade al menos una clave Jira.');return;}
    if(!start||!end) {setError('Inicio y fin son obligatorios.');return;}
    // When creating a new reservation we pick the right status based on
    // start time: if it's already past, use an "in_use" status; otherwise
    // the default "reserved" one. Both are resolved from the dynamic catalog.
    const isPast = new Date(start) <= new Date();
    const initialStatus = isPast && inUseStatus ? inUseStatus : reservedStatus;
    const draft = {
      id:res?.id??uid(), environmentId:envId,
      reservedByUserId:res?.reservedByUserId??currentUser?.id,
      jiraIssueKeys:jiras, description:desc.trim()||null,
      plannedStart:new Date(start).toISOString(), plannedEnd:new Date(end).toISOString(),
      statusId:       res?.statusId       ?? initialStatus?.id,
      statusCategory: res?.statusCategory ?? initialStatus?.status_category,
      statusName:     res?.statusName     ?? initialStatus?.name,
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
          <label style={lblStyle}>{t('admin.envReservationPickerLabel')}</label>
          <JiraTicketPicker
            tickets={availableTickets}
            value={jiras}
            onChange={handleTicketsChange}
            loading={ticketsLoading}
            labels={{
              searchPlaceholder: t('admin.envReservationPickerSearch'),
              empty:             t('admin.envReservationPickerEmpty'),
              noMatches:         t('admin.envReservationPickerNoMatches'),
              loading:           t('admin.envReservationPickerLoading'),
            }}
          />
        </div>
        <div>
          <label style={lblStyle}>Descripción <span style={{fontWeight:400,textTransform:'none'}}>(opcional)</span></label>
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={2}
            style={inpStyle({resize:'vertical'})} placeholder="Propósito de la reserva…"/>
        </div>
        <DateRangePicker
          startValue={start}
          endValue={end}
          onChange={(s, e) => { setStart(s); setEnd(e); }}
          maxDurationHours={selEnv?.maxReservationDuration ?? 0}
          labels={{ start: 'Inicio', end: 'Fin', time: 'Hora' }}
        />
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
  const canEdit   = (isOwner||isAdmin)&&['reserved','violation','in_use'].includes(res.statusCategory);
  const canCI     = (isOwner||isAdmin)&&res.statusCategory==='reserved';
  const canCO     = (isOwner||isAdmin)&&res.statusCategory==='in_use';
  const canCancel = (isOwner||isAdmin)&&['reserved','in_use','violation'].includes(res.statusCategory);
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
        {res.statusCategory==='in_use'&&isOwner&&(
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
        status: r.statusCategory,
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
function HistoryView({ onSelect }) {
  const [history, setHistory]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);

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
            <tr key={h.id} onClick={()=>setSelected(h)}
              style={{cursor:'pointer',transition:'background .1s'}}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(79,110,247,.06)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
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

      {/* History detail modal */}
      {selected && (
        <Modal title="Detalle de reserva (historial)" onClose={()=>setSelected(null)} width={560}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {statusBadge(selected.status)}
              <span style={{fontWeight:700,fontSize:16,color:'var(--tx,#e4e4ef)'}}>{selected.environment_name}</span>
            </div>

            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
              {(selected.jira_issue_keys??[]).map(k=>(
                <span key={k} style={{padding:'3px 10px',borderRadius:6,fontSize:12,fontFamily:'monospace',
                  background:'rgba(124,58,237,.15)',color:'#a78bfa'}}>{k}</span>
              ))}
            </div>

            {selected.description&&<p style={{fontSize:13,color:'var(--tx3,#50506a)',lineHeight:1.5}}>{selected.description}</p>}

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,fontSize:12}}>
              {[
                ['Responsable',  selected.reserved_by_name || '—'],
                ['Entorno',      selected.environment_name || '—'],
                ['Inicio plan.', selected.planned_start ? fmtDt(selected.planned_start) : '—'],
                ['Fin plan.',    selected.planned_end   ? fmtDt(selected.planned_end)   : '—'],
                ['Fin real',     selected.actual_end    ? fmtDt(selected.actual_end)     : '—'],
                ['Duración',     selected.planned_start && selected.planned_end
                                   ? durH(selected.planned_start, selected.actual_end ?? selected.planned_end) + 'h' : '—'],
                ['Registrado',   selected.created_at ? fmtDt(selected.created_at) : '—'],
              ].map(([l,v])=>(
                <div key={l}>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--tx3,#50506a)',
                    textTransform:'uppercase',letterSpacing:'.04em',marginBottom:2}}>{l}</div>
                  <div style={{color:'var(--tx,#e4e4ef)'}}>{v}</div>
                </div>
              ))}
            </div>

            {(selected.repos??[]).length>0&&(
              <div>
                <div style={{fontSize:10,fontWeight:700,color:'var(--tx3,#50506a)',textTransform:'uppercase',
                  letterSpacing:'.04em',marginBottom:4}}>Repositorios</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                  {selected.repos.map(r=>(
                    <span key={r} style={{padding:'3px 8px',borderRadius:4,fontSize:12,
                      background:'var(--sf2,#1b1b22)',color:'var(--tx3,#50506a)'}}>📦 {r}</span>
                  ))}
                </div>
              </div>
            )}

            <div style={{display:'flex',justifyContent:'flex-end',paddingTop:8,borderTop:'1px solid var(--bd,#2a2a38)'}}>
              <button style={btnStyle('ghost')} onClick={()=>setSelected(null)}>Cerrar</button>
            </div>
          </div>
        </Modal>
      )}
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
  const [repoField, setRepoField] = useState('components');
  const [statuses, setStatuses] = useState([]);
  const [availableTickets, setAvailableTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading]     = useState(false);

  // Pick the first status of each category — used for lifecycle transitions.
  // If the admin creates multiple statuses per category, the first (lowest ord)
  // is used as the default for that transition.
  const statusOfCategory = (cat) =>
    statuses.find(s => s.status_category === cat) ?? null;
  const reservedStatus  = statusOfCategory('reserved');
  const inUseStatus     = statusOfCategory('in_use');
  const completedStatus = statusOfCategory('completed');
  const cancelledStatus = statusOfCategory('cancelled');

  // Fetch candidate Jira tickets using the admin-configured filter.
  // Called when the user opens the reservation modal.
  const loadAvailableTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const cfg = await jiraFilterRepo.get();
      const parts = [];
      if (cfg.projectKeys.length) parts.push(`project in (${cfg.projectKeys.map(k=>`"${k}"`).join(',')})`);
      if (cfg.issueTypes.length)  parts.push(`issuetype in (${cfg.issueTypes.map(n=>`"${n}"`).join(',')})`);
      if (cfg.statuses.length)    parts.push(`status in (${cfg.statuses.map(n=>`"${n}"`).join(',')})`);
      const jql = (parts.length ? parts.join(' AND ') + ' ' : '') + 'ORDER BY updated DESC';
      const raw = await jiraApi.searchIssues({
        jql,
        maxResults: 200,
        fields: `summary,issuetype,status,${repoField}`,
      });
      const mapped = raw.map((i) => ({
        key:       i.key,
        summary:   i.fields?.summary ?? '',
        issueType: i.fields?.issuetype?.name ?? '',
        status:    i.fields?.status?.name ?? '',
        fields:    i.fields,
      }));
      setAvailableTickets(mapped);
    } catch (err) {
      console.error('[EnvironmentsView] loadAvailableTickets error', err);
      setAvailableTickets([]);
    } finally { setTicketsLoading(false); }
  }, [repoField]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Load statuses first so GetReservations can resolve the auto-complete
      // status id for expired reservations.
      const sts = await statusRepo.findAll();
      setStatuses(sts);
      const completed = sts.find(s => s.status_category === 'completed') ?? null;

      const [e, { reservations, repositories, policy:pol }, rf] = await Promise.all([
        getEnvs.execute(), getRes.execute(completed?.id ?? null), jiraConfigRepo.getRepoField(),
      ]);
      setEnvs(e); setRes(reservations); setRepos(repositories); setPolicy(pol);
      setRepoField(rf);
      // Load Jira base URL
      try {
        const conn = await jiraApi.getConnection();
        if(conn?.base_url) setJiraBaseUrl(conn.base_url.replace(/\/$/,''));
      } catch {}
    } catch(err) {
      console.error('[EnvironmentsView]', err);
    } finally { setLoading(false); }
  }, []);

  useEffect(()=>{ void load(); },[load]);

  const visible = res.filter(r=>{
    if(filter==='active'&&!['reserved','in_use','violation'].includes(r.statusCategory)) return false;
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

  // Append a row to the history table whenever a reservation hits a final
  // state (completed / cancelled). Fire-and-forget: never block the UI flow.
  const saveHistory = async (r, finalStatusName, actualEnd) => {
    try {
      const env = envs.find(e=>e.id===r.environmentId);
      const owner = (wsUsers??[]).find(u=>u.id===r.reservedByUserId);
      await historyRepo.save({
        reservation_id:      r.id,
        environment_id:      r.environmentId,
        environment_name:    env?.name ?? '—',
        reserved_by_user_id: r.reservedByUserId,
        reserved_by_name:    owner?.name ?? owner?.email ?? '—',
        jira_issue_keys:     r.jiraIssueKeys ?? [],
        description:         r.description ?? undefined,
        planned_start:       r.plannedStart,
        planned_end:         r.plannedEnd,
        actual_end:          actualEnd,
        status:              finalStatusName,
        repos:               r.extractedRepos ?? [],
      });
    } catch (err) {
      console.error('[EnvironmentsView] saveHistory error', err);
    }
  };

  const handleSave = async draft => {
    await upsertUC.execute(draft);
    setRes(prev=>{ const i=prev.findIndex(r=>r.id===draft.id);
      return i>=0?prev.map(r=>r.id===draft.id?draft:r):[...prev,draft]; });
    setForm(null);
  };

  const handleCheckIn = async r => {
    if (!inUseStatus) { console.error('[EnvironmentsView] no in_use status configured'); return; }
    const session={actual_start:new Date().toISOString(),actual_end:null,branches:[]};
    await statusUC.checkIn(r.id, inUseStatus.id);
    patchLocal(r.id,{
      statusId: inUseStatus.id, statusCategory: 'in_use', statusName: inUseStatus.name,
      usageSession:session,
    });
    setDetail(null);
  };
  const handleCheckOut = async r => {
    if (!completedStatus) { console.error('[EnvironmentsView] no completed status configured'); return; }
    const actualEnd = new Date().toISOString();
    await statusUC.checkOut(r.id, r, completedStatus.id);
    patchLocal(r.id,{
      statusId: completedStatus.id, statusCategory: 'completed', statusName: completedStatus.name,
    });
    void saveHistory(r, completedStatus.name, actualEnd);
    setDetail(null);
  };
  const handleCancel = r => setConfirm({
    message:'¿Seguro que quieres cancelar esta reserva?',
    onConfirm:async()=>{
      if (!cancelledStatus) { console.error('[EnvironmentsView] no cancelled status configured'); return; }
      const actualEnd = new Date().toISOString();
      await statusUC.cancel(r.id, cancelledStatus.id);
      patchLocal(r.id,{
        statusId: cancelledStatus.id, statusCategory: 'cancelled', statusName: cancelledStatus.name,
      });
      void saveHistory(r, cancelledStatus.name, actualEnd);
      setDetail(null);
    },
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
  const mainTabs=[
    {id:'reservas', label:'Reservas',  icon:'event_note'},
    {id:'gantt',    label:'Timeline',  icon:'timeline'},
    {id:'historial',label:'Historial', icon:'history'},
  ];

  // ── Environment sidebar data ────────────────────────────────────────────────
  const [sidebarAvailOnly, setSidebarAvailOnly] = useState(false);
  const sortedEnvs = useMemo(() => {
    const active = envs.filter(e => !e.isArchived);
    const sorted = active.sort((a,b) => (a.priority??99) - (b.priority??99) || a.name.localeCompare(b.name));
    if (!sidebarAvailOnly) return sorted;
    return sorted.filter(env => {
      const activeRes = res.find(r => r.environmentId === env.id && ['reserved','in_use','violation'].includes(r.statusCategory));
      return !activeRes && !env.isLocked;
    });
  }, [envs, res, sidebarAvailOnly]);

  const getEnvStatus = useCallback((env) => {
    const activeRes = res.find(r => r.environmentId === env.id && ['reserved','in_use','violation'].includes(r.statusCategory));
    if (env.isLocked) return { occupied: true, label: '🔒', endDate: null };
    if (activeRes) return { occupied: true, label: activeRes.statusName ?? activeRes.statusCategory, endDate: activeRes.plannedEnd };
    return { occupied: false, label: '', endDate: null };
  }, [res]);

  return (
    <div className="ev" style={{display:'flex',height:'100%',overflow:'hidden',fontFamily:"'Inter',system-ui,-apple-system,sans-serif",background:'#131313',color:'#e5e2e1'}}>
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap');
.ev *{box-sizing:border-box;}
.ev button,.ev select,.ev input,.ev textarea{font-family:'Inter',system-ui,-apple-system,sans-serif;}
.ev .material-symbols-outlined{font-family:'Material Symbols Outlined';font-weight:300;font-style:normal;display:inline-block;line-height:1;text-transform:none;letter-spacing:normal;word-wrap:normal;white-space:nowrap;direction:ltr;-webkit-font-smoothing:antialiased;font-size:inherit;}
.ev ::-webkit-scrollbar{width:4px;height:4px;}
.ev ::-webkit-scrollbar-track{background:#131313;}
.ev ::-webkit-scrollbar-thumb{background:#424754;border-radius:2px;}
/* Nav sidebar */
.ev .ev-sidebar{position:sticky;top:0;width:240px;min-width:240px;height:100%;min-height:calc(100vh - 52px);align-self:stretch;background:rgba(14,14,14,.6);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-right:1px solid rgba(255,255,255,.05);box-shadow:0 0 60px rgba(77,142,255,.04);display:flex;flex-direction:column;padding:16px;gap:4px;z-index:30;overflow-y:auto;}
.ev .ev-nav-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;font-size:13px;font-weight:500;letter-spacing:.02em;cursor:pointer;border:none;background:transparent;color:#e5e2e1;opacity:.6;transition:all .2s;text-align:left;width:100%;font-family:inherit;}
.ev .ev-nav-item:hover{opacity:1;background:#1c1b1b;transform:translateX(2px);}
.ev .ev-nav-item.active{opacity:1;color:#4d8eff;background:rgba(77,142,255,.1);font-weight:600;box-shadow:0 0 20px rgba(77,142,255,.1);}
/* Right sidebar */
.ev .ev-right-sidebar{width:240px;min-width:240px;align-self:stretch;background:rgba(14,14,14,.6);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-left:1px solid rgba(255,255,255,.05);box-shadow:0 0 60px rgba(77,142,255,.04);overflow-y:auto;padding:12px 10px;display:flex;flex-direction:column;gap:6px;}
/* CTA button */
.ev .ev-cta{width:100%;background:linear-gradient(135deg,#adc6ff 0%,#4d8eff 100%);color:#002e6a;font-weight:600;padding:10px 16px;border-radius:8px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;letter-spacing:.02em;transition:all .3s;font-family:inherit;}
.ev .ev-cta:hover{filter:drop-shadow(0 0 12px rgba(77,142,255,.3));}
.ev .ev-cta:active{transform:scale(.95);}
      `}</style>

      {/* ── Left Navigation Sidebar ─────────────────────────────────── */}
      <aside className="ev-sidebar">
        {/* Brand header */}
        <div style={{padding:'24px 12px 8px',display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:40,height:40,borderRadius:8,background:'rgba(77,142,255,.2)',
            display:'flex',alignItems:'center',justifyContent:'center',
            border:'1px solid rgba(77,142,255,.3)'}}>
            <span className="material-symbols-outlined" style={{fontSize:22,color:'#4d8eff'}}>hub</span>
          </div>
          <div>
            <h1 style={{fontSize:16,fontWeight:700,color:'#e5e2e1',letterSpacing:'-0.01em',lineHeight:1,margin:0}}>Environments</h1>
            <p style={{fontSize:10,color:'#e5e2e1',opacity:.4,fontWeight:700,letterSpacing:'.1em',marginTop:4,textTransform:'uppercase'}}>MANAGEMENT MODULE</p>
          </div>
        </div>

        {/* CTA */}
        <div style={{padding:'0 4px',margin:'16px 0 24px'}}>
          <button className="ev-cta" onClick={()=>{ setForm('new'); void loadAvailableTickets(); }}>
            <span className="material-symbols-outlined" style={{fontSize:18}}>add_circle</span>
            <span>Nueva reserva</span>
          </button>
        </div>

        {/* Navigation */}
        <nav style={{flex:1,display:'flex',flexDirection:'column',gap:2}}>
          {mainTabs.map(t=>(
            <button key={t.id}
              className={`ev-nav-item${mainTab===t.id?' active':''}`}
              onClick={()=>setMainTab(t.id)}>
              <span className="material-symbols-outlined" style={{fontSize:20}}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main Content ────────────────────────────────────────────── */}
      <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* Filter bar (only on Reservas tab) */}
        {mainTab==='reservas'&&(
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 20px',
            borderBottom:'1px solid rgba(66,71,83,.15)',flexShrink:0}}>
            <div style={{display:'flex',gap:2,background:'#1c1b1b',
              border:'1px solid rgba(66,71,83,.15)',borderRadius:8,padding:3}}>
              {filterTabs.map(t=>(
                <button key={t.id} onClick={()=>setFilter(t.id)}
                  style={{padding:'4px 12px',fontSize:12,fontWeight:filter===t.id?600:400,borderRadius:6,
                    border:'none',cursor:'pointer',fontFamily:'inherit',
                    background:filter===t.id?'#2a2a2a':'transparent',
                    color:filter===t.id?'#e5e2e1':'#8c909f',
                    boxShadow:filter===t.id?'0 1px 3px rgba(0,0,0,.15)':'none',transition:'all .15s'}}>
                  {t.label}
                </button>
              ))}
            </div>
            <input placeholder="Buscar por ticket o entorno…" value={search} onChange={e=>setSearch(e.target.value)}
              style={{width:220,padding:'7px 12px',fontSize:12,fontFamily:'inherit',
                background:'#1c1b1b',border:'1px solid rgba(66,71,83,.15)',
                borderRadius:8,color:'#e5e2e1',outline:'none'}}/>
          </div>
        )}

        {/* Tab content */}
        <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>
          {mainTab==='reservas' && (
            <>
              {loading ? (
                <div style={{textAlign:'center',padding:'40px 0',color:'#8c909f',fontSize:13}}>
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
                <div style={{textAlign:'center',padding:'40px 0',color:'#8c909f',fontSize:13}}>
                  Cargando…
                </div>
              ) : (
                <GanttView reservations={visible} envs={envs} onBarClick={handleGanttBarClick} />
              )}
            </>
          )}

          {mainTab==='historial' && <HistoryView />}
        </div>
      </div>

      {/* ── Right Environment Sidebar ───────────────────────────────── */}
      <aside className="ev-right-sidebar">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4,padding:'8px 4px 0'}}>
          <span style={{fontSize:11,fontWeight:700,color:'#8c909f',textTransform:'uppercase',letterSpacing:'.05em'}}>Entornos</span>
          <button onClick={()=>setSidebarAvailOnly(v=>!v)}
            style={{fontSize:10,padding:'2px 8px',borderRadius:10,cursor:'pointer',fontFamily:'inherit',fontWeight:600,
              border:`1px solid ${sidebarAvailOnly?'#22c55e':'rgba(66,71,83,.15)'}`,
              background:sidebarAvailOnly?'rgba(34,197,94,.12)':'transparent',
              color:sidebarAvailOnly?'#22c55e':'#8c909f',transition:'all .12s'}}>
            {sidebarAvailOnly?'✓ Libres':'Todos'}
          </button>
        </div>
        {sortedEnvs.map(env => {
          const st = getEnvStatus(env);
          const cc = CAT[env.category] ?? CAT.DEV;
          const activeRes = res.find(r => r.environmentId === env.id && ['reserved','in_use','violation'].includes(r.statusCategory));
          const handleClick = () => {
            if (st.occupied && activeRes) {
              setDetail(activeRes);
            } else if (!st.occupied) {
              setForm('new');
              void loadAvailableTickets();
              setTimeout(() => {
                const sel = document.querySelector('select') as HTMLSelectElement;
                if (sel) { sel.value = env.id; sel.dispatchEvent(new Event('change', { bubbles: true })); }
              }, 100);
            }
          };
          return (
            <div key={env.id} onClick={handleClick} style={{padding:'10px 10px',borderRadius:8,
              background:'#1c1b1b',border:'1px solid rgba(66,71,83,.15)',
              borderTop:'1px solid rgba(173,198,255,.08)',
              transition:'all .15s',cursor:'pointer'}}
              onMouseEnter={e=>{e.currentTarget.style.background='#2a2a2a';}}
              onMouseLeave={e=>{e.currentTarget.style.background='#1c1b1b';}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                <div style={{width:8,height:8,borderRadius:'50%',flexShrink:0,
                  background:st.occupied?'#ef4444':'#22c55e'}}/>
                <span style={{fontSize:12,fontWeight:700,color:'#e5e2e1',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{env.name}</span>
                <span style={{fontSize:9,padding:'1px 5px',borderRadius:8,fontWeight:600,
                  background:cc.bg,color:cc.color,flexShrink:0}}>{env.category}</span>
              </div>
              {st.occupied ? (
                <div style={{fontSize:10,color:'#ffb4ab',marginLeft:14}}>
                  {st.label}{st.endDate ? ` · hasta ${new Date(st.endDate).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}` : ''}
                </div>
              ) : (
                <div style={{fontSize:10,color:'#4ae176',marginLeft:14}}>Disponible</div>
              )}
            </div>
          );
        })}
        {sortedEnvs.length===0&&(
          <div style={{fontSize:11,color:'#8c909f',textAlign:'center',padding:'20px 0'}}>
            {sidebarAvailOnly?'No hay entornos libres':'Sin entornos'}
          </div>
        )}
      </aside>

      {form&&<ReservationForm res={form==='new'?null:form} envs={envs} repos={repos} allRes={res}
        policy={policy} currentUser={currentUser} onSave={handleSave} onClose={()=>setForm(null)}
        availableTickets={availableTickets} ticketsLoading={ticketsLoading}
        repoField={repoField}
        reservedStatus={reservedStatus} inUseStatus={inUseStatus}/>}

      {detail&&<ReservationDetail res={detail} envs={envs} repos={repos} users={wsUsers??[]}
        currentUser={currentUser} onClose={()=>setDetail(null)}
        onEdit={r=>{setDetail(null);setForm(r);void loadAvailableTickets();}}
        onCheckIn={()=>handleCheckIn(detail)} onCheckOut={()=>handleCheckOut(detail)}
        onCancel={()=>handleCancel(detail)} onAddBranch={b=>handleAddBranch(detail,b)}
        jiraBaseUrl={jiraBaseUrl}/>}

      {confirm&&<ConfirmDialog message={confirm.message}
        onConfirm={confirm.onConfirm} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
