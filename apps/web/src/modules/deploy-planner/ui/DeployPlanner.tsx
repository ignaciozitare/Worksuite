// @ts-nocheck
// ui/DeployPlanner.tsx — Solo UI + llamadas a useCases. Sin Supabase directo.
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase }                  from '../../../shared/lib/supabaseClient';
import { SupabaseReleaseRepo }       from '../infra/supabase/SupabaseReleaseRepo';
import { GetReleases }               from '../domain/useCases/GetReleases';
import { CreateRelease }             from '../domain/useCases/CreateRelease';
import { UpdateRelease }             from '../domain/useCases/UpdateRelease';
import { DeleteRelease }             from '../domain/useCases/DeleteRelease';
import { UpdateTicketStatuses }      from '../domain/useCases/UpdateTicketStatuses';
import { ReleaseDetail }             from './ReleaseDetail';
import type { Release, ReleaseStatus, ReleaseConfig } from '../domain/entities/Release';

// ── Singletons (port → repo → use-case) ─────────────────────────────────────
const repo         = new SupabaseReleaseRepo(supabase);
const getReleases  = new GetReleases(repo);
const createUC     = new CreateRelease(repo);
const updateUC     = new UpdateRelease(repo);
const deleteUC     = new DeleteRelease(repo);
const ticketUC     = new UpdateTicketStatuses(repo);

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

// ── Inline style helpers ──────────────────────────────────────────────────────
const inp = (extra={}) => ({
  background:'var(--sf2)', border:'1px solid var(--bd)',
  borderRadius:7, padding:'6px 10px', fontSize:12, color:'var(--tx)',
  outline:'none', fontFamily:'inherit', ...extra,
});

// ── Ticket search ─────────────────────────────────────────────────────────────
function TicketSearch({ existingKeys, allTickets, onAdd, onRemove }) {
  const [q,       setQ]       = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef(null);

  const search = useCallback(async (query) => {
    if(!query.trim()||query.length<2){setResults([]);return;}
    setLoading(true);
    try {
      const h = await authHeaders();
      const jql = encodeURIComponent(`text ~ "${query}" OR issueKey = "${query}" ORDER BY updated DESC`);
      const r = await fetch(`${API_BASE}/jira/search?jql=${jql}&maxResults=15`,{headers:h});
      if(!r.ok) throw new Error();
      const d = await r.json();
      setResults((d.issues||[]).map(i=>({key:i.key,summary:i.fields?.summary||i.key,type:i.fields?.issuetype?.name||'Task'})));
    } catch { setResults([]); }
    setLoading(false);
  },[]);

  const handleInput = (v) => {
    setQ(v);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(()=>search(v),350);
  };

  return(
    <div>
      <div style={{position:'relative'}}>
        <input style={inp({width:'100%',paddingRight:28,fontSize:11})}
          placeholder="Buscar ticket…" value={q} onChange={e=>handleInput(e.target.value)}/>
        {loading&&<span style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',fontSize:11,color:'var(--tx3)'}}>⟳</span>}
      </div>
      {results.length>0&&(
        <div style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:8,marginTop:4,maxHeight:160,overflowY:'auto',zIndex:10,position:'relative'}}>
          {results.map(r=>{
            const already=existingKeys.includes(r.key);
            return(
              <div key={r.key} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',
                borderBottom:'1px solid var(--sf2)',cursor:already?'default':'pointer',opacity:already?.5:1}}
                onClick={()=>{if(!already){onAdd(r.key);setQ('');setResults([]);}}}>
                <span style={{fontSize:10,fontWeight:700,color:'#a78bfa',flexShrink:0}}>{r.key}</span>
                <span style={{flex:1,fontSize:11,color:'var(--tx2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.summary}</span>
                {!already&&<span style={{fontSize:11,color:'var(--ac)'}}>+</span>}
              </div>
            );
          })}
        </div>
      )}
      {/* Added tickets pills */}
      {existingKeys.length>0&&(
        <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:6}}>
          {existingKeys.map(key=>{
            const t=allTickets[key];
            return(
              <div key={key} style={{display:'flex',alignItems:'center',gap:4,padding:'2px 7px',
                borderRadius:6,background:'rgba(56,189,248,.1)',border:'1px solid rgba(56,189,248,.2)',fontSize:10}}>
                <span style={{color:'#38bdf8',fontWeight:700}}>{key}</span>
                {t&&<span style={{color:'var(--tx3)'}}>{t.fields?.summary?.slice(0,28)}</span>}
                <button onClick={()=>onRemove(key)} style={{background:'none',border:'none',cursor:'pointer',
                  color:'var(--tx3)',fontSize:12,lineHeight:1,padding:'0 2px',fontFamily:'inherit'}}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Release Card ──────────────────────────────────────────────────────────────
function ReleaseCard({ release, allTickets, statuses, onOpen, onPatch, onDelete }) {
  const [desc,   setDesc]   = useState(release.description||'');
  const [editing,setEditing]= useState(false);

  const st = statuses.find(s=>s.name===release.status)||statuses[0];

  const patch = useCallback(async (p) => {
    await updateUC.execute(release.id, p);
    onPatch(release.id, p);
  },[release.id, onPatch]);

  const handleAddTicket = async (key) => {
    const newIds=[...(release.ticketIds||[]),key];
    await patch({ticketIds:newIds});
  };
  const handleRemoveTicket = async (key) => {
    const newIds=(release.ticketIds||[]).filter(k=>k!==key);
    await patch({ticketIds:newIds});
  };

  return(
    <div style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:12,
      width:300,flexShrink:0,overflow:'hidden',
      borderTop:`3px solid ${st?.color||'var(--bd)'}`,}}>
      {/* Header */}
      <div style={{padding:'12px 14px',borderBottom:'1px solid var(--bd)'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
          <span style={{fontSize:15,fontWeight:700,color:'var(--tx)',fontFamily:"'Sora',sans-serif",flex:1,cursor:'pointer'}}
            onClick={()=>onOpen(release)}>
            {release.releaseNumber}
          </span>
          <button onClick={()=>setEditing(e=>!e)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--tx3)',fontSize:11,fontFamily:'inherit'}}>✎</button>
          <button onClick={()=>onDelete(release.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--red)',fontSize:11,fontFamily:'inherit'}}>✕</button>
        </div>
        {editing?(
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            <textarea style={inp({width:'100%',resize:'none',fontSize:11})} rows={2}
              placeholder="Descripción…" value={desc} onChange={e=>setDesc(e.target.value)}/>
            <div style={{display:'flex',gap:6}}>
              <button onClick={()=>setEditing(false)} style={{...inp({cursor:'pointer',flex:1,fontSize:11})}}>Cancelar</button>
              <button onClick={async()=>{await patch({description:desc});setEditing(false);}}
                style={{...inp({cursor:'pointer',flex:1,fontSize:11,fontWeight:700,background:'var(--ac)',color:'#fff',border:'none'})}}>Guardar</button>
            </div>
          </div>
        ):(
          <p style={{fontSize:11,color:'var(--tx3)',lineHeight:1.4,margin:0,
            overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
            {release.description||<span style={{opacity:.4}}>Sin descripción</span>}
          </p>
        )}
      </div>
      {/* Status + dates */}
      <div style={{padding:'10px 14px',borderBottom:'1px solid var(--bd)',display:'flex',flexDirection:'column',gap:7}}>
        <select value={release.status}
          onChange={e=>patch({status:e.target.value})}
          style={{...inp({fontSize:11}),background:st?.bgColor||'var(--sf2)',
            color:st?.color||'var(--tx)',border:`1px solid ${st?.border||'var(--bd)'}`,fontWeight:700}}>
          {statuses.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
          <div>
            <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:3}}>START DATE</div>
            <input type="date" value={release.startDate||''} onChange={e=>patch({startDate:e.target.value||null})} style={inp({fontSize:11,width:'100%'})}/>
          </div>
          <div>
            <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:3}}>END DATE</div>
            <input type="date" value={release.endDate||''} onChange={e=>patch({endDate:e.target.value||null})} style={inp({fontSize:11,width:'100%'})}/>
          </div>
        </div>
      </div>
      {/* Tickets */}
      <div style={{padding:'10px 14px'}}>
        <TicketSearch existingKeys={release.ticketIds||[]} allTickets={allTickets}
          onAdd={handleAddTicket} onRemove={handleRemoveTicket}/>
        {(release.ticketIds||[]).length>0&&(
          <button onClick={()=>onOpen(release)} style={{width:'100%',marginTop:8,padding:'7px',borderRadius:7,
            cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:'inherit',
            background:'var(--sf2)',border:'1px solid var(--bd)',color:'var(--tx3)'}}>
            Ver detalle → {(release.ticketIds||[]).length} ticket{(release.ticketIds||[]).length>1?'s':''}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main DeployPlanner ────────────────────────────────────────────────────────
export function DeployPlanner({ currentUser }) {
  const [releases,     setReleases]     = useState([]);
  const [statuses,     setStatuses]     = useState([]);
  const [config,       setConfig]       = useState(null);
  const [allTickets,   setAllTickets]   = useState({});
  const [loading,      setLoading]      = useState(true);
  const [ticketLoad,   setTicketLoad]   = useState(false);
  const [selected,     setSelected]     = useState(null);
  const [filterStatus, setFilterStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { releases: rels, statuses: sts, config: cfg } = await getReleases.execute();
      setReleases(rels);
      setStatuses(sts);
      setConfig(cfg);

      // Batch load tickets — 1 call para todas las releases
      const allIds = [...new Set(rels.flatMap(r=>r.ticketIds||[]))];
      if(allIds.length>0) {
        setTicketLoad(true);
        try {
          const h = await authHeaders();
          const fieldList = ['summary','assignee','priority','issuetype','status',cfg?.repoJiraField||'components'].filter(Boolean).join(',');
          const jql = encodeURIComponent(`issueKey in (${allIds.join(',')})`);
          const r = await fetch(`${API_BASE}/jira/search?jql=${jql}&maxResults=500&fields=${fieldList}`,{headers:h});
          if(r.ok) {
            const d = await r.json();
            const map = {};
            (d.issues||[]).forEach(i=>{map[i.key]=i;});
            setAllTickets(map);
          }
        } catch {}
        setTicketLoad(false);
      }
    } finally { setLoading(false); }
  },[]);

  useEffect(()=>{void load();},[]);

  const handleCreate = async () => {
    const releaseNumber = createUC.buildNumber(config);
    const release = await createUC.execute({
      releaseNumber, firstStatus: statuses[0]?.name||'Planned',
      createdBy: currentUser?.id||null, config,
    });
    setReleases(p=>[release,...p]);
    if(config) setConfig(c=>c?{...c,nextNumber:(c.nextNumber??1)+1}:c);
  };

  const handlePatch = useCallback((id, patch) => {
    setReleases(p=>p.map(r=>r.id===id?{...r,...patch}:r));
  },[]);

  const handleDelete = async (id) => {
    await deleteUC.execute(id);
    setReleases(p=>p.filter(r=>r.id!==id));
    if(selected?.id===id) setSelected(null);
  };

  const handleTicketStatus = useCallback(async (releaseId, key, newStatus, current) => {
    const updated = await ticketUC.execute(releaseId, key, newStatus, current);
    setReleases(p=>p.map(r=>r.id===releaseId?{...r,ticketStatuses:updated}:r));
    return updated;
  },[]);

  const handleReleaseStatus = useCallback(async (name) => {
    if(!selected) return;
    await updateUC.execute(selected.id, {status:name});
    handlePatch(selected.id, {status:name});
  },[selected, handlePatch]);

  const visible = releases.filter(r=>!filterStatus||r.status===filterStatus);
  const stats   = statuses.map(s=>({...s, count:releases.filter(r=>r.status===s.name).length}));

  if(loading) return(
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'var(--tx3)',fontSize:13}}>
      Cargando…
    </div>
  );

  // Detail view
  if(selected) {
    const current = releases.find(r=>r.id===selected.id)||selected;
    return(
      <ReleaseDetail
        release={current}
        jiraIssues={allTickets}
        repoField={config?.repoJiraField||''}
        statuses={statuses}
        onClose={()=>setSelected(null)}
        onTicketStatusChange={handleTicketStatus}
        onReleaseStatusChange={handleReleaseStatus}
      />
    );
  }

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'14px 20px',borderBottom:'1px solid var(--bd)',background:'var(--sf)',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
          <div>
            <h1 style={{fontFamily:"'Sora',sans-serif",fontSize:17,color:'var(--tx)',fontWeight:700,marginBottom:2}}>
              🚀 Planificación
            </h1>
            <p style={{fontSize:11,color:'var(--tx3)'}}>
              {releases.length} release{releases.length!==1?'s':''} · {Object.keys(allTickets).length} tickets
              {ticketLoad&&<span> · cargando tickets…</span>}
            </p>
          </div>
          <button onClick={handleCreate} style={{marginLeft:'auto',...inp({cursor:'pointer',padding:'7px 14px',
            background:'var(--ac)',color:'#fff',border:'none',fontWeight:600,fontSize:12})}}>
            + Nueva release
          </button>
        </div>
        {/* Status filters */}
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <button onClick={()=>setFilterStatus('')}
            style={{padding:'3px 10px',borderRadius:20,fontSize:11,cursor:'pointer',fontFamily:'inherit',
              background:!filterStatus?'var(--sf2)':'transparent',
              border:`1px solid ${!filterStatus?'var(--bd2)':'var(--bd)'}`,
              color:!filterStatus?'var(--tx)':'var(--tx3)'}}>
            Todas ({releases.length})
          </button>
          {stats.filter(s=>s.count>0).map(s=>(
            <button key={s.id} onClick={()=>setFilterStatus(filterStatus===s.name?'':s.name)}
              style={{padding:'3px 10px',borderRadius:20,fontSize:11,cursor:'pointer',fontFamily:'inherit',
                background:filterStatus===s.name?s.bgColor:'transparent',
                border:`1px solid ${filterStatus===s.name?s.color:'var(--bd)'}`,
                color:filterStatus===s.name?s.color:'var(--tx3)'}}>
              {s.name} ({s.count})
            </button>
          ))}
        </div>
      </div>
      {/* Cards */}
      <div style={{flex:1,overflowX:'auto',overflowY:'hidden',padding:'16px 20px'}}>
        <div style={{display:'flex',gap:14,alignItems:'flex-start',minWidth:'max-content',height:'100%'}}>
          {visible.map(r=>(
            <ReleaseCard key={r.id} release={r} allTickets={allTickets} statuses={statuses}
              onOpen={setSelected} onPatch={handlePatch} onDelete={handleDelete}/>
          ))}
          <div onClick={handleCreate} style={{width:280,flexShrink:0,border:'2px dashed var(--bd)',
            borderRadius:12,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
            padding:'32px 20px',cursor:'pointer',color:'var(--tx3)',gap:8,minHeight:200,transition:'all .15s'}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--ac)';e.currentTarget.style.color='var(--ac)';}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--bd)';e.currentTarget.style.color='var(--tx3)';}}>
            <span style={{fontSize:22}}>+</span>
            <span style={{fontSize:12,fontWeight:600}}>Nueva release</span>
          </div>
        </div>
      </div>
    </div>
  );
}
