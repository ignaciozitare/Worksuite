// @ts-nocheck
// Deploy Planner — v3 — Integrado con Supabase + Jira sync + Timeline zoom + Light mode
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../shared/lib/supabaseClient";

/* ─── CSS ────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
.dp *{box-sizing:border-box;margin:0;padding:0;}
.dp{font-family:'JetBrains Mono',monospace;background:var(--dp-bg,#07090f);color:var(--dp-tx,#c9d1d9);height:100%;overflow:auto;}
.dp button,.dp select,.dp input,.dp textarea{font-family:'JetBrains Mono',monospace;}
.dp input[type=date]::-webkit-calendar-picker-indicator{filter:var(--dp-date-filter,invert(.4) sepia(1) hue-rotate(180deg));}
.dp ::-webkit-scrollbar{width:4px;height:4px;}
.dp ::-webkit-scrollbar-track{background:var(--dp-bg,#07090f);}
.dp ::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px;}
.dp select option{background:var(--dp-sf,#0b0f18);}
/* Dark (default) */
.dp{
  --dp-bg:#07090f; --dp-sf:#0b0f18; --dp-sf2:#07090f;
  --dp-tx:#c9d1d9; --dp-tx2:#94a3b8; --dp-tx3:#334155;
  --dp-bd:#1e293b; --dp-date-filter:invert(.4) sepia(1) hue-rotate(180deg);
}
/* Light mode — activated when .light class is on html or on .dp */
.light .dp, .dp.light{
  --dp-bg:#f1f5f9; --dp-sf:#ffffff; --dp-sf2:#f8fafc;
  --dp-tx:#0f172a; --dp-tx2:#475569; --dp-tx3:#64748b;
  --dp-bd:#e2e8f0; --dp-date-filter:none;
}
.light .dp ::-webkit-scrollbar-thumb, .dp.light ::-webkit-scrollbar-thumb{background:#cbd5e1;}
.light .dp select option, .dp.light select option{background:#ffffff;}
@keyframes slideIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.anim-in{animation:slideIn .2s ease forwards;}
.fade-in{animation:fadeIn .15s ease;}
@keyframes spin{to{transform:rotate(360deg)}}
.spin{display:inline-block;animation:spin .8s linear infinite;}
`;

/* ─── Helpers ────────────────────────────────────────────────── */
const today = new Date();
const fmt    = d => (d instanceof Date ? d : new Date(d+"T00:00:00")).toISOString().slice(0,10);
const addD   = (iso, n) => { const d=new Date(iso+"T00:00:00"); d.setDate(d.getDate()+n); return fmt(d); };
const diffD  = (a, b) => Math.round((new Date(b+"T00:00:00")-new Date(a+"T00:00:00"))/(864e5));
const uid    = () => crypto.randomUUID();

const API_BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL || "http://localhost:3001").replace(/\/$/,"");

async function authHeaders() {
  const { data:{ session } } = await supabase.auth.getSession();
  return session?.access_token ? { "Authorization":`Bearer ${session.access_token}`, "Content-Type":"application/json" } : { "Content-Type":"application/json" };
}

// Two date ranges overlap if: start1 <= end2 AND start2 <= end1
const datesOverlap = (s1, e1, s2, e2) => {
  if(!s1||!e1||!s2||!e2) return true; // if dates missing, assume overlap (conservative)
  return s1 <= e2 && s2 <= e1;
};

const SLabel = ({children, style={}}) => (
  <div style={{fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:"var(--dp-tx3,#334155)",...style}}>{children}</div>
);

const RepoChip = ({name}) => (
  <span style={{fontSize:9,padding:"2px 7px",borderRadius:3,background:"var(--dp-sf2,#0d111a)",border:"1px solid var(--dp-bd,#1e293b)",color:"var(--dp-tx3,#475569)"}}>{name}</span>
);

/* ─── TICKET STATUSES (app-side) ─────────────────────────────── */
const TICKET_STATUS_CFG = {
  in_progress: { label:"In Progress", color:"#64748b", bg:"rgba(100,116,139,.12)", icon:"○" },
  in_review:   { label:"In Review",   color:"#f59e0b", bg:"rgba(245,158,11,.12)",  icon:"◑" },
  done:        { label:"Done",        color:"#38bdf8", bg:"rgba(56,189,248,.12)",  icon:"◉" },
  merged:      { label:"Merged",      color:"#34d399", bg:"rgba(52,211,153,.12)",  icon:"✓" },
};
const TICKET_STATUSES = Object.keys(TICKET_STATUS_CFG);
const MERGE_READY = ["done","merged"];

// Jira status name → app status (para sync inverso)
const JIRA_TO_APP = {
  "in progress":"in_progress", "in development":"in_progress",
  "in review":"in_review",     "code review":"in_review",
  "done":"done",               "closed":"done", "resolved":"done",
  "merged":"merged",           "ready for release":"merged",
};

/* ─── JIRA SYNC ──────────────────────────────────────────────── */
async function jiraTransition(issueKey, appStatus) {
  // Map app status → Jira status name
  const statusMap = { in_progress:"In Progress", in_review:"In Review", done:"Done", merged:"Merged" };
  const targetName = statusMap[appStatus];
  if (!targetName) return { ok:false, error:"Unknown status" };
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/jira/issue/${issueKey}/transition`, {
      method:"POST", headers, body: JSON.stringify({ targetStatus: targetName })
    });
    return res.ok ? { ok:true } : { ok:false, error:`HTTP ${res.status}` };
  } catch(e) { return { ok:false, error:e.message }; }
}

/* ─── PLANNING — Release Card ────────────────────────────────── */
function ReleaseCard({ rel, statusCfg, tickets, onOpen, onUpd, onDelete, onDrop, setDrag, drag, allReleases, repoGroups }) {
  const [addingTicket, setAddingTicket] = useState(false);
  const [search, setSearch] = useState("");
  const tMap = Object.fromEntries(tickets.map(t=>[t.key,t]));

  const cfg = statusCfg[rel.status] || { color:"#6b7280", bg_color:"rgba(107,114,128,.12)", border:"#1f2937" };

  // Conflict detection using repo groups
  // A conflict exists when: another active release has a repo that belongs to the SAME group as one of our repos
  const myRepos = [...new Set((rel.ticket_ids||[]).flatMap(k=>tMap[k]?.repos||[]))];

  const conflicts = []; // { repo, groupName, otherRelease }
  for(const group of repoGroups) {
    const myGroupRepos = myRepos.filter(r => group.repos.includes(r));
    if(myGroupRepos.length === 0) continue;
    for(const other of allReleases) {
      if(other.id === rel.id) continue;
      const isActive = other.status !== "Deployed" && other.status !== "Rollback";
      if(!isActive) continue;
      // Only conflict if date ranges overlap
      if(!datesOverlap(rel.start_date, rel.end_date, other.start_date, other.end_date)) continue;
      const otherRepos = [...new Set((other.ticket_ids||[]).flatMap(k=>tMap[k]?.repos||[]))];
      const sharedGroupRepos = myGroupRepos.filter(r => otherRepos.includes(r));
      for(const repo of sharedGroupRepos) {
        if(!conflicts.find(c=>c.repo===repo)) {
          conflicts.push({ repo, groupName: group.name, otherRelease: other.release_number||"sin versión" });
        }
      }
    }
  }

  const relTickets = (rel.ticket_ids||[]).map(k=>tMap[k]).filter(Boolean);
  const relRepos   = [...new Set(relTickets.flatMap(t=>t.repos||[]))];
  const unassigned = tickets.filter(t=>!(rel.ticket_ids||[]).includes(t.key));

  return (
    <div className="anim-in"
      onDragOver={e=>e.preventDefault()}
      onDrop={e=>{e.preventDefault(); onDrop(rel.id); }}
      onClick={()=>onOpen(rel.id)}
      style={{
        width:320,
        background:"var(--dp-sf,#0b0f18)",
        border:`1px solid ${cfg.border}`,
        borderLeft:`3px solid ${cfg.color}`,
        borderRadius:8,
        padding:"14px 16px",
        flexShrink:0,
        boxShadow:`0 0 0 1px ${cfg.color}18, 0 4px 20px ${cfg.color}10`,
        transition:"box-shadow .2s, transform .1s",
        cursor:"pointer",
      }}
      onMouseEnter={e=>e.currentTarget.style.transform="translateY(-1px)"}
      onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}
    >
      {/* Version number — editable, doble click edita / click simple abre detalle */}
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
        <span
          onClick={()=>onOpen(rel.id)}
          style={{flex:1,fontSize:15,fontWeight:700,color:"var(--dp-tx,#e6edf3)",cursor:"pointer",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
          title="Click para abrir · doble click para editar"
        >
          {rel.release_number||<span style={{color:"var(--dp-tx3,#334155)"}}>sin versión</span>}
        </span>
        <button onClick={e=>{e.stopPropagation();onOpen(rel.id);}} title="Abrir detalle" style={{background:"none",border:"none",color:"var(--dp-tx3,#475569)",cursor:"pointer",fontSize:13,lineHeight:1,padding:"2px 4px"}}>↗</button>
        <button onClick={e=>{e.stopPropagation();onDelete(rel.id);}} style={{background:"none",border:"none",color:"var(--dp-tx3,#475569)",cursor:"pointer",fontSize:16,lineHeight:1,padding:"2px 4px"}}>×</button>
      </div>
      {/* Editar release_number inline */}
      <input
        value={rel.release_number||""}
        onChange={e=>onUpd(rel.id,{release_number:e.target.value})}
        placeholder="v0.0.0 — escribe aquí para renombrar"
        onClick={e=>e.stopPropagation()}
        style={{width:"100%",background:"var(--dp-sf2,#07090f)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:4,padding:"3px 8px",fontSize:10,color:"var(--dp-tx2,#94a3b8)",fontFamily:"inherit",outline:"none",marginBottom:6}}
      />

      {/* Description — textarea with wrapping */}
      <textarea
        value={rel.description||""}
        onChange={e=>onUpd(rel.id,{description:e.target.value})}
        onClick={e=>e.stopPropagation()}
        placeholder="Descripción de la release…"
        rows={rel.description&&rel.description.length>40?3:2}
        style={{width:"100%",background:"none",border:"none",borderBottom:"1px solid var(--dp-bd,#0e1520)",fontSize:10,color:"var(--dp-tx2,#475569)",fontFamily:"inherit",outline:"none",marginBottom:12,paddingBottom:6,resize:"none",lineHeight:1.5}}
      />

      {/* Status selector */}
      <div style={{marginBottom:10}}>
        <select value={rel.status||"Planned"}
          onChange={e=>onUpd(rel.id,{status:e.target.value})}
          onClick={e=>e.stopPropagation()}
          style={{background:cfg.bg_color,border:`1px solid ${cfg.border}`,borderRadius:5,padding:"4px 10px",fontSize:10,color:cfg.color,cursor:"pointer",outline:"none",fontWeight:700,fontFamily:"inherit"}}>
          {Object.entries(statusCfg).map(([name])=><option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      {/* Dates — stacked with labels */}
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:8}}>
        <div>
          <div style={{fontSize:9,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"var(--dp-tx3,#334155)",marginBottom:3}}>Start Date</div>
          <input type="date" value={rel.start_date||""}
            onClick={e=>e.stopPropagation()}
            onChange={e=>onUpd(rel.id,{start_date:e.target.value})}
            style={{width:"100%",background:"var(--dp-sf2,#07090f)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:4,padding:"5px 8px",fontSize:10,color:"var(--dp-tx2,#94a3b8)",outline:"none"}}/>
        </div>
        <div>
          <div style={{fontSize:9,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"var(--dp-tx3,#334155)",marginBottom:3}}>End Date</div>
          <input type="date" value={rel.end_date||""}
            onClick={e=>e.stopPropagation()}
            onChange={e=>onUpd(rel.id,{end_date:e.target.value})}
            style={{width:"100%",background:"var(--dp-sf2,#07090f)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:4,padding:"5px 8px",fontSize:10,color:"var(--dp-tx2,#94a3b8)",outline:"none"}}/>
        </div>
      </div>

      {/* Conflicts */}
      {conflicts.length>0&&(
        <div style={{background:"rgba(248,113,113,.06)",border:"1px solid #7f1d1d",borderRadius:4,padding:"6px 9px",fontSize:10,color:"#f87171",marginBottom:8}}>
          <div style={{fontWeight:700,marginBottom:3}}>⚠ Repos en conflicto:</div>
          {conflicts.map(c=>(
            <div key={c.repo} style={{marginTop:2,color:"#fca5a5"}}>
              · <strong>{c.repo}</strong>
              <span style={{color:"#7f1d1d"}}> — también en {c.otherRelease} ({c.groupName})</span>
            </div>
          ))}
        </div>
      )}

      {/* Tickets */}
      <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8}}>
        {relTickets.map(t=>{
          const PCOLOR={Highest:"#ef4444",High:"#f97316",Medium:"#3b82f6",Low:"#6b7280"};
          const pColor = PCOLOR[t.priority]||"#334155";
          const noRepo = !t.repos || t.repos.length===0;
          return (
            <div key={t.key} draggable
              onDragStart={()=>setDrag({key:t.key,fromId:rel.id})}
              onDragEnd={()=>setDrag(null)}
              onClick={e=>e.stopPropagation()}
              title={noRepo?"⚠ Sin repositorio — asigna Components en Jira":t.summary}
              style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",background:"var(--dp-sf2,#07090f)",border:noRepo?"1px solid rgba(239,68,68,.5)":"1px solid var(--dp-bd,#1e293b)",borderLeft:`2px solid ${noRepo?"#ef4444":pColor}`,borderRadius:4,cursor:"grab",fontSize:10}}>
              {noRepo&&<span style={{color:"#ef4444",fontSize:10,flexShrink:0}}>⚠</span>}
              <span style={{color:"#38bdf8",fontWeight:700,flexShrink:0}}>{t.key}</span>
              <span style={{color:noRepo?"#ef4444":"var(--dp-tx3,#64748b)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.summary.slice(0,28)}{t.summary.length>28?"…":""}</span>
              <span style={{color:"var(--dp-tx3,#334155)",flexShrink:0,fontSize:9}}>{t.assignee?.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2)||"—"}</span>
              <button onClick={e=>{e.stopPropagation();onUpd(rel.id,{ticket_ids:(rel.ticket_ids||[]).filter(x=>x!==t.key)});}}
                style={{background:"none",border:"none",color:"var(--dp-tx3,#334155)",cursor:"pointer",fontSize:12,lineHeight:1,flexShrink:0}}>×</button>
            </div>
          );
        })}
      </div>

      {/* Warning: tickets sin repo */}
      {relTickets.some(t=>!t.repos||t.repos.length===0)&&(
        <div style={{fontSize:9,color:"#ef4444",marginBottom:6,padding:"3px 6px",background:"rgba(239,68,68,.06)",borderRadius:3,border:"1px solid rgba(239,68,68,.2)"}}>
          ⚠ {relTickets.filter(t=>!t.repos||t.repos.length===0).length} ticket{relTickets.filter(t=>!t.repos||t.repos.length===0).length>1?"s":""} sin repositorio — asigna Components en Jira
        </div>
      )}

      {/* Add ticket */}
      {addingTicket ? (
        <div style={{marginBottom:8}}>
          <input autoFocus value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Buscar ticket…"
            style={{width:"100%",background:"var(--dp-sf2,#07090f)",border:"1px solid #38bdf8",borderRadius:4,padding:"5px 8px",fontSize:10,color:"var(--dp-tx,#e6edf3)",outline:"none",marginBottom:3}}
            onBlur={()=>{setTimeout(()=>{setAddingTicket(false);setSearch("");},150);}}/>
          {unassigned.filter(t=>!search||(t.key+t.summary).toLowerCase().includes(search.toLowerCase())).slice(0,5).map(t=>(
            <div key={t.key}
              onMouseDown={()=>{onUpd(rel.id,{ticket_ids:[...(rel.ticket_ids||[]),t.key]});setAddingTicket(false);setSearch("");}}
              style={{padding:"4px 8px",fontSize:10,cursor:"pointer",color:"var(--dp-tx2,#94a3b8)",display:"flex",gap:8,borderRadius:3}}
              onMouseEnter={e=>e.currentTarget.style.background="var(--dp-sf,#0b0f18)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{color:"#38bdf8",fontWeight:700,flexShrink:0}}>{t.key}</span>
              <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.summary}</span>
            </div>
          ))}
        </div>
      ):(
        <button onClick={e=>{e.stopPropagation();setAddingTicket(true);}}
          style={{width:"100%",background:"transparent",border:"1px dashed var(--dp-bd,#1e293b)",borderRadius:4,padding:"5px",fontSize:10,color:"var(--dp-tx3,#334155)",cursor:"pointer",marginBottom:10,transition:"border-color .15s"}}
          onMouseEnter={e=>e.currentTarget.style.borderColor=cfg.color}
          onMouseLeave={e=>e.currentTarget.style.borderColor="var(--dp-bd,#1e293b)"}>+ ticket</button>
      )}

      {/* Repo chips */}
      {relRepos.length>0&&(
        <div style={{display:"flex",gap:4,flexWrap:"wrap",paddingTop:6,borderTop:"1px solid var(--dp-bd,#0e1520)"}}>
          {relRepos.map(r=><RepoChip key={r} name={r}/>)}
        </div>
      )}
    </div>
  );
}

/* ─── RELEASE DETAIL — repo cards ────────────────────────────── */
function ReleaseDetail({ rel, tickets, statusCfg, repoGroups, allReleases, onBack, onUpdRelease, isLight }) {
  const [ticketStatuses, setTicketStatuses] = useState(rel.ticket_statuses||{});
  const [syncing, setSyncing] = useState({});
  const [closing, setClosing] = useState(false);
  const [targetStatus, setTargetStatus] = useState("");

  // Group tickets by repo
  const relTickets = (rel.ticket_ids||[]).map(k=>tickets.find(t=>t.key===k)).filter(Boolean);
  const tMap       = Object.fromEntries(tickets.map(t=>[t.key,t]));
  const allRepos   = [...new Set(relTickets.flatMap(t=>t.repos||[]))].sort();
  const byRepo     = {};
  allRepos.forEach(r=>{ byRepo[r]=relTickets.filter(t=>t.repos?.includes(r)); });

  const getStatus = (key) => ticketStatuses[key]||"in_progress";

  // Detect which repos are blocked by other active releases (via repo groups)
  // Blocks "Merged to master" status specifically
  const mergeBlockers = []; // { repo, groupName, otherRelease, otherStatus }
  for(const group of (repoGroups||[])) {
    const myGroupRepos = allRepos.filter(r => group.repos.includes(r));
    if(myGroupRepos.length === 0) continue;
    for(const other of (allReleases||[])) {
      if(other.id === rel.id) continue;
      if(other.status === "Deployed" || other.status === "Rollback") continue;
      // Only block if date ranges overlap
      if(!datesOverlap(rel.start_date, rel.end_date, other.start_date, other.end_date)) continue;
      const otherRepos = [...new Set((other.ticket_ids||[]).flatMap(k=>tMap[k]?.repos||[]))];
      for(const repo of myGroupRepos) {
        if(otherRepos.includes(repo) && !mergeBlockers.find(b=>b.repo===repo)) {
          mergeBlockers.push({ repo, groupName:group.name, otherRelease:other.release_number||"sin versión", otherStatus:other.status||"Planned" });
        }
      }
    }
  }

  const handleStatusChange = async (key, newStatus) => {
    // Optimistic update
    const updated = {...ticketStatuses,[key]:newStatus};
    setTicketStatuses(updated);
    setSyncing(s=>({...s,[key]:true}));

    // Persist to Supabase
    await supabase.from("dp_releases").update({ticket_statuses:updated}).eq("id",rel.id);
    onUpdRelease({ticket_statuses:updated});

    // Sync to Jira
    const result = await jiraTransition(key, newStatus);
    if(!result.ok) console.warn(`Jira sync failed for ${key}: ${result.error}`);
    setSyncing(s=>({...s,[key]:false}));
  };

  const handleCloseRelease = async () => {
    if(!targetStatus||closing) return;
    setClosing(true);
    await onUpdRelease({status:targetStatus});
    setTimeout(()=>{setClosing(false);onBack();},600);
  };

  // Final state check
  const allReady = allRepos.every(r=>(byRepo[r]||[]).every(t=>MERGE_READY.includes(getStatus(t.key))));
  const readyCount = relTickets.filter(t=>MERGE_READY.includes(getStatus(t.key))).length;
  const finalStatuses = Object.entries(statusCfg).filter(([,v])=>v.is_final);

  const relCfg = statusCfg[rel.status]||{color:"#6b7280",bg_color:"rgba(107,114,128,.12)",border:"#1f2937"};

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{marginBottom:24}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"var(--dp-tx3,#64748b)",cursor:"pointer",fontSize:11,marginBottom:12,padding:0,fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}>
          ← Volver a Planning
        </button>
        <div style={{display:"flex",alignItems:"flex-start",gap:16,marginBottom:14}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <span style={{fontSize:9,color:"var(--dp-tx3,#334155)",letterSpacing:".1em",textTransform:"uppercase"}}>Release</span>
              {rel.start_date&&rel.end_date&&<><span style={{fontSize:9,color:"var(--dp-bd,#1e293b)"}}>·</span><span style={{fontSize:9,color:"var(--dp-tx3,#334155)"}}>{rel.start_date} → {rel.end_date}</span></>}
            </div>
            <h1 style={{fontSize:22,fontWeight:700,color:"var(--dp-tx,#e6edf3)",marginBottom:4}}>{rel.release_number||"Sin versión"}</h1>
            {rel.description&&<p style={{fontSize:11,color:"var(--dp-tx2,#475569)"}}>{rel.description}</p>}
          </div>
          {/* Global progress */}
          <div style={{background:"var(--dp-sf,#0b0f18)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:8,padding:"12px 16px",minWidth:150,textAlign:"center"}}>
            <div style={{fontSize:26,fontWeight:700,color:allReady?"#34d399":"var(--dp-tx,#e6edf3)",lineHeight:1}}>
              {readyCount}<span style={{fontSize:13,color:"var(--dp-tx3,#334155)"}}>/{relTickets.length}</span>
            </div>
            <SLabel style={{marginTop:4}}>Tickets listos</SLabel>
            <div style={{height:3,background:"var(--dp-bd,#1e293b)",borderRadius:2,overflow:"hidden",marginTop:7}}>
              <div style={{width:`${relTickets.length?readyCount/relTickets.length*100:0}%`,height:"100%",background:allReady?"#34d399":"#3b82f6",borderRadius:2,transition:"width .4s ease"}}/>
            </div>
          </div>
        </div>

        {/* Repo pills */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {allRepos.map(repo=>{
            const rTickets=byRepo[repo]||[], ready=rTickets.filter(t=>MERGE_READY.includes(getStatus(t.key))).length, ok=ready===rTickets.length;
            return <div key={repo} style={{display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,background:ok?"rgba(52,211,153,.08)":"var(--dp-sf2,rgba(56,189,248,.06))",border:`1px solid ${ok?"rgba(52,211,153,.3)":"var(--dp-bd,#1e293b)"}`,fontSize:10,color:ok?"#34d399":"var(--dp-tx3,#64748b)"}}>
              {ok?"✓":"○"} {repo} <span style={{color:"var(--dp-tx3,#334155)",fontSize:9}}>{ready}/{rTickets.length}</span>
            </div>;
          })}
        </div>
      </div>

      <div style={{height:1,background:"var(--dp-bd,#0e1520)",marginBottom:24}}/>

      {/* Repo cards */}
      <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"flex-start",marginBottom:28}}>
        {/* Empty state — tickets not loaded from Jira yet */}
        {allRepos.length===0 && (
          <div style={{width:"100%",padding:"32px 24px",background:"var(--dp-sf,#0b0f18)",border:"1px dashed var(--dp-bd,#1e293b)",borderRadius:8,textAlign:"center"}}>
            {(rel.ticket_ids||[]).length===0 ? (
              <>
                <div style={{fontSize:20,marginBottom:8}}>📋</div>
                <div style={{fontSize:13,color:"var(--dp-tx2,#94a3b8)",marginBottom:4}}>Sin tickets asignados</div>
                <div style={{fontSize:11,color:"var(--dp-tx3,#475569)"}}>Ve a Planning y arrastra tickets a esta release</div>
              </>
            ) : (
              <>
                <div style={{fontSize:20,marginBottom:8}}>🔄</div>
                <div style={{fontSize:13,color:"var(--dp-tx2,#94a3b8)",marginBottom:4}}>{(rel.ticket_ids||[]).length} tickets asignados — sin datos de repo</div>
                <div style={{fontSize:11,color:"var(--dp-tx3,#475569)"}}>
                  Los tickets necesitan el campo <strong style={{color:"var(--dp-tx2,#94a3b8)"}}>Components</strong> en Jira para agruparse por repositorio.<br/>
                  Revisa que los tickets tienen componentes asignados en Jira.
                </div>
                <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:6}}>
                  {(rel.ticket_ids||[]).map(k=>(
                    <div key={k} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"6px 12px",background:"var(--dp-sf2,#07090f)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:6,fontSize:11,color:"var(--dp-tx2,#94a3b8)"}}>
                      <span style={{color:"#38bdf8",fontWeight:700}}>{k}</span>
                      <span style={{fontSize:9,color:"var(--dp-tx3,#475569)"}}>sin componente</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {allRepos.map(repo=>{
          const rTickets=byRepo[repo]||[];
          const ready=rTickets.filter(t=>MERGE_READY.includes(getStatus(t.key))).length;
          const allOk=ready===rTickets.length;
          const someOk=ready>0;
          const borderColor=allOk?"#34d399":someOk?"#f59e0b":"var(--dp-bd,#1e293b)";
          const topColor=allOk?"#34d399":someOk?"#f59e0b":"var(--dp-tx3,#334155)";
          return (
            <div key={repo} className="anim-in" style={{width:300,background:"var(--dp-sf,#0b0f18)",border:`1px solid ${borderColor}`,borderTop:`2px solid ${topColor}`,borderRadius:8,flexShrink:0,transition:"border-color .3s"}}>
              {/* Repo header */}
              <div style={{padding:"11px 14px",borderBottom:"1px solid var(--dp-bd,#0e1520)",display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:24,height:24,borderRadius:5,background:allOk?"rgba(52,211,153,.15)":"rgba(56,189,248,.08)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:allOk?"#34d399":"#38bdf8"}}>{allOk?"✓":"⬡"}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--dp-tx,#e6edf3)"}}>{repo}</div>
                  <div style={{fontSize:9,color:"var(--dp-tx3,#334155)",marginTop:1}}>{ready}/{rTickets.length} listos</div>
                </div>
                <div style={{width:44,height:4,background:"var(--dp-bd,#1e293b)",borderRadius:2,overflow:"hidden"}}>
                  <div style={{width:`${rTickets.length?ready/rTickets.length*100:0}%`,height:"100%",background:allOk?"#34d399":someOk?"#f59e0b":"#334155",borderRadius:2,transition:"width .4s"}}/>
                </div>
                {allOk&&<span style={{fontSize:9,color:"#34d399",fontWeight:700}}>LISTO</span>}
              </div>

              {/* Tickets */}
              {rTickets.map((ticket,i)=>{
                const st=getStatus(ticket.key);
                const stCfg=TICKET_STATUS_CFG[st]||TICKET_STATUS_CFG.in_progress;
                const isReady=MERGE_READY.includes(st);
                const isSyncing=syncing[ticket.key];
                const PCOLOR={Highest:"#ef4444",High:"#f97316",Medium:"#3b82f6",Low:"#6b7280"};
                return (
                  <div key={ticket.key} style={{padding:"10px 14px",borderBottom:i<rTickets.length-1?"1px solid var(--dp-bd,#0a0e14)":"none",opacity:isReady?.7:1,transition:"opacity .2s"}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:6}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:PCOLOR[ticket.priority]||"#64748b",marginTop:4,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
                          <span style={{fontSize:10,fontWeight:700,color:"#38bdf8",flexShrink:0}}>{ticket.key}</span>
                          <span style={{fontSize:9,color:"var(--dp-tx3,#334155)",background:"var(--dp-sf2,#0d111a)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:3,padding:"0 4px",flexShrink:0}}>{ticket.type||"Task"}</span>
                          {isSyncing&&<span className="spin" style={{fontSize:10,color:"#38bdf8"}}>⟳</span>}
                        </div>
                        <div style={{fontSize:10,color:isReady?"var(--dp-tx3,#475569)":"var(--dp-tx2,#94a3b8)",lineHeight:1.4,textDecoration:isReady?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}}>{ticket.summary}</div>
                        <div style={{fontSize:9,color:"var(--dp-tx3,#334155)"}}>👤 {ticket.assignee||"—"}</div>
                      </div>
                    </div>
                    <select value={st} onChange={e=>handleStatusChange(ticket.key,e.target.value)}
                      style={{width:"100%",background:stCfg.bg,border:`1px solid ${stCfg.color}40`,borderRadius:4,padding:"4px 8px",fontSize:10,color:stCfg.color,cursor:"pointer",outline:"none",fontWeight:700,fontFamily:"inherit",transition:"all .2s"}}>
                      {TICKET_STATUSES.map(s=><option key={s} value={s}>{TICKET_STATUS_CFG[s].icon} {TICKET_STATUS_CFG[s].label}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Close Release */}
      <div style={{background:"var(--dp-sf,#0b0f18)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:8,padding:"18px 20px"}}>
        <SLabel style={{marginBottom:12}}>Cerrar Release</SLabel>

        {/* Tickets pendientes */}
        {!allReady&&(
          <div style={{padding:"8px 12px",background:"rgba(248,113,113,.06)",border:"1px solid #7f1d1d",borderRadius:6,fontSize:10,color:"#f87171",marginBottom:10}}>
            <div style={{fontWeight:700,marginBottom:4}}>⚠ Hay tickets pendientes en:</div>
            {allRepos.filter(r=>(byRepo[r]||[]).some(t=>!MERGE_READY.includes(getStatus(t.key)))).map(r=>{
              const pending=(byRepo[r]||[]).filter(t=>!MERGE_READY.includes(getStatus(t.key))).length;
              return <div key={r} style={{marginTop:2}}>· <span style={{color:"#ef4444"}}>{r}</span> — {pending} ticket{pending>1?"s":""} pendiente{pending>1?"s":""}</div>;
            })}
          </div>
        )}

        {/* Merge blocker — otras releases activas comparten repos del mismo grupo */}
        {mergeBlockers.length>0&&(
          <div style={{padding:"8px 12px",background:"rgba(251,191,36,.06)",border:"1px solid #92400e",borderRadius:6,fontSize:10,color:"#fbbf24",marginBottom:10}}>
            <div style={{fontWeight:700,marginBottom:4}}>🔒 Merge a master bloqueado por conflicto de repos:</div>
            {mergeBlockers.map(b=>(
              <div key={b.repo} style={{marginTop:3}}>
                · <strong style={{color:"#fcd34d"}}>{b.repo}</strong>
                <span style={{color:"#92400e"}}> también en <strong style={{color:"#fbbf24"}}>{b.otherRelease}</strong> ({b.otherStatus}) — grupo "{b.groupName}"</span>
              </div>
            ))}
            <div style={{marginTop:6,color:"#92400e",fontSize:9}}>
              Puedes cambiar a Staging o Deployed, pero no a "Merged to master" hasta que las otras releases del grupo estén cerradas.
            </div>
          </div>
        )}

        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <select value={targetStatus} onChange={e=>setTargetStatus(e.target.value)}
            style={{flex:1,background:"var(--dp-sf2,#07090f)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:6,padding:"8px 12px",fontSize:11,color:"var(--dp-tx2,#94a3b8)",outline:"none",fontFamily:"inherit"}}>
            <option value="">Selecciona estado final…</option>
            {Object.entries(statusCfg).map(([name,c])=>{
              // Block "Merged to master" if there are merge blockers
              const isMergeStatus = name.toLowerCase().includes("merge");
              const isBlocked     = isMergeStatus && mergeBlockers.length > 0;
              return (
                <option key={name} value={isBlocked?"":name} disabled={isBlocked}>
                  {isBlocked?"🔒 ":""}{name}{isBlocked?" (bloqueado)":""}
                </option>
              );
            })}
          </select>
          <button onClick={handleCloseRelease} disabled={!targetStatus||closing}
            style={{background:targetStatus&&!closing?"linear-gradient(135deg,#1d4ed8,#0ea5e9)":"var(--dp-sf2,#0b0f18)",border:`1px solid ${targetStatus?"#3b82f6":"var(--dp-bd,#1e293b)"}`,borderRadius:6,padding:"8px 20px",fontSize:11,fontWeight:700,color:targetStatus&&!closing?"#fff":"var(--dp-tx3,#334155)",cursor:targetStatus&&!closing?"pointer":"not-allowed",transition:"all .2s",fontFamily:"inherit"}}>
            {closing?"Cerrando…":"Cerrar Release →"}
          </button>
        </div>
        <div style={{marginTop:8,fontSize:9,color:"var(--dp-tx3,#334155)"}}>
          Estados configurables desde Admin → Deploy Config
        </div>
      </div>
    </div>
  );
}

/* ─── TIMELINE ───────────────────────────────────────────────── */
function Timeline({ releases, tickets, upd, setDetail, statusCfg }) {
  const [zoom, setZoom] = useState("weeks"); // days | weeks | months
  const [drag, setDrag] = useState(null);
  const relRef = useRef(releases);
  relRef.current = releases;
  const tMap = Object.fromEntries(tickets.map(t=>[t.key,t]));

  const DAYS_ES = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
  const MONTHS_ES = ["Ene","Feb","Mar","Apr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

  // Column width per day based on zoom
  const DAY_W = { days:44, weeks:16, months:4 }[zoom];
  const LABEL_W = 200;

  const allDates = releases.flatMap(r=>[r.start_date,r.end_date]).filter(Boolean).sort();
  const minDate = allDates[0]||fmt(today);
  const maxDate = allDates[allDates.length-1]||addD(fmt(today),30);
  const startDate = addD(minDate,-7);
  const totalDays = Math.max(diffD(startDate,maxDate)+21, 30);
  const totalW = LABEL_W + totalDays * DAY_W;

  const dateToX = iso => LABEL_W + diffD(startDate,iso)*DAY_W;
  const xToDate = x => addD(startDate, Math.round((x-LABEL_W)/DAY_W));
  const todayX  = dateToX(fmt(today));

  // Generate header marks
  const marks = [];
  if(zoom==="days") {
    // every day
    let d = new Date(startDate+"T00:00:00");
    while(fmt(d)<=addD(maxDate,14)) {
      marks.push({ date:fmt(d), label:DAYS_ES[d.getDay()], sub:d.getDate(), isWeekend:d.getDay()===0||d.getDay()===6 });
      d.setDate(d.getDate()+1);
    }
  } else if(zoom==="weeks") {
    // every monday
    let d = new Date(startDate+"T00:00:00");
    // advance to monday
    while(d.getDay()!==1) d.setDate(d.getDate()+1);
    while(fmt(d)<=addD(maxDate,14)) {
      marks.push({ date:fmt(d), label:`${d.getDate()} ${MONTHS_ES[d.getMonth()]}` });
      d.setDate(d.getDate()+7);
    }
  } else {
    // every 1st of month
    let d = new Date(startDate+"T00:00:00"); d.setDate(1);
    while(fmt(d)<=addD(maxDate,31)) {
      marks.push({ date:fmt(d), label:`${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}` });
      d.setMonth(d.getMonth()+1);
    }
  }

  const handleMD = (e,relId,type) => {
    e.preventDefault(); e.stopPropagation();
    const rel = releases.find(r=>r.id===relId);
    if(!rel?.start_date||!rel?.end_date) return;
    setDrag({relId,type,startX:e.clientX,origStart:rel.start_date,origEnd:rel.end_date});
  };

  useEffect(()=>{
    if(!drag) return;
    const onMove = e => {
      const daysDx=Math.round((e.clientX-drag.startX)/DAY_W);
      if(!daysDx) return;
      if(drag.type==="move") upd(drag.relId,{start_date:addD(drag.origStart,daysDx),end_date:addD(drag.origEnd,daysDx)});
      else if(drag.type==="left"){ const s=addD(drag.origStart,daysDx); if(diffD(s,drag.origEnd)>=1) upd(drag.relId,{start_date:s}); }
      else { const e2=addD(drag.origEnd,daysDx); if(diffD(drag.origStart,e2)>=1) upd(drag.relId,{end_date:e2}); }
    };
    const onUp=()=>setDrag(null);
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
    return()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
  },[drag,DAY_W]);

  const GANTT_COLORS = {};
  Object.entries(statusCfg).forEach(([name,cfg])=>{ GANTT_COLORS[name]=cfg.color; });

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",marginBottom:16,gap:12,flexWrap:"wrap"}}>
        <h2 style={{fontSize:14,color:"var(--dp-tx,#e6edf3)",fontWeight:700}}>Timeline</h2>
        {/* Zoom selector */}
        <div style={{display:"flex",background:"var(--dp-sf,#0b0f18)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:6,overflow:"hidden",marginLeft:8}}>
          {[["days","Días"],["weeks","Semanas"],["months","Meses"]].map(([z,l])=>(
            <button key={z} onClick={()=>setZoom(z)}
              style={{background:zoom===z?"#1d4ed8":"transparent",color:zoom===z?"#fff":"var(--dp-tx3,#64748b)",border:"none",padding:"5px 12px",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:zoom===z?700:400,transition:"all .15s"}}>
              {l}
            </button>
          ))}
        </div>
        {/* Legend */}
        <div style={{marginLeft:"auto",display:"flex",gap:12,flexWrap:"wrap"}}>
          {Object.entries(statusCfg).map(([name,cfg])=>(
            <div key={name} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"var(--dp-tx3,#64748b)"}}>
              <div style={{width:10,height:10,borderRadius:2,background:cfg.color}}/>
              {name}
            </div>
          ))}
        </div>
      </div>

      <div style={{overflowX:"auto",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:8}}>
        <div style={{width:Math.max(totalW,600),minWidth:"100%",position:"relative",background:"var(--dp-sf,#07090f)"}}>
          {/* Date header */}
          <div style={{display:"flex",height:zoom==="days"?44:36,borderBottom:"1px solid var(--dp-bd,#0e1520)",position:"sticky",top:0,zIndex:5,background:"var(--dp-sf,#07090f)"}}>
            <div style={{width:LABEL_W,flexShrink:0,borderRight:"1px solid var(--dp-bd,#0e1520)",display:"flex",alignItems:"center",paddingLeft:14}}>
              <SLabel>{zoom==="days"?"Día":zoom==="weeks"?"Semana":"Mes"}</SLabel>
            </div>
            <div style={{flex:1,position:"relative",overflow:"hidden"}}>
              {marks.map(m=>{
                const x=dateToX(m.date)-LABEL_W;
                const isTodayMark = zoom==="days"?m.date===fmt(today): zoom==="weeks"?m.date<=fmt(today)&&addD(m.date,7)>fmt(today):m.date.slice(0,7)===fmt(today).slice(0,7);
                return (
                  <div key={m.date} style={{position:"absolute",left:x,top:0,height:"100%",borderLeft:`1px solid ${isTodayMark?"#f59e0b":"var(--dp-bd,#0e1520)"}`,display:"flex",flexDirection:"column",alignItems:"flex-start",paddingLeft:4,justifyContent:"center",minWidth:1}}>
                    <span style={{fontSize:zoom==="days"?10:9,color:isTodayMark?"#f59e0b":"var(--dp-tx3,#334155)",fontWeight:isTodayMark?700:400,whiteSpace:"nowrap",lineHeight:1.3}}>
                      {zoom==="days"?m.label:m.label}
                    </span>
                    {zoom==="days"&&<span style={{fontSize:11,fontWeight:700,color:isTodayMark?"#f59e0b":m.isWeekend?"var(--dp-tx3,#475569)":"var(--dp-tx2,#94a3b8)",lineHeight:1}}>{m.sub}</span>}
                  </div>
                );
              })}
              {/* Today line */}
              <div style={{position:"absolute",left:todayX-LABEL_W,top:0,height:"100%",borderLeft:"1px dashed #f59e0b",pointerEvents:"none"}}/>
            </div>
          </div>

          {/* Rows */}
          {releases.map(rel=>{
            const color = GANTT_COLORS[rel.status]||"#6b7280";
            const cfg = statusCfg[rel.status]||{bg_color:"rgba(107,114,128,.12)"};
            const relTickets=(rel.ticket_ids||[]).map(k=>tMap[k]).filter(Boolean);
            const hasDates=rel.start_date&&rel.end_date;
            const x1=hasDates?dateToX(rel.start_date):0, x2=hasDates?dateToX(rel.end_date):0;
            const barW=Math.max(x2-x1,50);
            const dur=hasDates?diffD(rel.start_date,rel.end_date):null;
            return (
              <div key={rel.id} style={{display:"flex",height:56,borderBottom:"1px solid var(--dp-bd,#0e1520)",alignItems:"center"}}>
                <div style={{width:LABEL_W,flexShrink:0,borderRight:"1px solid var(--dp-bd,#0e1520)",padding:"0 14px",cursor:"pointer"}} onClick={()=>setDetail(rel.id)}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--dp-tx,#e6edf3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{rel.release_number||"—"}</div>
                  <div style={{fontSize:9,marginTop:2,display:"flex",alignItems:"center",gap:5}}>
                    <span style={{color,fontWeight:600}}>{rel.status||"Planned"}</span>
                    {dur!=null&&<span style={{color:"var(--dp-tx3,#475569)"}}>{dur}d · {rel.ticket_ids?.length||0} tickets</span>}
                  </div>
                </div>
                <div style={{flex:1,position:"relative",height:"100%"}}>
                  {/* Weekend shading for day view */}
                  {zoom==="days"&&marks.filter(m=>m.isWeekend).map(m=>(
                    <div key={m.date} style={{position:"absolute",left:dateToX(m.date)-LABEL_W,top:0,width:DAY_W,height:"100%",background:"rgba(0,0,0,.15)",pointerEvents:"none"}}/>
                  ))}
                  {/* Grid */}
                  <div style={{position:"absolute",inset:0,backgroundImage:`repeating-linear-gradient(90deg,transparent,transparent ${DAY_W*(zoom==="days"?7:zoom==="weeks"?1:1)*7/7-1}px,var(--dp-bd,#0e1520) ${DAY_W*(zoom==="days"?7:zoom==="weeks"?1:1)*7/7}px)`,pointerEvents:"none"}}/>
                  {/* Today line */}
                  <div style={{position:"absolute",left:todayX-LABEL_W,top:0,height:"100%",borderLeft:"1px dashed rgba(245,158,11,.3)",pointerEvents:"none"}}/>

                  {hasDates&&(
                    <div style={{position:"absolute",left:x1-LABEL_W,top:"50%",transform:"translateY(-50%)",width:barW,height:28,background:cfg.bg_color,border:`1px solid ${color}`,borderRadius:4,cursor:drag?.relId===rel.id&&drag.type==="move"?"grabbing":"grab",display:"flex",alignItems:"center",userSelect:"none",overflow:"hidden"}}
                      onMouseDown={e=>handleMD(e,rel.id,"move")}
                      onClick={()=>setDetail(rel.id)}>
                      <div style={{width:5,height:"100%",cursor:"col-resize",flexShrink:0,background:`${color}40`}} onMouseDown={e=>{e.stopPropagation();handleMD(e,rel.id,"left");}}/>
                      <div style={{flex:1,padding:"0 5px",fontSize:9,color,fontWeight:600,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{rel.start_date} → {rel.end_date}</div>
                      <div style={{width:5,height:"100%",cursor:"col-resize",flexShrink:0,background:`${color}40`}} onMouseDown={e=>{e.stopPropagation();handleMD(e,rel.id,"right");}}/>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{fontSize:9,color:"var(--dp-tx3,#334155)",marginTop:8,display:"flex",gap:12}}>
        <span>⟺ Arrastra para mover</span><span>·</span><span>Extremos para redimensionar</span><span>·</span><span>Clic para abrir detalle</span>
      </div>
    </div>
  );
}

/* ─── HISTORY ────────────────────────────────────────────────── */
function History({ releases, tickets, setDetail, statusCfg }) {
  const [sortBy, setSortBy] = useState("end_date");
  const tMap = Object.fromEntries(tickets.map(t=>[t.key,t]));
  const sorted = [...releases].sort((a,b)=>{
    if(sortBy==="end_date")   return (b.end_date||"")>(a.end_date||"")?1:-1;
    if(sortBy==="start_date") return (b.start_date||"")>(a.start_date||"")?1:-1;
    return 0;
  });
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <h2 style={{fontSize:14,color:"var(--dp-tx,#e6edf3)",fontWeight:700}}>Historial</h2>
        <span style={{fontSize:10,color:"var(--dp-tx3,#334155)"}}>{sorted.length} releases</span>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          <SLabel>Ordenar</SLabel>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{background:"var(--dp-sf,#0b0f18)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:4,padding:"4px 8px",fontSize:10,color:"var(--dp-tx2,#94a3b8)",outline:"none"}}>
            <option value="end_date">Fecha fin</option>
            <option value="start_date">Fecha inicio</option>
          </select>
        </div>
      </div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
        <thead><tr style={{borderBottom:"1px solid var(--dp-bd,#0e1520)"}}>
          {["RELEASE","ESTADO","INICIO","FIN","DURACIÓN","TICKETS","REPOS"].map(h=>(
            <th key={h} style={{padding:"7px 12px",textAlign:"left",color:"var(--dp-tx3,#334155)",fontWeight:600,letterSpacing:".06em",fontSize:9}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {sorted.map(rel=>{
            const relTickets=(rel.ticket_ids||[]).map(k=>tMap[k]).filter(Boolean);
            const relRepos=[...new Set(relTickets.flatMap(t=>t.repos||[]))];
            const dur=rel.start_date&&rel.end_date?diffD(rel.start_date,rel.end_date):null;
            const cfg=statusCfg[rel.status]||{color:"#6b7280"};
            return (
              <tr key={rel.id} onClick={()=>setDetail(rel.id)} style={{borderBottom:"1px solid var(--dp-bd,#0d111a)",cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--dp-sf,#0b0f18)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <td style={{padding:"11px 12px"}}>
                  <div style={{fontWeight:700,color:"#38bdf8",fontSize:11}}>{rel.release_number||"—"}</div>
                  {rel.description&&<div style={{color:"var(--dp-tx3,#334155)",fontSize:9,marginTop:1}}>{rel.description}</div>}
                </td>
                <td style={{padding:"11px 12px"}}><span style={{padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700,color:cfg.color,background:cfg.bg_color||"rgba(107,114,128,.12)",border:`1px solid ${cfg.border||"#1f2937"}`}}>{rel.status||"Planned"}</span></td>
                <td style={{padding:"11px 12px",color:"var(--dp-tx2,#64748b)"}}>{rel.start_date||"—"}</td>
                <td style={{padding:"11px 12px",color:"var(--dp-tx2,#64748b)"}}>{rel.end_date||"—"}</td>
                <td style={{padding:"11px 12px",color:"var(--dp-tx,#94a3b8)",fontWeight:600}}>{dur!=null?`${dur}d`:"—"}</td>
                <td style={{padding:"11px 12px",color:"var(--dp-tx2,#64748b)"}}>{rel.ticket_ids?.length||0}</td>
                <td style={{padding:"11px 12px"}}><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{relRepos.slice(0,3).map(r=><RepoChip key={r} name={r}/>)}{relRepos.length>3&&<span style={{fontSize:9,color:"var(--dp-tx3,#334155)"}}>+{relRepos.length-3}</span>}</div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── METRICS ────────────────────────────────────────────────── */
function Metrics({ releases, tickets, statusCfg }) {
  const tMap = Object.fromEntries(tickets.map(t=>[t.key,t]));
  const finalNames = Object.entries(statusCfg).filter(([,v])=>v.is_final).map(([n])=>n);
  const deployed  = releases.filter(r=>r.status==="Deployed");
  const rollbacks = releases.filter(r=>r.status==="Rollback");
  const finished  = releases.filter(r=>finalNames.includes(r.status));
  const durations = finished.filter(r=>r.start_date&&r.end_date).map(r=>diffD(r.start_date,r.end_date));
  const avgDur    = durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):0;
  const successRate = finished.length?Math.round(deployed.length/finished.length*100):0;
  const allKeys   = [...new Set(releases.flatMap(r=>r.ticket_ids||[]))];
  const tpr       = releases.length?(allKeys.length/releases.length).toFixed(1):0;
  const allRepos  = [...new Set(allKeys.flatMap(k=>tMap[k]?.repos||[]))];

  const byMonth={};
  releases.forEach(r=>{if(!r.end_date)return; const m=r.end_date.slice(0,7); byMonth[m]=(byMonth[m]||0)+1;});
  const months=Object.entries(byMonth).sort();
  const maxM=Math.max(...Object.values(byMonth),1);

  const byType={};
  allKeys.forEach(k=>{const t=tMap[k];if(t){byType[t.type||"Task"]=(byType[t.type||"Task"]||0)+1;}});
  const typeEntries=Object.entries(byType).sort((a,b)=>b[1]-a[1]);

  const repoCounts={};
  allKeys.forEach(k=>{(tMap[k]?.repos||[]).forEach(r=>{repoCounts[r]=(repoCounts[r]||0)+1;});});
  const repoEntries=Object.entries(repoCounts).sort((a,b)=>b[1]-a[1]);
  const maxR=Math.max(...Object.values(repoCounts),1);

  const stats=[
    {l:"TOTAL RELEASES",  v:releases.length,    s:`${deployed.length} deployed · ${rollbacks.length} rollbacks`,c:"var(--dp-tx,#e6edf3)"},
    {l:"DURACIÓN MEDIA",  v:`${avgDur}d`,        s:"inicio → fin",                                               c:"var(--dp-tx,#e6edf3)"},
    {l:"TASA DE ÉXITO",   v:`${successRate}%`,   s:`${deployed.length}/${finished.length} finalizadas`,          c:"#34d399"},
    {l:"TICKETS/RELEASE", v:tpr,                 s:"media",                                                      c:"#38bdf8"},
    {l:"REPOS ÚNICOS",    v:allRepos.length,      s:"repositorios",                                              c:"#a78bfa"},
  ];

  const TCOL={Bug:"#f59e0b",Story:"#34d399",Task:"#3b82f6",Epic:"#a78bfa"};

  return (
    <div>
      <h2 style={{fontSize:14,color:"var(--dp-tx,#e6edf3)",fontWeight:700,marginBottom:20}}>Métricas</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:22}}>
        {stats.map(s=>(
          <div key={s.l} style={{background:"var(--dp-sf,#0b0f18)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:8,padding:"13px 15px"}}>
            <SLabel style={{marginBottom:7}}>{s.l}</SLabel>
            <div style={{fontSize:26,fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:9,color:"var(--dp-tx3,#334155)",marginTop:4}}>{s.s}</div>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        <div style={{background:"var(--dp-sf,#0b0f18)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:8,padding:"15px 17px"}}>
          <SLabel style={{marginBottom:12}}>RELEASES POR MES</SLabel>
          <div style={{display:"flex",alignItems:"flex-end",gap:4,height:72,borderBottom:"1px solid var(--dp-bd,#0e1520)",paddingBottom:3}}>
            {months.map(([m,v])=>(
              <div key={m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{background:"#3b82f6",width:"100%",height:Math.round(v/maxM*64),borderRadius:"2px 2px 0 0",minHeight:4}}/>
                <span style={{fontSize:7,color:"var(--dp-tx3,#334155)"}}>{v}</span>
              </div>
            ))}
            {months.length===0&&<div style={{fontSize:10,color:"var(--dp-tx3,#334155)",width:"100%",textAlign:"center"}}>Sin datos</div>}
          </div>
          {months.length>0&&<div style={{display:"flex",gap:4,marginTop:3}}>{months.map(([m])=><div key={m} style={{flex:1,fontSize:7,color:"var(--dp-tx3,#334155)",textAlign:"center"}}>{m.slice(5)}</div>)}</div>}
        </div>
        <div style={{background:"var(--dp-sf,#0b0f18)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:8,padding:"15px 17px"}}>
          <SLabel style={{marginBottom:12}}>TICKETS POR TIPO</SLabel>
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            {typeEntries.map(([type,count])=>{
              const color=TCOL[type]||"#64748b";
              return (<div key={type}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:10,color:"var(--dp-tx2,#94a3b8)"}}>{type}</span>
                  <span style={{fontSize:10,color,fontWeight:700}}>{count} ({Math.round(count/Math.max(allKeys.length,1)*100)}%)</span>
                </div>
                <div style={{height:4,background:"var(--dp-bd,#1e293b)",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.round(count/Math.max(...Object.values(byType),1)*100)}%`,background:color,borderRadius:2}}/>
                </div>
              </div>);
            })}
            {typeEntries.length===0&&<div style={{fontSize:10,color:"var(--dp-tx3,#334155)"}}>Sin datos</div>}
          </div>
        </div>
      </div>
      <div style={{background:"var(--dp-sf,#0b0f18)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:8,padding:"15px 17px"}}>
        <SLabel style={{marginBottom:12}}>REPOS MÁS DESPLEGADOS</SLabel>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {repoEntries.map(([repo,count])=>(
            <div key={repo} style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:9,color:"var(--dp-tx2,#64748b)",width:120,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis"}}>{repo}</span>
              <div style={{flex:1,height:3,background:"var(--dp-bd,#1e293b)",borderRadius:2,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${Math.round(count/maxR*100)}%`,background:"#3b82f6",borderRadius:2}}/>
              </div>
              <span style={{fontSize:9,color:"var(--dp-tx3,#475569)",width:14,textAlign:"right"}}>{count}</span>
            </div>
          ))}
          {repoEntries.length===0&&<div style={{fontSize:10,color:"var(--dp-tx3,#334155)"}}>Sin datos</div>}
        </div>
      </div>
    </div>
  );
}

/* ─── ROOT ───────────────────────────────────────────────────── */
export function DeployPlanner({ currentUser }) {
  const [tab, setTab]           = useState("planning");
  const [detail, setDetail]       = useState(null);
  const [releases, setReleases]   = useState([]);
  const [tickets, setTickets]     = useState([]);
  const [statusCfg, setStatusCfg] = useState({});
  const [repoGroups, setRepoGroups] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [fetchingJira, setFetchingJira] = useState(false);
  const [drag, setDrag]           = useState(null);

  // Light mode — read from html element class, watch for changes
  const [isLight, setIsLight] = useState(document.documentElement.classList.contains("light"));
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsLight(document.documentElement.classList.contains("light"));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data:rels }, { data:statuses }, { data:ssoData }, { data:groups }] = await Promise.all([
      supabase.from("dp_releases").select("*").order("start_date",{ascending:true}),
      supabase.from("dp_release_statuses").select("*").order("ord",{ascending:true}),
      supabase.from("sso_config").select("deploy_jira_statuses").limit(1).single(),
      supabase.from("dp_repo_groups").select("*").order("name"),
    ]);
    setRepoGroups(groups||[]);
    setReleases(rels||[]);
    const cfg = {};
    (statuses||[]).forEach(s=>{ cfg[s.name]={ color:s.color, bg_color:s.bg_color, border:s.border, is_final:s.is_final, ord:s.ord }; });
    if(Object.keys(cfg).length===0) {
      cfg["Planned"]          = { color:"#6b7280", bg_color:"rgba(107,114,128,.12)", border:"#1f2937", is_final:false };
      cfg["Staging"]          = { color:"#f59e0b", bg_color:"rgba(245,158,11,.12)",  border:"#78350f", is_final:false };
      cfg["Merged to master"] = { color:"#a78bfa", bg_color:"rgba(167,139,250,.12)", border:"#4c1d95", is_final:false };
      cfg["Deployed"]         = { color:"#34d399", bg_color:"rgba(52,211,153,.12)",  border:"#064e3b", is_final:true  };
      cfg["Rollback"]         = { color:"#f87171", bg_color:"rgba(248,113,113,.12)", border:"#7f1d1d", is_final:true  };
    }
    setStatusCfg(cfg);
    setLoading(false);
    // Auto-cargar tickets de Jira usando la conexión ya existente
    fetchJiraTickets(ssoData?.deploy_jira_statuses);
  }

  async function fetchJiraTickets(rawStatuses) {
    setFetchingJira(true);
    try {
      // Si no hay args (refresh manual), leer de DB
      if(rawStatuses === undefined) {
        const { data:sso } = await supabase.from("sso_config").select("deploy_jira_statuses").limit(1).single();
        rawStatuses = sso?.deploy_jira_statuses;
      }
      const targetStatuses = (rawStatuses || "Ready to Production")
        .split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);

      const headers = await authHeaders();

      // Paso 1: obtener proyectos (mismo endpoint que JiraTracker)
      const projRes = await fetch(`${API_BASE}/jira/projects`, { headers });
      if(!projRes.ok) throw new Error(`No se pudieron cargar proyectos: HTTP ${projRes.status}`);
      const projData = await projRes.json();
      const projects = (projData.data || []).map(p => p.key || p.id).filter(Boolean);

      if(projects.length === 0) throw new Error("No hay proyectos Jira configurados");

      // Paso 2: cargar issues de cada proyecto (mismo endpoint que JiraTracker)
      const allIssues = [];
      await Promise.all(projects.map(async (project) => {
        try {
          const res = await fetch(`${API_BASE}/jira/issues?project=${project}`, { headers });
          if(!res.ok) return;
          const data = await res.json();
          allIssues.push(...(data.data || []));
        } catch { /* proyecto sin acceso, ignorar */ }
      }));

      // Paso 3: filtrar por los estados configurados en Admin → Deploy Planner
      const filtered = allIssues.filter(i => {
        const issueStatus = (i.status || i.fields?.status?.name || "").toLowerCase();
        return targetStatuses.some(s => issueStatus.includes(s) || s.includes(issueStatus));
      });

      const newTickets = filtered.map(i => {
        // Soporte tanto para respuesta directa como para fields wrapper
        const fields    = i.fields || i;
        const components = (fields.components||[]).map(c=>c.name||c).filter(Boolean);
        const cf10014   = (fields.customfield_10014||"").split(",").map(s=>s.trim()).filter(Boolean);
        const labels    = (fields.labels||[]).filter(Boolean);
        const repos     = components.length ? components : cf10014.length ? cf10014 : labels;
        return {
          key:      i.key || i.id,
          summary:  fields.summary || i.summary || "",
          assignee: fields.assignee?.displayName || i.assignee || "—",
          priority: fields.priority?.name || i.priority || "Medium",
          type:     fields.issuetype?.name || i.type || "Task",
          status:   fields.status?.name || i.status || "",
          repos,
        };
      });

      setTickets(newTickets);

      if(newTickets.length === 0) {
        console.warn(`Jira: ${allIssues.length} issues cargados de ${projects.length} proyectos, ninguno coincide con estados: "${rawStatuses}"`);
      }
    } catch(e) {
      console.warn("Jira fetch error:", e.message);
    }
    setFetchingJira(false);
  }

  const upd = async (id, patch) => {
    setReleases(rs=>rs.map(r=>r.id===id?{...r,...patch}:r));
    await supabase.from("dp_releases").update(patch).eq("id",id);
  };

  const addRelease = async () => {
    const last=releases[releases.length-1];
    const firstStatus=Object.keys(statusCfg)[0]||"Planned";
    const newRel={ release_number:"", description:"", status:firstStatus, start_date:last?addD(last.end_date||fmt(today),2):fmt(today), end_date:last?addD(last.end_date||fmt(today),7):addD(fmt(today),5), ticket_ids:[], ticket_statuses:{}, created_by:currentUser.id };
    const { data } = await supabase.from("dp_releases").insert(newRel).select().single();
    if(data) setReleases(rs=>[...rs,data]);
  };

  const delRelease = async (id) => {
    if(!confirm("¿Eliminar esta release?")) return;
    setReleases(rs=>rs.filter(r=>r.id!==id));
    await supabase.from("dp_releases").delete().eq("id",id);
  };

  const handleDrop = (targetId) => {
    if(!drag||drag.fromId===targetId) return;
    const fromRel = releases.find(r=>r.id===drag.fromId);
    if(!fromRel) return;
    upd(drag.fromId,{ticket_ids:(fromRel.ticket_ids||[]).filter(x=>x!==drag.key)});
    const toRel = releases.find(r=>r.id===targetId);
    if(toRel&&!(toRel.ticket_ids||[]).includes(drag.key))
      upd(targetId,{ticket_ids:[...(toRel.ticket_ids||[]),drag.key]});
    setDrag(null);
  };

  const [filterStatus, setFilterStatus] = useState([]);
  const activeF = filterStatus.length===0;
  const visible  = releases.filter(r=>activeF||filterStatus.includes(r.status));
  const hidden   = releases.filter(r=>!activeF&&!filterStatus.includes(r.status)).length;

  const TABS=[
    {id:"planning", label:"Planning", badge:releases.filter(r=>!statusCfg[r.status]?.is_final).length||undefined},
    {id:"timeline", label:"Timeline"},
    {id:"history",  label:"History",  badge:releases.filter(r=>statusCfg[r.status]?.is_final).length||undefined},
    {id:"metrics",  label:"Metrics"},
  ];

  const detailRel = detail ? releases.find(r=>r.id===detail) : null;

  return (
    <div className={`dp${isLight?" light":""}`}>
      <style>{CSS}</style>

      {/* Nav */}
      <nav style={{borderBottom:"1px solid var(--dp-bd,#0e1520)",padding:"0 28px",display:"flex",alignItems:"center",height:52,background:"var(--dp-sf,#07090f)",gap:2,position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginRight:24}}>
          {detail&&<button onClick={()=>setDetail(null)} style={{background:"none",border:"none",color:"var(--dp-tx3,#64748b)",cursor:"pointer",fontSize:18,marginRight:4,lineHeight:1}}>←</button>}
          <div style={{width:26,height:26,background:"linear-gradient(135deg,#1d4ed8,#0ea5e9)",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🚀</div>
          <span style={{fontWeight:700,fontSize:13,color:"var(--dp-tx,#e6edf3)",letterSpacing:".04em"}}>Deploy Planner</span>
          {detailRel&&<><span style={{color:"var(--dp-tx3,#334155)",fontSize:11}}>→</span><span style={{fontSize:12,color:"#38bdf8",fontWeight:600}}>{detailRel.release_number}</span></>}
        </div>
        {!detail&&TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{height:52,padding:"0 14px",border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:500,letterSpacing:".08em",textTransform:"uppercase",color:tab===t.id?"#38bdf8":"var(--dp-tx3,#64748b)",borderBottom:tab===t.id?"2px solid #38bdf8":"2px solid transparent",transition:"color .15s",display:"flex",alignItems:"center",gap:6}}>
            {t.label}
            {t.badge>0&&<span style={{background:tab===t.id?"#0a1f38":"rgba(56,189,248,.08)",color:tab===t.id?"#38bdf8":"var(--dp-tx3,#475569)",fontSize:9,padding:"1px 6px",borderRadius:10}}>{t.badge}</span>}
          </button>
        ))}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:10,color:"var(--dp-tx3,#334155)"}}>
            {fetchingJira ? <><span className="spin" style={{marginRight:4}}>⟳</span>Sincronizando Jira…</> : `${tickets.length} tickets de Jira`}
          </span>
          <button onClick={()=>fetchJiraTickets()} disabled={fetchingJira} title="Recargar tickets de Jira"
            style={{background:"transparent",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:5,width:28,height:28,color:"var(--dp-tx2,#64748b)",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            ↻
          </button>
        </div>
      </nav>

      {/* Content */}
      <div style={{padding:28}}>
        {loading ? (
          <div style={{textAlign:"center",padding:60,color:"var(--dp-tx3,#334155)",fontSize:13}}>Cargando…</div>
        ) : detailRel ? (
          <ReleaseDetail
            rel={detailRel}
            tickets={tickets}
            statusCfg={statusCfg}
            repoGroups={repoGroups}
            allReleases={releases}
            isLight={isLight}
            onBack={()=>setDetail(null)}
            onUpdRelease={patch=>upd(detail,patch)}
          />
        ) : (
          <>
            {tab==="planning"&&(
              <div>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:20,flexWrap:"wrap"}}>
                  <h2 style={{fontSize:14,color:"var(--dp-tx,#e6edf3)",fontWeight:700,marginRight:8}}>Planificación</h2>
                  <span style={{fontSize:10,color:"var(--dp-tx3,#334155)",marginRight:8}}>{releases.length} releases · {tickets.length} tickets</span>
                  {Object.entries(statusCfg).map(([name,cfg])=>{
                    const on=filterStatus.includes(name);
                    return <button key={name} onClick={()=>setFilterStatus(f=>f.includes(name)?f.filter(x=>x!==name):[...f,name])}
                      style={{fontSize:10,padding:"3px 10px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",fontWeight:600,background:on?cfg.bg_color:"transparent",color:on?cfg.color:"var(--dp-tx3,#334155)",border:`1px solid ${on?cfg.border:"var(--dp-bd,#1e293b)"}`,transition:"all .12s"}}>{name}</button>;
                  })}
                </div>
                {hidden>0&&<div style={{fontSize:10,color:"var(--dp-tx3,#334155)",marginBottom:14}}>↓ {hidden} release{hidden>1?"s":""} oculta{hidden>1?"s":""} por filtros — actívalas arriba o ve a History.</div>}
                <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"flex-start"}}>
                  {visible.map(rel=>(
                    <ReleaseCard key={rel.id} rel={rel} statusCfg={statusCfg} tickets={tickets}
                      onOpen={setDetail} onUpd={upd} onDelete={delRelease}
                      onDrop={handleDrop} setDrag={setDrag} drag={drag}
                      allReleases={releases} repoGroups={repoGroups}/>
                  ))}
                  <div onClick={addRelease}
                    style={{width:290,minHeight:140,background:"transparent",border:"2px dashed var(--dp-bd,#1e293b)",borderRadius:8,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",color:"var(--dp-tx3,#334155)",fontSize:12,transition:"border-color .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#38bdf8"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="var(--dp-bd,#1e293b)"}>
                    <span style={{fontSize:24}}>+</span>
                    <span style={{fontSize:10}}>Nueva release</span>
                  </div>
                </div>
              </div>
            )}
            {tab==="timeline"&&<Timeline releases={releases} tickets={tickets} upd={upd} setDetail={setDetail} statusCfg={statusCfg}/>}
            {tab==="history" &&<History  releases={releases} tickets={tickets} setDetail={setDetail} statusCfg={statusCfg}/>}
            {tab==="metrics" &&<Metrics  releases={releases} tickets={tickets} statusCfg={statusCfg}/>}
          </>
        )}
      </div>
    </div>
  );
}
