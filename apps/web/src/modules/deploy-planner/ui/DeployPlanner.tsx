// @ts-nocheck
// Deploy Planner — v3 — Integrado con Supabase + Jira sync + Timeline zoom + Light mode
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../shared/lib/supabaseClient";
import { GanttTimeline } from '@worksuite/ui';
import { RepoGroupService } from '../domain/services/RepoGroupService';
import { SubtaskService } from '../domain/services/SubtaskService';
import { JiraSubtaskAdapter } from '../infra/JiraSubtaskAdapter';
import { SupabaseSubtaskConfigRepo } from '../infra/supabase/SupabaseSubtaskConfigRepo';

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
  --dp-tx:#c9d1d9; --dp-tx2:#94a3b8; --dp-tx3:#64748b;
  --dp-bd:#1e293b; --dp-date-filter:invert(.4) sepia(1) hue-rotate(180deg);
}
/* Light mode — activated by data-theme="light" or .light class */
[data-theme="light"] .dp, .light .dp, .dp.light{
  --dp-bg:#f1f5f9; --dp-sf:#ffffff; --dp-sf2:#f8fafc;
  --dp-tx:#0f172a; --dp-tx2:#475569; --dp-tx3:#64748b;
  --dp-bd:#e2e8f0; --dp-date-filter:none;
}
[data-theme="light"] .dp ::-webkit-scrollbar-thumb, .light .dp ::-webkit-scrollbar-thumb, .dp.light ::-webkit-scrollbar-thumb{background:#cbd5e1;}
[data-theme="light"] .dp select option, .light .dp select option, .dp.light select option{background:#ffffff;}
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

const subtaskAdapter = new JiraSubtaskAdapter(API_BASE, authHeaders);
const subtaskConfigRepo = new SupabaseSubtaskConfigRepo(supabase);

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

/* ─── VERSION PICKER — Semver bump desde el último número real ────────────── */
// Parsea el último release_number de las releases existentes y genera el siguiente
// aplicando el bump seleccionado (major / minor / patch o los que el admin configure).
// Admin configura: prefix, separator, segmentNames[], y los valores INICIALES
// (usados solo cuando no hay ninguna release todavía).
function VersionPicker({ versionCfg, allReleaseNumbers, onSelect, onClose }) {
  const cfg = versionCfg || { prefix:"v", segments:[{name:"major",value:1},{name:"minor",value:0},{name:"patch",value:0}], separator:"." };
  const sep = cfg.separator || ".";
  const pre = cfg.prefix || "v";
  const segs = cfg.segments || [{name:"major",value:1},{name:"minor",value:0},{name:"patch",value:0}];

  // Parse a version string into an array of numbers
  const parseVer = (str) => {
    if(!str) return null;
    const clean = str.startsWith(pre) ? str.slice(pre.length) : str;
    const parts = clean.split(sep).map(n=>parseInt(n,10));
    return parts.every(n=>!isNaN(n)) && parts.length === segs.length ? parts : null;
  };

  // Find the highest version across all existing releases
  const baseline = segs.map(s=>s.value||0); // initial values from admin config
  const current = (allReleaseNumbers||[]).reduce((max, numStr) => {
    const parts = parseVer(numStr);
    if(!parts) return max;
    for(let i=0;i<parts.length;i++){
      if(parts[i]>max[i]) return parts;
      if(parts[i]<max[i]) return max;
    }
    return max;
  }, baseline);

  const currentStr = pre + current.join(sep);

  // Which segment to bump (default: last = patch)
  const [bumpIdx, setBumpIdx] = useState(segs.length - 1);

  // Compute the preview by bumping selected segment and resetting lower ones
  const preview = current.map((val, i) => {
    if(i === bumpIdx) return val + 1;
    if(i > bumpIdx) return 0;
    return val;
  });
  const previewStr = pre + preview.join(sep);

  return (
    <div onClick={e=>e.stopPropagation()}
      style={{position:"absolute",top:"100%",left:0,zIndex:50,background:"var(--dp-sf,#0b0f18)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:8,padding:"14px 16px",width:264,marginTop:4,boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
      <div style={{fontSize:10,fontWeight:700,color:"var(--dp-tx3,#475569)",letterSpacing:".08em",textTransform:"uppercase",marginBottom:10}}>Generador de versión</div>

      {/* Current → next */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"8px 10px",background:"var(--dp-sf2,#07090f)",borderRadius:6,border:"1px solid var(--dp-bd,#1e293b)"}}>
        <span style={{fontSize:12,color:"var(--dp-tx3,#475569)",fontFamily:"monospace"}}>{currentStr}</span>
        <span style={{color:"var(--dp-tx3,#334155)"}}>→</span>
        <span style={{fontSize:14,fontWeight:700,color:"#38bdf8",fontFamily:"monospace"}}>{previewStr}</span>
      </div>

      {/* Segment selectors */}
      <div style={{display:"flex",gap:5,marginBottom:12}}>
        {segs.map((seg,i)=>(
          <button key={seg.name} onClick={()=>setBumpIdx(i)}
            style={{flex:1,padding:"7px 0",borderRadius:5,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
              border:`1px solid ${bumpIdx===i?"#38bdf8":"var(--dp-bd,#1e293b)"}`,
              background:bumpIdx===i?"rgba(56,189,248,.15)":"transparent",
              color:bumpIdx===i?"#38bdf8":"var(--dp-tx3,#64748b)",transition:"all .12s"}}>
            {seg.name}<br/>
            <span style={{fontSize:8,fontWeight:400,opacity:.75}}>
              {bumpIdx===i
                ? `${current[i]} → ${current[i]+1}`
                : i>bumpIdx ? "→ 0" : `${current[i]}`}
            </span>
          </button>
        ))}
      </div>

      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>onSelect(previewStr)}
          style={{flex:1,background:"linear-gradient(135deg,#1d4ed8,#0ea5e9)",border:"none",borderRadius:5,padding:"7px",fontSize:11,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>
          Usar {previewStr}
        </button>
        <button onClick={onClose}
          style={{background:"transparent",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:5,padding:"7px 10px",fontSize:11,color:"var(--dp-tx3,#64748b)",cursor:"pointer",fontFamily:"inherit"}}>
          ✕
        </button>
      </div>
    </div>
  );
}

function ReleaseCard({ rel, statusCfg, tickets, onOpen, onUpd, onDelete, onDrop, setDrag, drag, allReleases, repoGroups, versionCfg, allReleaseNumbers, jiraBaseUrl="", linkedGroups=[], classifiedSubs=[] }) {
  const [addingTicket, setAddingTicket] = useState(false);
  const [search, setSearch] = useState("");
  const [showVersionPicker, setShowVersionPicker] = useState(false);
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
      {/* Release number: click title opens detail, edit via input */}
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
        <span
          onClick={()=>onOpen(rel.id)}
          style={{flex:1,fontSize:15,fontWeight:700,color:"var(--dp-tx,#e6edf3)",cursor:"pointer",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
        >
          {rel.release_number||<span style={{color:"var(--dp-tx3,#334155)"}}>sin versión</span>}
        </span>
        <button onClick={e=>{e.stopPropagation();onOpen(rel.id);}} title="Abrir detalle" style={{background:"none",border:"none",color:"var(--dp-tx3,#475569)",cursor:"pointer",fontSize:13,lineHeight:1,padding:"2px 4px"}}>↗</button>
        <button onClick={e=>{e.stopPropagation();onDelete(rel.id);}} style={{background:"none",border:"none",color:"var(--dp-tx3,#475569)",cursor:"pointer",fontSize:16,lineHeight:1,padding:"2px 4px"}}>×</button>
      </div>

      {/* Version number input + generator */}
      <div style={{position:"relative",marginBottom:6}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",gap:4}}>
          <input
            value={rel.release_number||""}
            onChange={e=>onUpd(rel.id,{release_number:e.target.value})}
            placeholder="v1.0.0"
            style={{flex:1,background:"var(--dp-sf2,#07090f)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:"4px 0 0 4px",padding:"4px 8px",fontSize:11,color:"var(--dp-tx,#e6edf3)",fontFamily:"monospace",outline:"none"}}
          />
          <button
            onClick={e=>{e.stopPropagation();setShowVersionPicker(v=>!v);}}
            title="Generar número de versión"
            style={{background:"var(--dp-sf2,#07090f)",border:"1px solid var(--dp-bd,#1e293b)",borderLeft:"none",borderRadius:"0 4px 4px 0",padding:"0 8px",fontSize:12,color:"var(--dp-tx3,#64748b)",cursor:"pointer",lineHeight:1}}>
            ⚙
          </button>
        </div>
        {showVersionPicker && versionCfg && (
          <VersionPicker
            versionCfg={versionCfg}
            allReleaseNumbers={allReleaseNumbers||[]}
            onSelect={v=>{onUpd(rel.id,{release_number:v});setShowVersionPicker(false);}}
            onClose={()=>setShowVersionPicker(false)}
          />
        )}
      </div>

      {/* Description — textarea with wrapping */}
      <textarea
        value={rel.description||""}
        onChange={e=>onUpd(rel.id,{description:e.target.value})}
        onClick={e=>e.stopPropagation()}
        placeholder="Descripción de la release…"
        rows={rel.description&&rel.description.length>40?3:2}
        style={{width:"100%",background:"none",border:"none",borderBottom:"1px solid var(--dp-bd,#0e1520)",fontSize:10,color:"var(--dp-tx2,#475569)",fontFamily:"inherit",outline:"none",marginBottom:12,paddingBottom:6,resize:"none",lineHeight:1.5}}
      />

      {/* Status selector with is_final blocking */}
      <div style={{marginBottom:10}}>
        <select value={rel.status||"Planned"}
          onChange={e=>{
            const newStatus = e.target.value;
            const isDone = statusCfg[newStatus]?.status_category === 'done';
            if(isDone && linkedGroups.length) {
              const check = RepoGroupService.canTransitionToDone(
                rel.id, linkedGroups,
                allReleases.map(r=>({id:r.id,ticketIds:r.ticket_ids||[],status:r.status||"Planned",statusCategory:statusCfg[r.status||"Planned"]?.status_category||"backlog"})),
              );
              if(!check.allowed) {
                alert(`🔒 No puedes pasar a "${newStatus}" porque hay releases vinculadas pendientes:\n${check.blockers.map(b=>`• ${b.groupName}: release en "${b.status}"`).join("\n")}`);
                return;
              }
            }
            onUpd(rel.id,{status:newStatus});
          }}
          onClick={e=>e.stopPropagation()}
          style={{background:cfg.bg_color,border:`1px solid ${cfg.border}`,borderRadius:5,padding:"4px 10px",fontSize:10,color:cfg.color,cursor:"pointer",outline:"none",fontWeight:700,fontFamily:"inherit"}}>
          {Object.entries(statusCfg).map(([name,v])=>{
            const isDoneCat = v.status_category === 'done';
            const blocked = isDoneCat && linkedGroups.length>0 && !RepoGroupService.canTransitionToDone(
              rel.id, linkedGroups,
              allReleases.map(r=>({id:r.id,ticketIds:r.ticket_ids||[],status:r.status||"Planned",statusCategory:statusCfg[r.status||"Planned"]?.status_category||"backlog"})),
            ).allowed;
            return <option key={name} value={name} disabled={blocked}>{blocked?"🔒 ":""}{name}</option>;
          })}
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
              <span style={{color:noRepo?"#ef4444":"var(--dp-tx2,#94a3b8)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.summary.slice(0,28)}{t.summary.length>28?"…":""}</span>
              <span style={{color:"var(--dp-tx3,#334155)",flexShrink:0,fontSize:9}}>{t.assignee?.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2)||"—"}</span>
              {jiraBaseUrl&&<a href={`${jiraBaseUrl}/browse/${t.key}`} target="_blank" rel="noopener noreferrer"
                onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}
                style={{color:"var(--dp-tx3,#475569)",fontSize:10,flexShrink:0,textDecoration:"none",lineHeight:1,padding:"0 2px"}}
                title={`Open ${t.key} in Jira`}>↗</a>}
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

      {/* Bug/Test counters */}
      {(() => {
        const relSubs = classifiedSubs.filter(s => (rel.ticket_ids||[]).includes(s.parentKey));
        const counts = SubtaskService.count(relSubs);
        if (counts.bugs.total === 0 && counts.tests.total === 0) return null;
        return (
          <div style={{display:"flex",gap:8,fontSize:10,paddingTop:6,borderTop:"1px solid var(--dp-bd,#0e1520)",marginBottom:4}}>
            {counts.bugs.total > 0 && (
              <span style={{color:counts.bugs.open>0?"#ef4444":"#22c55e",fontWeight:600}}>
                🐛 {counts.bugs.closed}/{counts.bugs.total}
              </span>
            )}
            {counts.tests.total > 0 && (
              <span style={{color:counts.tests.open>0?"#3b82f6":"#22c55e",fontWeight:600}}>
                🧪 {counts.tests.closed}/{counts.tests.total}
              </span>
            )}
          </div>
        );
      })()}

      {/* Repo chips */}
      {relRepos.length>0&&(
        <div style={{display:"flex",gap:4,flexWrap:"wrap",paddingTop:relRepos.length?4:6,borderTop:relRepos.length?"none":"1px solid var(--dp-bd,#0e1520)"}}>
          {relRepos.map(r=><RepoChip key={r} name={r}/>)}
        </div>
      )}
    </div>
  );
}

/* ─── RELEASE DETAIL — repo cards ────────────────────────────── */
function ReleaseDetail({ rel, tickets, statusCfg, repoGroups, allReleases, onBack, onUpdRelease, isLight, classifiedSubs=[], jiraBaseUrl="", onRefreshSubtasks }) {
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

      {/* Release status info */}
      <div style={{background:"var(--dp-sf,#0b0f18)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:8,padding:"18px 20px"}}>
        <SLabel style={{marginBottom:12}}>Estado de la Release</SLabel>

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

        <div style={{marginTop:8,fontSize:9,color:"var(--dp-tx3,#64748b)"}}>
          Estados configurables desde Admin → Deploy Config
        </div>
      </div>

      {/* ── Subtask table ──────────────────────────────────────── */}
      {(() => {
        const relSubs = classifiedSubs.filter(s => (rel.ticket_ids||[]).includes(s.parentKey));
        if (!relSubs.length) return null;
        const counts = SubtaskService.count(relSubs);
        const [groupBy, setGroupBy] = [null, null]; // will use state from parent
        return (
          <div style={{background:"var(--dp-sf,#0b0f18)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:8,padding:"18px 20px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <SLabel>Subtareas</SLabel>
              <span style={{fontSize:10,color:"var(--dp-tx2,#94a3b8)"}}>{relSubs.length} total</span>
              {counts.bugs.total>0&&<span style={{fontSize:10,color:counts.bugs.open>0?"#ef4444":"#22c55e",fontWeight:600}}>🐛 {counts.bugs.closed}/{counts.bugs.total}</span>}
              {counts.tests.total>0&&<span style={{fontSize:10,color:counts.tests.open>0?"#3b82f6":"#22c55e",fontWeight:600}}>🧪 {counts.tests.closed}/{counts.tests.total}</span>}
              {onRefreshSubtasks&&<button onClick={onRefreshSubtasks}
                style={{marginLeft:"auto",background:"var(--dp-sf2,#07090f)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:4,padding:"3px 10px",fontSize:9,color:"var(--dp-tx2,#94a3b8)",cursor:"pointer",fontFamily:"inherit"}}>
                🔄 Actualizar
              </button>}
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
              <thead><tr style={{borderBottom:"1px solid var(--dp-bd,#0e1520)"}}>
                {["CLAVE","TIPO","RESUMEN","ESTADO","ASIGNADO","PADRE"].map(h=>(
                  <th key={h} style={{padding:"7px 10px",textAlign:"left",color:"var(--dp-tx3,#64748b)",fontWeight:600,letterSpacing:".06em",fontSize:9}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {relSubs.sort((a,b)=>a.category.localeCompare(b.category)||a.type.localeCompare(b.type)).map(st=>(
                  <tr key={st.key} style={{borderBottom:"1px solid var(--dp-bd,#0d111a)"}}>
                    <td style={{padding:"8px 10px"}}>{jiraBaseUrl
                      ? <a href={`${jiraBaseUrl}/browse/${st.key}`} target="_blank" rel="noopener noreferrer" style={{color:"#38bdf8",fontWeight:700,textDecoration:"none"}}>{st.key}</a>
                      : <span style={{color:"#38bdf8",fontWeight:700}}>{st.key}</span>
                    }</td>
                    <td style={{padding:"8px 10px"}}>
                      <span style={{padding:"2px 7px",borderRadius:10,fontSize:9,fontWeight:600,
                        background:st.category==='bug'?'rgba(239,68,68,.12)':st.category==='test'?'rgba(59,130,246,.12)':'rgba(100,116,139,.12)',
                        color:st.category==='bug'?'#ef4444':st.category==='test'?'#3b82f6':'var(--dp-tx3,#64748b)'}}>
                        {st.category==='bug'?'🐛':'🧪'} {st.type}{st.testType?` (${st.testType})`:''}
                      </span>
                    </td>
                    <td style={{padding:"8px 10px",color:"var(--dp-tx,#e6edf3)",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{st.summary}</td>
                    <td style={{padding:"8px 10px"}}>
                      <span style={{padding:"2px 7px",borderRadius:10,fontSize:9,fontWeight:600,
                        background:st.isClosed?'rgba(34,197,94,.12)':'rgba(245,158,11,.12)',
                        color:st.isClosed?'#22c55e':'#f59e0b'}}>
                        {st.isClosed?'✓':'○'} {st.status}
                      </span>
                    </td>
                    <td style={{padding:"8px 10px",color:"var(--dp-tx2,#94a3b8)"}}>{st.assignee||'—'}</td>
                    <td style={{padding:"8px 10px"}}><span style={{color:"var(--dp-tx3,#64748b)",fontFamily:"monospace"}}>{st.parentKey}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}

/* ─── TIMELINE (uses GanttTimeline from @worksuite/ui) ──────── */
function Timeline({ releases, tickets, upd, setDetail, statusCfg, repoGroups=[] }) {
  const [filterStatus, setFilterStatus] = useState([]);
  const tMap = Object.fromEntries(tickets.map(t=>[t.key,t]));
  const activeF = filterStatus.length===0;
  const filteredRels = releases.filter(r=>activeF||filterStatus.includes(r.status));

  // Map releases to GanttBar format
  const bars = filteredRels.filter(r=>r.start_date&&r.end_date).map(rel => {
    const cfg = statusCfg[rel.status] || { color:"#6b7280", bg_color:"rgba(107,114,128,.12)" };
    const relTickets = (rel.ticket_ids||[]).map(k=>tMap[k]).filter(Boolean);
    const dur = diffD(rel.start_date, rel.end_date);
    return {
      id: rel.id,
      label: rel.release_number || "—",
      startDate: rel.start_date,
      endDate: rel.end_date,
      color: cfg.color,
      bgColor: cfg.bg_color || "rgba(107,114,128,.12)",
      status: rel.status || "Planned",
      meta: `${dur}d · ${rel.ticket_ids?.length||0} tickets`,
    };
  });

  // Map repoGroups to GanttGroup format
  const groups = (repoGroups||[]).map(g => {
    // Find releases that have tickets touching repos in this group
    const relIds = releases.filter(rel => {
      const relTickets = (rel.ticket_ids||[]).map(k=>tMap[k]).filter(Boolean);
      const relRepos = [...new Set(relTickets.flatMap(t=>t.repos||[]))];
      return relRepos.some(r => (g.repos||[]).includes(r));
    }).map(r=>r.id);
    const allDoneOrApproved = relIds.every(id => {
      const rel = releases.find(r=>r.id===id);
      const cat = statusCfg[rel?.status]?.status_category;
      return cat === 'done' || cat === 'approved';
    });
    return {
      id: g.id,
      label: g.name,
      color: allDoneOrApproved ? "#22c55e" : "#f59e0b",
      barIds: relIds,
    };
  }).filter(g => g.barIds.length >= 2);

  const handleBarMove = (id, startDate, endDate) => {
    upd(id, { start_date: startDate, end_date: endDate });
  };

  // Legend
  const legend = Object.entries(statusCfg).map(([name, cfg]) => ({ name, color: cfg.color }));

  return (
    <div>
      {/* Status filter */}
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
        {Object.entries(statusCfg).map(([name,cfg])=>{
          const on=filterStatus.includes(name);
          return <button key={name} onClick={()=>setFilterStatus(f=>f.includes(name)?f.filter(x=>x!==name):[...f,name])}
            style={{fontSize:10,padding:"3px 10px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",fontWeight:600,background:on?cfg.bg_color:"transparent",color:on?cfg.color:"var(--dp-tx3,#64748b)",border:`1px solid ${on?cfg.border:"var(--dp-bd,#1e293b)"}`,transition:"all .12s"}}>{name}</button>;
        })}
      </div>
      <GanttTimeline
        bars={bars}
        groups={groups}
        onBarMove={handleBarMove}
        onBarClick={(id) => setDetail(id)}
      />
      {/* Legend */}
      <div style={{marginTop:12,display:"flex",gap:12,flexWrap:"wrap"}}>
        {legend.map(l=>(
          <div key={l.name} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"var(--dp-tx3,var(--tx3,#64748b))"}}>
            <div style={{width:10,height:10,borderRadius:2,background:l.color}}/>{l.name}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── HISTORY ────────────────────────────────────────────────── */
function History({ releases, tickets, setDetail, statusCfg, classifiedSubs=[] }) {
  const [sortBy, setSortBy] = useState("end_date");
  const [filterStatus, setFilterStatus] = useState([]);
  const tMap = Object.fromEntries(tickets.map(t=>[t.key,t]));
  const activeF = filterStatus.length === 0;
  const sorted = [...releases]
    .filter(r => activeF || filterStatus.includes(r.status))
    .sort((a,b)=>{
      if(sortBy==="end_date")   return (b.end_date||"")>(a.end_date||"")?1:-1;
      if(sortBy==="start_date") return (b.start_date||"")>(a.start_date||"")?1:-1;
      if(sortBy==="bugs") {
        const aBugs = SubtaskService.count(classifiedSubs.filter(s=>(a.ticket_ids||[]).includes(s.parentKey))).bugs.open;
        const bBugs = SubtaskService.count(classifiedSubs.filter(s=>(b.ticket_ids||[]).includes(s.parentKey))).bugs.open;
        return bBugs - aBugs;
      }
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
            <option value="bugs">Bugs abiertos</option>
          </select>
        </div>
      </div>
      {/* Status filter */}
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
        {Object.entries(statusCfg).map(([name,cfg])=>{
          const on=filterStatus.includes(name);
          return <button key={name} onClick={()=>setFilterStatus(f=>f.includes(name)?f.filter(x=>x!==name):[...f,name])}
            style={{fontSize:9,padding:"2px 8px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",fontWeight:600,background:on?cfg.bg_color:"transparent",color:on?cfg.color:"var(--dp-tx3,#64748b)",border:`1px solid ${on?cfg.border:"var(--dp-bd,#1e293b)"}`,transition:"all .12s"}}>{name}</button>;
        })}
      </div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
        <thead><tr style={{borderBottom:"1px solid var(--dp-bd,#0e1520)"}}>
          {["RELEASE","ESTADO","INICIO","FIN","DURACIÓN","TICKETS","BUGS","REPOS"].map(h=>(
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
                <td style={{padding:"11px 12px"}}>{(()=>{
                  const relSubs=classifiedSubs.filter(s=>(rel.ticket_ids||[]).includes(s.parentKey));
                  const c=SubtaskService.count(relSubs);
                  return c.bugs.total>0?<span style={{color:c.bugs.open>0?"#ef4444":"#22c55e",fontWeight:600}}>🐛 {c.bugs.closed}/{c.bugs.total}</span>:<span style={{color:"var(--dp-tx3,#64748b)"}}>—</span>;
                })()}</td>
                <td style={{padding:"11px 12px"}}><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{relRepos.slice(0,3).map(r=><RepoChip key={r} name={r}/>)}{relRepos.length>3&&<span style={{fontSize:9,color:"var(--dp-tx3,#64748b)"}}>+{relRepos.length-3}</span>}</div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── METRICS ────────────────────────────────────────────────── */
function Metrics({ releases, tickets, statusCfg, classifiedSubs=[] }) {
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

  const totalCounts = SubtaskService.count(classifiedSubs);
  const bugRate = totalCounts.bugs.total > 0 ? Math.round(totalCounts.bugs.closed / totalCounts.bugs.total * 100) : 0;
  const testRate = totalCounts.tests.total > 0 ? Math.round(totalCounts.tests.closed / totalCounts.tests.total * 100) : 0;

  const stats=[
    {l:"TOTAL RELEASES",  v:releases.length,    s:`${deployed.length} deployed · ${rollbacks.length} rollbacks`,c:"var(--dp-tx,#e6edf3)"},
    {l:"DURACIÓN MEDIA",  v:`${avgDur}d`,        s:"inicio → fin",                                               c:"var(--dp-tx,#e6edf3)"},
    {l:"TASA DE ÉXITO",   v:`${successRate}%`,   s:`${deployed.length}/${finished.length} finalizadas`,          c:"#34d399"},
    {l:"TICKETS/RELEASE", v:tpr,                 s:"media",                                                      c:"#38bdf8"},
    {l:"REPOS ÚNICOS",    v:allRepos.length,      s:"repositorios",                                              c:"#a78bfa"},
    {l:"BUGS",            v:`${totalCounts.bugs.closed}/${totalCounts.bugs.total}`, s:`${bugRate}% resueltos`, c:"#ef4444"},
    {l:"TESTS",           v:`${totalCounts.tests.closed}/${totalCounts.tests.total}`, s:`${testRate}% completados`, c:"#3b82f6"},
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
  const [repoGroups, setRepoGroups]   = useState([]);
  const [versionCfg, setVersionCfg]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [fetchingJira, setFetchingJira] = useState(false);
  const [drag, setDrag]           = useState(null);
  const [jiraBaseUrl, setJiraBaseUrl] = useState("");
  const [subtaskConfigs, setSubtaskConfigs] = useState([]);
  const [allSubtasks, setAllSubtasks]       = useState([]);
  const [classifiedSubs, setClassifiedSubs] = useState([]);

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
    const [{ data:rels }, { data:statuses }, { data:ssoData }, { data:groups }, { data:verCfg }] = await Promise.all([
      supabase.from("dp_releases").select("*").order("start_date",{ascending:true}),
      supabase.from("dp_release_statuses").select("*").order("ord",{ascending:true}),
      supabase.from("sso_config").select("deploy_jira_statuses").limit(1).single(),
      supabase.from("dp_repo_groups").select("*").order("name"),
      supabase.from("dp_version_config").select("*").limit(1).single(),
    ]);
    setRepoGroups(groups||[]);
    setVersionCfg(verCfg || { prefix:"v", segments:[{name:"major",value:1},{name:"minor",value:0},{name:"patch",value:0}], separator:"." });
    setReleases(rels||[]);
    const cfg = {};
    (statuses||[]).forEach(s=>{ cfg[s.name]={ color:s.color, bg_color:s.bg_color, border:s.border, is_final:s.is_final, status_category:s.status_category||'backlog', ord:s.ord }; });
    if(Object.keys(cfg).length===0) {
      cfg["Planned"]          = { color:"#6b7280", bg_color:"rgba(107,114,128,.12)", border:"#1f2937", is_final:false, status_category:"backlog" };
      cfg["Staging"]          = { color:"#f59e0b", bg_color:"rgba(245,158,11,.12)",  border:"#78350f", is_final:false, status_category:"in_progress" };
      cfg["Merged to master"] = { color:"#a78bfa", bg_color:"rgba(167,139,250,.12)", border:"#4c1d95", is_final:false, status_category:"done" };
      cfg["Deployed"]         = { color:"#34d399", bg_color:"rgba(52,211,153,.12)",  border:"#064e3b", is_final:true, status_category:"approved"  };
      cfg["Rollback"]         = { color:"#f87171", bg_color:"rgba(248,113,113,.12)", border:"#7f1d1d", is_final:true, status_category:"done"  };
    }
    setStatusCfg(cfg);
    setLoading(false);
    // Load Jira base URL for ticket links
    try {
      const connRes = await fetch(`${API_BASE}/jira/connection`, { headers: await authHeaders() });
      const connData = await connRes.json();
      if(connData.ok && connData.data?.base_url) setJiraBaseUrl(connData.data.base_url.replace(/\/$/,""));
    } catch {}
    // Auto-cargar tickets de Jira usando la conexión ya existente
    fetchJiraTickets(ssoData?.deploy_jira_statuses, verCfg);
  }

  async function fetchJiraTickets(rawStatuses, cfgOverride) {
    const cfg = cfgOverride || versionCfg;
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

      // Paso 2: cargar issues de cada proyecto con el campo repo configurado
      const repoFieldName = cfg?.repo_jira_field || "components";
      const extraFieldsParam = repoFieldName !== "components" ? `&extraFields=${repoFieldName}` : "";
      const allIssues = [];
      await Promise.all(projects.map(async (project) => {
        try {
          const res = await fetch(`${API_BASE}/jira/issues?project=${project}${extraFieldsParam}`, { headers });
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

      if(filtered.length>0) console.log("[DeployPlanner] repoField:", repoFieldName, "sample:", filtered[0].key, "fields:", Object.keys(filtered[0].fields||{}), "value:", (filtered[0].fields||{})[repoFieldName]);

      const newTickets = filtered.map(i => {
        const fields = i.fields || i;
        // Read the configured repo field
        const repoFieldValue = fields[repoFieldName] || i[repoFieldName] || i.components || [];
        const repos = (Array.isArray(repoFieldValue) ? repoFieldValue : [repoFieldValue])
          .map(v => (typeof v === "string" ? v : v?.name || v?.value || ""))
          .filter(Boolean);
        return {
          key:      i.key || i.id,
          summary:  i.summary || fields.summary || "",
          assignee: i.assignee || fields.assignee?.displayName || "—",
          priority: i.priority || fields.priority?.name || "Medium",
          type:     i.type || fields.issuetype?.name || "Task",
          status:   i.status || fields.status?.name || "",
          repos,
        };
      });

      setTickets(newTickets);

      if(newTickets.length === 0) {
        console.warn(`Jira: ${allIssues.length} issues cargados de ${projects.length} proyectos, ninguno coincide con estados: "${rawStatuses}"`);
      }

      // Load subtask config + subtasks for all tickets
      try {
        const stConfigs = await subtaskConfigRepo.findAll();
        setSubtaskConfigs(stConfigs);
        console.log("[DeployPlanner] subtask configs:", stConfigs.length, "tickets:", newTickets.length);
        if (stConfigs.length > 0 && newTickets.length > 0) {
          const parentKeys = newTickets.map(t => t.key);
          console.log("[DeployPlanner] fetching subtasks for:", parentKeys.join(","));
          const rawSubs = await subtaskAdapter.getSubtasks(parentKeys);
          console.log("[DeployPlanner] raw subtasks:", rawSubs.length);
          const classified = SubtaskService.classify(rawSubs, stConfigs);
          console.log("[DeployPlanner] classified:", classified.length, classified.map(s=>s.key+":"+s.type+":"+s.category));
          setAllSubtasks(rawSubs);
          setClassifiedSubs(classified);
        }
      } catch(e) { console.warn("Subtask load error:", e.message); }
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
  const filteredRels  = releases.filter(r=>activeF||filterStatus.includes(r.status));
  const hidden   = releases.filter(r=>!activeF&&!filterStatus.includes(r.status)).length;

  // Compute linked groups for visual grouping + is_final blocking
  const tMap = Object.fromEntries(tickets.map(t=>[t.key,t]));
  const getCat = (status) => statusCfg[status]?.status_category || 'backlog';
  const linkedGroups = RepoGroupService.findLinkedGroups(
    repoGroups,
    releases.map(r=>({id:r.id,ticketIds:r.ticket_ids||[],status:r.status||"Planned",statusCategory:getCat(r.status||"Planned")})),
    tickets.map(t=>({key:t.key,repos:t.repos||[]})),
  );

  // Order visible: group members together
  const visible = (() => {
    if(!linkedGroups.length) return filteredRels;
    const ordered = [];
    const used = new Set();
    linkedGroups.forEach(lg => {
      const members = filteredRels.filter(r=>lg.releaseIds.includes(r.id));
      members.forEach(r=>{ if(!used.has(r.id)){ ordered.push(r); used.add(r.id); }});
    });
    filteredRels.forEach(r=>{ if(!used.has(r.id)) ordered.push(r); });
    return ordered;
  })();

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
            classifiedSubs={classifiedSubs}
            jiraBaseUrl={jiraBaseUrl}
            onRefreshSubtasks={async()=>{
              try {
                const stConfigs = await subtaskConfigRepo.findAll();
                const parentKeys = tickets.map(t=>t.key);
                const rawSubs = await subtaskAdapter.getSubtasks(parentKeys);
                setAllSubtasks(rawSubs);
                setClassifiedSubs(SubtaskService.classify(rawSubs, stConfigs));
              } catch(e) { console.warn("Refresh subtasks error:", e.message); }
            }}
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
                  {/* Render cards with group frames */}
                  {(() => {
                    const rendered = new Set();
                    const elements = [];
                    // First render grouped cards with frames
                    linkedGroups.forEach(lg => {
                      const groupCards = visible.filter(r=>lg.releaseIds.includes(r.id)&&!rendered.has(r.id));
                      if(groupCards.length<2) return;
                      groupCards.forEach(r=>rendered.add(r.id));
                      elements.push(
                        <div key={`group-${lg.group.id}`} style={{display:"flex",gap:14,flexWrap:"wrap",padding:10,border:`2px solid ${lg.allDeployed?"#22c55e":"#f59e0b"}`,borderRadius:10,background:lg.allDeployed?"rgba(34,197,94,.04)":"rgba(245,158,11,.04)",position:"relative"}}>
                          <span style={{position:"absolute",top:-9,left:14,fontSize:8,fontWeight:700,color:lg.allDeployed?"#22c55e":"#f59e0b",background:"var(--dp-bg,var(--bg,#07090f))",padding:"0 6px",letterSpacing:".05em",textTransform:"uppercase"}}>{lg.group.name}</span>
                          {groupCards.map(rel=>(
                            <ReleaseCard key={rel.id} rel={rel} statusCfg={statusCfg} tickets={tickets}
                              onOpen={setDetail} onUpd={upd} onDelete={delRelease}
                              onDrop={handleDrop} setDrag={setDrag} drag={drag}
                              allReleases={releases} repoGroups={repoGroups}
                              versionCfg={versionCfg}
                              allReleaseNumbers={(releases||[]).map(r=>r.release_number).filter(Boolean)}
                              jiraBaseUrl={jiraBaseUrl}
                              linkedGroups={linkedGroups} classifiedSubs={classifiedSubs}/>
                          ))}
                        </div>
                      );
                    });
                    // Then render ungrouped cards
                    visible.filter(r=>!rendered.has(r.id)).forEach(rel=>{
                      elements.push(
                        <ReleaseCard key={rel.id} rel={rel} statusCfg={statusCfg} tickets={tickets}
                          onOpen={setDetail} onUpd={upd} onDelete={delRelease}
                          onDrop={handleDrop} setDrag={setDrag} drag={drag}
                          allReleases={releases} repoGroups={repoGroups}
                          versionCfg={versionCfg}
                          allReleaseNumbers={(releases||[]).map(r=>r.release_number).filter(Boolean)}
                          jiraBaseUrl={jiraBaseUrl}
                          linkedGroups={linkedGroups} classifiedSubs={classifiedSubs}/>
                      );
                    });
                    return elements;
                  })()}
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
            {tab==="timeline"&&<Timeline releases={releases} tickets={tickets} upd={upd} setDetail={setDetail} statusCfg={statusCfg} repoGroups={repoGroups}/>}
            {tab==="history" &&<History  releases={releases} tickets={tickets} setDetail={setDetail} statusCfg={statusCfg} classifiedSubs={classifiedSubs}/>}
            {tab==="metrics" &&<Metrics  releases={releases} tickets={tickets} statusCfg={statusCfg} classifiedSubs={classifiedSubs}/>}
          </>
        )}
      </div>
    </div>
  );
}
