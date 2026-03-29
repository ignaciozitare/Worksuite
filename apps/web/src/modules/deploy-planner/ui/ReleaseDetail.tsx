// @ts-nocheck
// ui/ReleaseDetail.tsx — Solo UI, llama a useCases, nada de Supabase directo
import { useState, useCallback } from 'react';
import type { Release, ReleaseStatus } from '../domain/entities/Release';
import type { UpdateTicketStatuses } from '../domain/useCases/UpdateTicketStatuses';

const TICKET_STATUSES = {
  in_progress: { label:'In Progress', color:'#64748b', bg:'rgba(100,116,139,.12)', icon:'○' },
  in_review:   { label:'In Review',   color:'#f59e0b', bg:'rgba(245,158,11,.12)',  icon:'◑' },
  done:        { label:'Done',        color:'#38bdf8', bg:'rgba(56,189,248,.12)',   icon:'◉' },
  merged:      { label:'Merged',      color:'#34d399', bg:'rgba(52,211,153,.12)',   icon:'✓' },
};
const MERGE_READY = ['merged','done'];
const PRIORITY_COLOR = { Highest:'#ef4444', High:'#f97316', Medium:'#3b82f6', Low:'#6b7280' };

function fmtDate(iso) {
  if(!iso) return '—';
  return new Date(iso+'T00:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'});
}

// ── Repo Card (idéntica al artefacto) ─────────────────────────────────────────
function RepoCard({ repoName, tickets, onStatusChange }) {
  const readyCount = tickets.filter(t => MERGE_READY.includes(t.status)).length;
  const allReady   = readyCount === tickets.length;
  const someReady  = readyCount > 0;
  const borderColor = allReady ? '#34d399' : someReady ? '#f59e0b' : 'var(--bd)';
  const topColor    = allReady ? '#34d399' : someReady ? '#f59e0b' : 'var(--bd2)';

  return (
    <div style={{background:'var(--sf)',border:`1px solid ${borderColor}`,borderTop:`2px solid ${topColor}`,
      borderRadius:10,width:290,flexShrink:0,transition:'border-color .3s'}}>
      <div style={{padding:'12px 14px',borderBottom:'1px solid var(--bd)',display:'flex',alignItems:'center',gap:8}}>
        <div style={{width:26,height:26,borderRadius:6,
          background:allReady?'rgba(52,211,153,.15)':'rgba(56,189,248,.08)',
          display:'flex',alignItems:'center',justifyContent:'center',fontSize:13}}>
          {allReady?'✓':'⬡'}
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:700,color:'var(--tx)'}}>{repoName}</div>
          <div style={{fontSize:10,color:'var(--tx3)',marginTop:1}}>{readyCount}/{tickets.length} tickets listos</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:44,height:4,background:'var(--sf2)',borderRadius:2,overflow:'hidden'}}>
            <div style={{width:`${(readyCount/tickets.length)*100}%`,height:'100%',
              background:allReady?'#34d399':someReady?'#f59e0b':'var(--bd)',
              borderRadius:2,transition:'width .4s ease'}}/>
          </div>
          {allReady&&<span style={{fontSize:9,color:'#34d399',fontWeight:700}}>LISTO</span>}
        </div>
      </div>
      {tickets.map((ticket,i)=>{
        const isReady=MERGE_READY.includes(ticket.status);
        const st=TICKET_STATUSES[ticket.status]??TICKET_STATUSES.in_progress;
        return(
          <div key={ticket.key} style={{padding:'10px 14px',
            borderBottom:i<tickets.length-1?'1px solid var(--sf2)':'none',
            opacity:isReady?.65:1,transition:'opacity .2s'}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:7}}>
              <div style={{width:6,height:6,borderRadius:'50%',
                background:PRIORITY_COLOR[ticket.priority]||'#64748b',marginTop:4,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                  <span style={{fontSize:10,fontWeight:700,color:'#38bdf8',flexShrink:0}}>{ticket.key}</span>
                  <span style={{fontSize:9,color:'var(--tx3)',background:'var(--sf2)',
                    border:'1px solid var(--bd)',borderRadius:3,padding:'1px 5px',flexShrink:0}}>
                    {ticket.type||'Task'}
                  </span>
                </div>
                <div style={{fontSize:11,color:isReady?'var(--tx3)':'var(--tx2)',lineHeight:1.4,
                  textDecoration:isReady?'line-through':'none',marginBottom:4,
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {ticket.summary}
                </div>
                {ticket.assignee&&<div style={{fontSize:10,color:'var(--tx3)'}}>👤 {ticket.assignee}</div>}
              </div>
            </div>
            <select value={ticket.status} onChange={e=>onStatusChange(ticket.key,e.target.value)}
              style={{width:'100%',background:st.bg,border:`1px solid ${st.color}40`,
                borderRadius:4,padding:'4px 8px',fontSize:10,color:st.color,
                cursor:'pointer',outline:'none',fontWeight:700,fontFamily:'inherit'}}>
              {Object.entries(TICKET_STATUSES).map(([val,cfg])=>(
                <option key={val} value={val}>{cfg.icon} {cfg.label}</option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

// ── Merge / Close button ───────────────────────────────────────────────────────
function MergeButton({ repos, ticketsByRepo, statuses, release, onClose, onStatusChange: onReleaseStatusChange }) {
  const [merging,setMerging]=useState(false);
  const [merged, setMerged] =useState(false);

  const allReady = repos.every(repo=>(ticketsByRepo[repo]||[]).every(t=>MERGE_READY.includes(t.status)));
  const blocking = repos.filter(repo=>!(ticketsByRepo[repo]||[]).every(t=>MERGE_READY.includes(t.status)));
  const masterStatus = statuses.find(s=>s.name.toLowerCase().includes('merge'))||statuses.find(s=>s.isFinal&&!s.name.toLowerCase().includes('rollback'));

  const handleMerge = async () => {
    if(!allReady||merging||merged) return;
    setMerging(true);
    if(masterStatus) await onReleaseStatusChange(masterStatus.name);
    setTimeout(()=>{setMerging(false);setMerged(true);},1400);
  };

  if(merged) return(
    <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 18px',
      background:'rgba(52,211,153,.08)',border:'1px solid rgba(52,211,153,.3)',borderRadius:10}}>
      <span style={{fontSize:20}}>🎉</span>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:'#34d399'}}>Merge completado a master</div>
        <div style={{fontSize:11,color:'var(--tx3)',marginTop:2}}>Todos los repositorios mergeados correctamente</div>
      </div>
    </div>
  );

  return(
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {!allReady&&(
        <div style={{padding:'10px 14px',background:'rgba(248,113,113,.06)',
          border:'1px solid rgba(248,113,113,.2)',borderRadius:8,fontSize:11,color:'#f87171'}}>
          <div style={{fontWeight:700,marginBottom:5}}>⚠ Bloqueado — repos pendientes:</div>
          {blocking.map(r=>{
            const p=(ticketsByRepo[r]||[]).filter(t=>!MERGE_READY.includes(t.status)).length;
            return<div key={r} style={{marginTop:3,fontSize:11}}>· <span style={{color:'#ef4444'}}>{r}</span> — {p} ticket{p>1?'s':''} pendiente{p>1?'s':''}</div>;
          })}
        </div>
      )}
      <div style={{display:'flex',gap:10}}>
        <button onClick={onClose} style={{padding:'10px 18px',borderRadius:8,cursor:'pointer',
          fontFamily:'inherit',fontSize:13,fontWeight:600,
          background:'var(--sf2)',border:'1px solid var(--bd)',color:'var(--tx3)'}}>
          ← Volver
        </button>
        <button onClick={handleMerge} disabled={!allReady||merging}
          style={{flex:1,padding:'12px 20px',borderRadius:8,
            cursor:allReady&&!merging?'pointer':'not-allowed',fontFamily:'inherit',
            fontSize:13,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:8,
            background:allReady?'linear-gradient(135deg,#1d4ed8,#0ea5e9)':'var(--sf2)',
            border:`1px solid ${allReady?'#3b82f6':'var(--bd)'}`,
            color:allReady?'#fff':'var(--tx3)',opacity:merging?.7:1}}>
          {merging?'⟳ Mergeando…':allReady?'🚀 Merge to master':'🔒 Merge to master'}
        </button>
      </div>
    </div>
  );
}

// ── ReleaseDetail ─────────────────────────────────────────────────────────────
export function ReleaseDetail({ release, jiraIssues, repoField, statuses, onClose, onTicketStatusChange, onReleaseStatusChange }) {
  const [ticketStatuses, setTicketStatuses] = useState(release.ticketStatuses || {});
  const [saving,         setSaving]         = useState(false);

  const tickets = (release.ticketIds||[]).map(key=>{
    const issue = jiraIssues[key];
    const repos = (issue?.fields?.[repoField]??[]).map?.(c=>c.name)||[];
    return {
      key,
      summary:  issue?.fields?.summary||key,
      assignee: issue?.fields?.assignee?.displayName,
      priority: issue?.fields?.priority?.name||'Medium',
      type:     issue?.fields?.issuetype?.name||'Task',
      repos,
      status:   ticketStatuses[key]||'in_progress',
    };
  });

  const allRepos = [...new Set(tickets.flatMap(t=>t.repos))].sort();
  const noRepo   = tickets.filter(t=>t.repos.length===0);
  const byRepo   = Object.fromEntries(allRepos.map(r=>[r, tickets.filter(t=>t.repos.includes(r))]));
  const readyCount = tickets.filter(t=>MERGE_READY.includes(t.status)).length;
  const allReady   = readyCount===tickets.length&&tickets.length>0;

  const handleTicketStatus = useCallback(async (key, newStatus) => {
    setSaving(true);
    const updated = await onTicketStatusChange(release.id, key, newStatus, ticketStatuses);
    setTicketStatuses(updated);
    setSaving(false);
  },[ticketStatuses, release.id, onTicketStatusChange]);

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'auto',padding:24}}>
      {/* Header */}
      <div style={{marginBottom:20}}>
        <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',
          color:'var(--tx3)',fontSize:12,fontFamily:'inherit',display:'flex',alignItems:'center',
          gap:4,marginBottom:14,padding:0}}>
          ← Volver a Planning
        </button>
        <div style={{display:'flex',alignItems:'flex-start',gap:16,marginBottom:14}}>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
              <span style={{fontSize:10,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.08em'}}>RELEASE</span>
              <span style={{fontSize:10,color:'var(--bd)'}}>·</span>
              <span style={{fontSize:10,color:'var(--tx3)'}}>{fmtDate(release.startDate)} → {fmtDate(release.endDate)}</span>
            </div>
            <h1 style={{fontSize:22,fontWeight:700,color:'var(--tx)',marginBottom:4,fontFamily:"'Sora',sans-serif"}}>
              {release.releaseNumber}
            </h1>
            {release.description&&<p style={{fontSize:12,color:'var(--tx3)',lineHeight:1.5}}>{release.description}</p>}
          </div>
          {/* Global progress */}
          <div style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:10,
            padding:'12px 18px',minWidth:150,textAlign:'center',flexShrink:0}}>
            <div style={{fontSize:28,fontWeight:700,color:allReady?'#34d399':'var(--tx)',lineHeight:1,fontFamily:"'Sora',sans-serif"}}>
              {readyCount}<span style={{fontSize:14,color:'var(--tx3)'}}>/{tickets.length}</span>
            </div>
            <div style={{fontSize:10,color:'var(--tx3)',marginTop:4,textTransform:'uppercase',letterSpacing:'.06em'}}>Tickets listos</div>
            <div style={{height:3,background:'var(--sf2)',borderRadius:2,overflow:'hidden',marginTop:8}}>
              <div style={{width:`${tickets.length?((readyCount/tickets.length)*100):0}%`,height:'100%',
                background:allReady?'#34d399':'#3b82f6',borderRadius:2,transition:'width .4s ease'}}/>
            </div>
            {saving&&<div style={{fontSize:9,color:'var(--tx3)',marginTop:4}}>Guardando…</div>}
          </div>
        </div>
        {/* Repo pills */}
        {allRepos.length>0&&(
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {allRepos.map(repo=>{
              const rt=byRepo[repo]||[];
              const rdy=rt.filter(t=>MERGE_READY.includes(t.status)).length;
              const ok=rdy===rt.length;
              return(
                <div key={repo} style={{display:'flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:20,fontSize:10,
                  background:ok?'rgba(52,211,153,.08)':'rgba(56,189,248,.06)',
                  border:`1px solid ${ok?'rgba(52,211,153,.3)':'var(--bd)'}`,color:ok?'#34d399':'var(--tx3)'}}>
                  {ok?'✓':'○'} {repo}<span style={{color:ok?'rgba(52,211,153,.4)':'var(--bd)'}}> {rdy}/{rt.length}</span>
                </div>
              );
            })}
            {noRepo.length>0&&<div style={{padding:'3px 10px',borderRadius:20,fontSize:10,
              background:'rgba(245,158,11,.08)',border:'1px solid rgba(245,158,11,.25)',color:'#f59e0b'}}>
              ⚠ {noRepo.length} sin repositorio
            </div>}
          </div>
        )}
        {(noRepo.length>0||allRepos.length===0)&&(
          <div style={{marginTop:10,padding:'10px 14px',background:'rgba(245,158,11,.06)',
            border:'1px solid rgba(245,158,11,.2)',borderRadius:8,fontSize:11,color:'#f59e0b',lineHeight:1.5}}>
            ⚙ Los tickets necesitan el campo <strong>{repoField||'Repository & Components'}</strong> en Jira para agruparse por repositorio.
            Configura el campo en Admin → Deploy Config.
          </div>
        )}
      </div>

      <div style={{height:1,background:'var(--bd)',marginBottom:20}}/>

      {/* Repo cards or flat list */}
      {allRepos.length>0?(
        <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'flex-start',marginBottom:24}}>
          {allRepos.map(repo=>(
            <RepoCard key={repo} repoName={repo} tickets={byRepo[repo]||[]} onStatusChange={handleTicketStatus}/>
          ))}
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:24}}>
          {tickets.map(ticket=>{
            const st=TICKET_STATUSES[ticket.status]??TICKET_STATUSES.in_progress;
            return(
              <div key={ticket.key} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',
                background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:8}}>
                <span style={{fontSize:11,fontWeight:700,color:'#38bdf8',flexShrink:0}}>{ticket.key}</span>
                <span style={{flex:1,fontSize:12,color:'var(--tx2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ticket.summary}</span>
                <span style={{fontSize:10,color:'var(--tx3)'}}>sin componente</span>
                <select value={ticket.status} onChange={e=>handleTicketStatus(ticket.key,e.target.value)}
                  style={{background:st.bg,border:`1px solid ${st.color}40`,borderRadius:4,padding:'3px 8px',
                    fontSize:10,color:st.color,cursor:'pointer',outline:'none',fontWeight:700,fontFamily:'inherit'}}>
                  {Object.entries(TICKET_STATUSES).map(([val,cfg])=>(
                    <option key={val} value={val}>{cfg.icon} {cfg.label}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      {/* Close release */}
      <div style={{borderTop:'1px solid var(--bd)',paddingTop:20,marginTop:'auto'}}>
        <div style={{fontSize:11,color:'var(--tx3)',marginBottom:10,textTransform:'uppercase',letterSpacing:'.06em',fontWeight:600}}>
          Cerrar Release
        </div>
        <MergeButton
          repos={allRepos.length?allRepos:['all']}
          ticketsByRepo={allRepos.length?byRepo:{all:tickets}}
          statuses={statuses}
          release={release}
          onClose={onClose}
          onStatusChange={onReleaseStatusChange}
        />
      </div>
    </div>
  );
}
