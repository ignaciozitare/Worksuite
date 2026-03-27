// @ts-nocheck
import { useState, useRef, useEffect } from "react";
import { supabase } from "../../../shared/lib/supabaseClient";

/* ─── CSS ──────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
.dp-root *{box-sizing:border-box;margin:0;padding:0;}
.dp-root{font-family:'JetBrains Mono',monospace;background:#07090f;min-height:100%;color:#c9d1d9;}
.dp-root input,.dp-root select,.dp-root button{font-family:'JetBrains Mono',monospace;}
.dp-root input[type=date]::-webkit-calendar-picker-indicator{filter:invert(.4) sepia(1) hue-rotate(180deg);}
.dp-root ::-webkit-scrollbar{width:4px;height:4px;}
.dp-root ::-webkit-scrollbar-track{background:#07090f;}
.dp-root ::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px;}
.dp-root select option{background:#0b0f18;}
`;

/* ─── Constants ────────────────────────────────────────────────── */
const STATUS_CFG = {
  planning: { label:"Planning",  color:"#6b7280", bg:"rgba(107,114,128,.12)", border:"#1f2937" },
  staging:  { label:"Staging",   color:"#f59e0b", bg:"rgba(245,158,11,.12)",  border:"#78350f" },
  merged:   { label:"Merged",    color:"#a78bfa", bg:"rgba(167,139,250,.12)", border:"#4c1d95" },
  deployed: { label:"Deployed",  color:"#34d399", bg:"rgba(52,211,153,.12)",  border:"#064e3b" },
  rollback: { label:"Rollback",  color:"#f87171", bg:"rgba(248,113,113,.12)", border:"#7f1d1d" },
};
const STATUSES = Object.keys(STATUS_CFG);
const GANTT_COLORS = { planning:"#3b82f6", staging:"#f59e0b", merged:"#a78bfa", deployed:"#34d399", rollback:"#f87171" };
const TYPE_COLORS  = { Bug:"#f59e0b", Story:"#34d399", Task:"#3b82f6", Epic:"#a78bfa" };

const today = new Date();
const fmt    = d => d.toISOString().slice(0,10);
const addD   = (iso, n) => { const d=new Date(iso+"T00:00:00"); d.setDate(d.getDate()+n); return fmt(d); };
const diffD  = (a, b)   => Math.round((new Date(b+"T00:00:00")-new Date(a+"T00:00:00"))/(864e5));
const uid    = () => crypto.randomUUID();

/* ─── Helpers ──────────────────────────────────────────────────── */
const SLabel = ({children, style={}}) => (
  <div style={{fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:"#334155",...style}}>{children}</div>
);

const StatusBadge = ({status}) => {
  const c = STATUS_CFG[status]||STATUS_CFG.planning;
  return <span style={{display:"inline-flex",alignItems:"center",padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700,color:c.color,background:c.bg,border:`1px solid ${c.border}`}}>{c.label}</span>;
};

const RepoChip = ({name}) => (
  <span style={{fontSize:9,padding:"2px 7px",borderRadius:3,background:"#0d111a",border:"1px solid #1e293b",color:"#475569"}}>{name}</span>
);

/* ─── PLANNING ──────────────────────────────────────────────────── */
function Planning({ releases, tickets, upd, addRelease, delRelease }) {
  const [filterStatus, setFilterStatus] = useState([]);
  const [addingTo, setAddingTo]         = useState(null);
  const [search, setSearch]             = useState("");
  const [dragState, setDragState]       = useState(null);
  const tMap = Object.fromEntries(tickets.map(t=>[t.key,t]));

  const getConflicts = (rel) => {
    const myRepos = (rel.ticket_ids||[]).flatMap(k=>tMap[k]?.repos||[]);
    return releases
      .filter(r=>r.id!==rel.id && r.status!=="deployed" && r.status!=="rollback")
      .flatMap(r=>(r.ticket_ids||[]).flatMap(k=>tMap[k]?.repos||[]).filter(repo=>myRepos.includes(repo)));
  };

  const toggleF = s => setFilterStatus(f=>f.includes(s)?f.filter(x=>x!==s):[...f,s]);
  const activeF = filterStatus.length===0;
  const visible = releases.filter(r=>activeF||filterStatus.includes(r.status));
  const hidden  = releases.filter(r=>!activeF&&!filterStatus.includes(r.status)).length;

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:20,flexWrap:"wrap"}}>
        <h2 style={{fontSize:14,color:"#e6edf3",fontWeight:700,marginRight:8}}>Planificación</h2>
        <span style={{fontSize:10,color:"#334155",marginRight:8}}>{releases.length} releases · {tickets.length} tickets</span>
        {STATUSES.map(s=>{
          const cfg=STATUS_CFG[s], on=filterStatus.includes(s);
          return <button key={s} onClick={()=>toggleF(s)} style={{fontSize:10,padding:"3px 10px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",fontWeight:600,background:on?cfg.bg:"transparent",color:on?cfg.color:"#334155",border:`1px solid ${on?cfg.border:"#1e293b"}`,transition:"all .12s"}}>{cfg.label}</button>;
        })}
      </div>
      {hidden>0&&<div style={{fontSize:10,color:"#334155",marginBottom:14}}>↓ {hidden} release{hidden>1?"s":""} oculta{hidden>1?"s":""} por filtros — actívalas arriba o ve a History.</div>}

      <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"flex-start"}}>
        {visible.map(rel=>{
          const cfg = STATUS_CFG[rel.status]||STATUS_CFG.planning;
          const conflicts = [...new Set(getConflicts(rel))];
          const relTickets = (rel.ticket_ids||[]).map(k=>tMap[k]).filter(Boolean);
          const relRepos   = [...new Set(relTickets.flatMap(t=>t.repos||[]))];
          return (
            <div key={rel.id}
              onDragOver={e=>e.preventDefault()}
              onDrop={e=>{
                e.preventDefault();
                if(!dragState||dragState.fromId===rel.id) return;
                upd(dragState.fromId,{ticket_ids:(releases.find(r=>r.id===dragState.fromId)?.ticket_ids||[]).filter(x=>x!==dragState.key)});
                if(!rel.ticket_ids?.includes(dragState.key)) upd(rel.id,{ticket_ids:[...(rel.ticket_ids||[]),dragState.key]});
                setDragState(null);
              }}
              style={{width:320,background:"#0b0f18",border:`1px solid ${cfg.border}`,borderTop:`2px solid ${cfg.color}`,borderRadius:8,padding:"14px 16px",opacity:rel.status==="deployed"||rel.status==="rollback"?.6:1}}
            >
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:14,fontWeight:700,color:"#e6edf3",flex:1}}>{rel.release_number||"sin versión"}</span>
                <button onClick={()=>delRelease(rel.id)} style={{background:"none",border:"none",color:"#334155",cursor:"pointer",fontSize:16,lineHeight:1}}>×</button>
              </div>
              {rel.description&&<div style={{fontSize:10,color:"#475569",marginBottom:10}}>{rel.description}</div>}

              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <select value={rel.status} onChange={e=>upd(rel.id,{status:e.target.value})} style={{background:cfg.bg,border:`1px solid ${cfg.border}`,borderRadius:4,padding:"3px 8px",fontSize:10,color:cfg.color,cursor:"pointer",outline:"none"}}>
                  {STATUSES.map(s=><option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
                </select>
                <input type="date" value={rel.start_date||""} onChange={e=>upd(rel.id,{start_date:e.target.value})} style={{flex:1,background:"#07090f",border:"1px solid #1e293b",borderRadius:4,padding:"3px 8px",fontSize:10,color:"#94a3b8",outline:"none"}}/>
                <span style={{color:"#334155",fontSize:10}}>→</span>
              </div>
              <div style={{marginBottom:10}}>
                <input type="date" value={rel.end_date||""} onChange={e=>upd(rel.id,{end_date:e.target.value})} style={{width:"100%",background:"#07090f",border:"1px solid #1e293b",borderRadius:4,padding:"4px 8px",fontSize:10,color:"#94a3b8",outline:"none"}}/>
              </div>

              {conflicts.length>0&&<div style={{background:"rgba(248,113,113,.06)",border:"1px solid #7f1d1d",borderRadius:4,padding:"4px 8px",fontSize:10,color:"#f87171",marginBottom:8}}>▲ Repos en conflicto: {conflicts.join(", ")}</div>}

              <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:8}}>
                {relTickets.map(t=>(
                  <div key={t.key} draggable onDragStart={()=>setDragState({key:t.key,fromId:rel.id})} onDragEnd={()=>setDragState(null)}
                    style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",background:"#07090f",border:"1px solid #1e293b",borderLeft:"2px solid #334155",borderRadius:4,cursor:"grab",fontSize:10}}>
                    <span style={{color:"#38bdf8",fontWeight:700,flexShrink:0}}>{t.key}</span>
                    <span style={{color:"#64748b",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.summary.slice(0,28)}…</span>
                    <span style={{color:"#334155",flexShrink:0}}>{t.assignee}</span>
                    <button onClick={()=>upd(rel.id,{ticket_ids:(rel.ticket_ids||[]).filter(x=>x!==t.key)})} style={{background:"none",border:"none",color:"#334155",cursor:"pointer",fontSize:11}}>×</button>
                  </div>
                ))}
              </div>

              {addingTo===rel.id ? (
                <div style={{marginBottom:8}}>
                  <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar ticket…"
                    style={{width:"100%",background:"#07090f",border:"1px solid #38bdf8",borderRadius:4,padding:"5px 8px",fontSize:10,color:"#e6edf3",outline:"none",marginBottom:4}}
                    onBlur={()=>{setAddingTo(null);setSearch("");}}/>
                  {tickets.filter(t=>!(rel.ticket_ids||[]).includes(t.key)&&(t.key.toLowerCase().includes(search.toLowerCase())||t.summary.toLowerCase().includes(search.toLowerCase()))).slice(0,5).map(t=>(
                    <div key={t.key} onMouseDown={()=>{upd(rel.id,{ticket_ids:[...(rel.ticket_ids||[]),t.key]});setAddingTo(null);setSearch("");}}
                      style={{padding:"4px 8px",fontSize:10,cursor:"pointer",color:"#94a3b8",display:"flex",gap:8}}>
                      <span style={{color:"#38bdf8",fontWeight:700}}>{t.key}</span>
                      <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.summary}</span>
                    </div>
                  ))}
                </div>
              ):(
                <button onClick={()=>{setAddingTo(rel.id);setSearch("");}} style={{width:"100%",background:"transparent",border:"1px dashed #1e293b",borderRadius:4,padding:"5px",fontSize:10,color:"#334155",cursor:"pointer",marginBottom:8}}>+ ticket</button>
              )}

              {relRepos.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>{relRepos.map(r=><RepoChip key={r} name={r}/>)}</div>}
            </div>
          );
        })}

        <div onClick={addRelease} style={{width:300,minHeight:140,background:"transparent",border:"2px dashed #1e293b",borderRadius:8,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",color:"#334155",fontSize:12,transition:"border-color .15s"}}
          onMouseEnter={e=>e.currentTarget.style.borderColor="#38bdf8"}
          onMouseLeave={e=>e.currentTarget.style.borderColor="#1e293b"}>
          <span style={{fontSize:24}}>+</span>
          <span style={{fontSize:10}}>Nueva release</span>
        </div>
      </div>
    </div>
  );
}

/* ─── TIMELINE (Gantt) ──────────────────────────────────────────── */
function Timeline({ releases, tickets, upd, setModal }) {
  const [drag, setDrag] = useState(null);
  const relRef = useRef(releases);
  relRef.current = releases;
  const tMap = Object.fromEntries(tickets.map(t=>[t.key,t]));

  const allDates = releases.flatMap(r=>[r.start_date,r.end_date]).filter(Boolean).sort();
  const minDate  = allDates[0]||fmt(today);
  const maxDate  = allDates[allDates.length-1]||addD(fmt(today),30);
  const startDate = addD(minDate,-3);
  const totalDays = Math.max(diffD(startDate,maxDate)+14,30);
  const DAY_W = 32, LABEL_W = 200, ROW_H = 60;
  const dateToX = iso => LABEL_W + diffD(startDate,iso)*DAY_W;
  const todayX  = dateToX(fmt(today));

  const weeks = [];
  let d = new Date(startDate+"T00:00:00");
  while(fmt(d)<=addD(maxDate,7)){ weeks.push(fmt(d)); d.setDate(d.getDate()+7); }

  const handleMD = (e,relId,type) => {
    e.preventDefault(); e.stopPropagation();
    const rel = releases.find(r=>r.id===relId);
    if(!rel) return;
    setDrag({relId,type,startX:e.clientX,origStart:rel.start_date,origEnd:rel.end_date});
  };

  useEffect(()=>{
    if(!drag) return;
    const onMove = e => {
      const daysDx = Math.round((e.clientX-drag.startX)/DAY_W);
      if(!daysDx) return;
      if(drag.type==="move") upd(drag.relId,{start_date:addD(drag.origStart,daysDx),end_date:addD(drag.origEnd,daysDx)});
      else if(drag.type==="left"){ const s=addD(drag.origStart,daysDx); if(diffD(s,drag.origEnd)>=1) upd(drag.relId,{start_date:s}); }
      else if(drag.type==="right"){ const e2=addD(drag.origEnd,daysDx); if(diffD(drag.origStart,e2)>=1) upd(drag.relId,{end_date:e2}); }
    };
    const onUp = () => setDrag(null);
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
    return ()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
  },[drag]);

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",marginBottom:16,gap:12}}>
        <h2 style={{fontSize:14,color:"#e6edf3",fontWeight:700}}>Timeline</h2>
        <div style={{marginLeft:"auto",display:"flex",gap:12,flexWrap:"wrap"}}>
          {Object.entries(STATUS_CFG).map(([k,v])=>(
            <div key={k} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"#64748b"}}>
              <div style={{width:10,height:10,borderRadius:2,background:GANTT_COLORS[k]}}/>
              {v.label}
            </div>
          ))}
        </div>
      </div>

      <div style={{overflowX:"auto",border:"1px solid #1e293b",borderRadius:8}}>
        <div style={{width:LABEL_W+totalDays*DAY_W,minWidth:"100%",position:"relative",background:"#07090f"}}>
          {/* Header */}
          <div style={{display:"flex",height:36,borderBottom:"1px solid #0e1520",position:"sticky",top:0,zIndex:5,background:"#07090f"}}>
            <div style={{width:LABEL_W,flexShrink:0,borderRight:"1px solid #0e1520"}}/>
            <div style={{flex:1,position:"relative"}}>
              {weeks.map(w=>{
                const x=dateToX(w)-LABEL_W, isTd=w<=fmt(today)&&addD(w,7)>fmt(today);
                return <div key={w} style={{position:"absolute",left:x,top:0,height:"100%",borderLeft:`1px solid ${isTd?"#f59e0b":"#0e1520"}`,display:"flex",alignItems:"center",paddingLeft:4}}>
                  <span style={{fontSize:9,color:isTd?"#f59e0b":"#334155",fontWeight:isTd?700:400,whiteSpace:"nowrap"}}>
                    {isTd?"hoy":new Date(w+"T00:00:00").toLocaleDateString("es-ES",{day:"numeric",month:"short"})}
                  </span>
                </div>;
              })}
              <div style={{position:"absolute",left:todayX-LABEL_W,top:0,height:"100%",borderLeft:"1px dashed #f59e0b"}}/>
            </div>
          </div>

          {releases.map(rel=>{
            const color = GANTT_COLORS[rel.status]||"#6b7280";
            const relTickets = (rel.ticket_ids||[]).map(k=>tMap[k]).filter(Boolean);
            const hasDates = rel.start_date&&rel.end_date;
            const x1=hasDates?dateToX(rel.start_date):0, x2=hasDates?dateToX(rel.end_date):0;
            const barW=Math.max(x2-x1,60), dur=hasDates?diffD(rel.start_date,rel.end_date):null;
            return (
              <div key={rel.id} style={{display:"flex",height:ROW_H,borderBottom:"1px solid #0e1520",alignItems:"center"}}>
                <div style={{width:LABEL_W,flexShrink:0,borderRight:"1px solid #0e1520",padding:"0 14px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#e6edf3"}}>{rel.release_number||"—"}</div>
                  <div style={{fontSize:9,marginTop:3,display:"flex",alignItems:"center",gap:6}}>
                    <StatusBadge status={rel.status}/>
                    {dur!=null&&<span style={{color:"#475569"}}>{dur}d · {rel.ticket_ids?.length||0} tickets</span>}
                  </div>
                </div>
                <div style={{flex:1,position:"relative",height:"100%"}}>
                  <div style={{position:"absolute",inset:0,backgroundImage:`repeating-linear-gradient(90deg,transparent,transparent ${DAY_W*7-1}px,#0e1520 ${DAY_W*7}px)`}}/>
                  <div style={{position:"absolute",left:todayX-LABEL_W,top:0,height:"100%",borderLeft:"1px dashed rgba(245,158,11,.3)"}}/>
                  {hasDates&&(
                    <div style={{position:"absolute",left:x1-LABEL_W,top:"50%",transform:"translateY(-50%)",width:barW,height:32,background:`${color}22`,border:`1px solid ${color}`,borderRadius:4,cursor:drag?.relId===rel.id&&drag.type==="move"?"grabbing":"grab",display:"flex",alignItems:"center",userSelect:"none",overflow:"hidden"}}
                      onMouseDown={e=>handleMD(e,rel.id,"move")}
                      onClick={()=>setModal(rel.id)}>
                      <div style={{width:6,height:"100%",cursor:"col-resize",flexShrink:0,background:`${color}40`}} onMouseDown={e=>{e.stopPropagation();handleMD(e,rel.id,"left");}}/>
                      <div style={{flex:1,padding:"0 6px",fontSize:9,color,fontWeight:600,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{rel.start_date} → {rel.end_date}</div>
                      <div style={{width:6,height:"100%",cursor:"col-resize",flexShrink:0,background:`${color}40`}} onMouseDown={e=>{e.stopPropagation();handleMD(e,rel.id,"right");}}/>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{fontSize:9,color:"#334155",marginTop:8,display:"flex",gap:16}}>
        <span>⟺ Arrastra el bloque para mover</span><span>·</span>
        <span>Extremos para redimensionar</span><span>·</span>
        <span>Clic para abrir detalle →</span>
      </div>
    </div>
  );
}

/* ─── HISTORY ───────────────────────────────────────────────────── */
function History({ releases, tickets, setModal }) {
  const [sortBy, setSortBy] = useState("end_date");
  const tMap = Object.fromEntries(tickets.map(t=>[t.key,t]));
  const sorted = [...releases].sort((a,b)=>{
    if(sortBy==="end_date")   return (b.end_date||"")>(a.end_date||"")?1:-1;
    if(sortBy==="start_date") return (b.start_date||"")>(a.start_date||"")?1:-1;
    if(sortBy==="dur") return diffD(b.start_date||fmt(today),b.end_date||fmt(today))-diffD(a.start_date||fmt(today),a.end_date||fmt(today));
    return 0;
  });
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <h2 style={{fontSize:14,color:"#e6edf3",fontWeight:700}}>Historial</h2>
        <span style={{fontSize:10,color:"#334155"}}>{sorted.length} releases</span>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:10,color:"#334155"}}>Ordenar</span>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{background:"#0b0f18",border:"1px solid #1e293b",borderRadius:4,padding:"4px 8px",fontSize:10,color:"#94a3b8",outline:"none"}}>
            <option value="end_date">Fecha fin</option>
            <option value="start_date">Fecha inicio</option>
            <option value="dur">Duración</option>
          </select>
        </div>
      </div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
        <thead><tr style={{borderBottom:"1px solid #0e1520"}}>
          {["RELEASE","ESTADO","INICIO","FIN ↓","DURACIÓN","TICKETS","REPOS"].map(h=>(
            <th key={h} style={{padding:"8px 12px",textAlign:"left",color:"#334155",fontWeight:600,letterSpacing:".06em",fontSize:9}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {sorted.map(rel=>{
            const relTickets = (rel.ticket_ids||[]).map(k=>tMap[k]).filter(Boolean);
            const relRepos   = [...new Set(relTickets.flatMap(t=>t.repos||[]))];
            const dur = rel.start_date&&rel.end_date?diffD(rel.start_date,rel.end_date):null;
            return (
              <tr key={rel.id} onClick={()=>setModal(rel.id)} style={{borderBottom:"1px solid #0d111a",cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.background="#0b0f18"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <td style={{padding:"12px"}}>
                  <div style={{fontWeight:700,color:"#38bdf8",fontSize:11}}>{rel.release_number||"—"}</div>
                  {rel.description&&<div style={{color:"#334155",fontSize:9,marginTop:2}}>{rel.description}</div>}
                </td>
                <td style={{padding:"12px"}}><StatusBadge status={rel.status}/></td>
                <td style={{padding:"12px",color:"#64748b"}}>{rel.start_date||"—"}</td>
                <td style={{padding:"12px",color:"#64748b"}}>{rel.end_date||"—"}</td>
                <td style={{padding:"12px",color:"#94a3b8",fontWeight:600}}>{dur!=null?`${dur}d`:"—"}</td>
                <td style={{padding:"12px",color:"#64748b"}}>{rel.ticket_ids?.length||0}</td>
                <td style={{padding:"12px"}}><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{relRepos.slice(0,3).map(r=><RepoChip key={r} name={r}/>)}{relRepos.length>3&&<span style={{fontSize:9,color:"#334155"}}>+{relRepos.length-3}</span>}</div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── METRICS ───────────────────────────────────────────────────── */
function Metrics({ releases, tickets }) {
  const tMap = Object.fromEntries(tickets.map(t=>[t.key,t]));
  const deployed  = releases.filter(r=>r.status==="deployed");
  const rollbacks = releases.filter(r=>r.status==="rollback");
  const finished  = [...deployed,...rollbacks];
  const durations = finished.filter(r=>r.start_date&&r.end_date).map(r=>diffD(r.start_date,r.end_date));
  const avgDur    = durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):0;
  const successRate  = finished.length?Math.round(deployed.length/finished.length*100):0;
  const rollbackRate = finished.length?Math.round(rollbacks.length/finished.length*100):0;
  const allKeys   = [...new Set(releases.flatMap(r=>r.ticket_ids||[]))];
  const tpr       = releases.length?(allKeys.length/releases.length).toFixed(1):0;
  const allRepos  = [...new Set(allKeys.flatMap(k=>tMap[k]?.repos||[]))];

  const byMonth = {};
  releases.forEach(r=>{ if(!r.end_date) return; const m=r.end_date.slice(0,7); byMonth[m]=(byMonth[m]||0)+1; });
  const months = Object.entries(byMonth).sort();
  const maxMonth = Math.max(...Object.values(byMonth),1);

  const byType = {};
  allKeys.forEach(k=>{ const t=tMap[k]; if(t){ byType[t.type||"Task"]=(byType[t.type||"Task"]||0)+1; } });
  const typeEntries = Object.entries(byType).sort((a,b)=>b[1]-a[1]);

  const repoCounts = {};
  allKeys.forEach(k=>{ (tMap[k]?.repos||[]).forEach(r=>{repoCounts[r]=(repoCounts[r]||0)+1;}); });
  const repoEntries = Object.entries(repoCounts).sort((a,b)=>b[1]-a[1]);
  const maxRepo = Math.max(...Object.values(repoCounts),1);

  const stats=[
    {label:"TOTAL RELEASES",  value:releases.length,     sub:`${deployed.length} deployed · ${rollbacks.length} rollbacks`, color:"#e6edf3"},
    {label:"DURACIÓN MEDIA",  value:`${avgDur}d`,         sub:"inicio → fin",                                                color:"#e6edf3"},
    {label:"TASA DE ÉXITO",   value:`${successRate}%`,    sub:`${deployed.length}/${finished.length} finalizadas`,           color:"#34d399"},
    {label:"TASA ROLLBACK",   value:`${rollbackRate}%`,   sub:`${rollbacks.length} rollbacks`,                               color:rollbackRate>25?"#f87171":"#f59e0b"},
    {label:"TICKETS/RELEASE", value:tpr,                  sub:"media",                                                       color:"#38bdf8"},
    {label:"REPOS ÚNICOS",    value:allRepos.length,      sub:"repositorios",                                                color:"#a78bfa"},
  ];

  return (
    <div>
      <h2 style={{fontSize:14,color:"#e6edf3",fontWeight:700,marginBottom:20}}>Métricas</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:24}}>
        {stats.map(s=>(
          <div key={s.label} style={{background:"#0b0f18",border:"1px solid #1e293b",borderRadius:8,padding:"14px 16px"}}>
            <SLabel style={{marginBottom:8}}>{s.label}</SLabel>
            <div style={{fontSize:28,fontWeight:700,color:s.color,lineHeight:1}}>{s.value}</div>
            <div style={{fontSize:9,color:"#334155",marginTop:5}}>{s.sub}</div>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        {/* Releases por mes */}
        <div style={{background:"#0b0f18",border:"1px solid #1e293b",borderRadius:8,padding:"16px 18px"}}>
          <SLabel style={{marginBottom:14}}>RELEASES POR MES</SLabel>
          <div style={{display:"flex",alignItems:"flex-end",gap:4,height:80,borderBottom:"1px solid #0e1520",paddingBottom:4}}>
            {months.map(([m,v])=>(
              <div key={m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <div style={{background:"#3b82f6",width:"100%",height:Math.round(v/maxMonth*70),borderRadius:"2px 2px 0 0",minHeight:4}}/>
                <span style={{fontSize:7,color:"#334155"}}>{v}</span>
              </div>
            ))}
            {months.length===0&&<div style={{fontSize:10,color:"#334155",width:"100%",textAlign:"center",paddingBottom:20}}>Sin datos</div>}
          </div>
          {months.length>0&&<div style={{display:"flex",gap:4,marginTop:4}}>{months.map(([m])=><div key={m} style={{flex:1,fontSize:7,color:"#334155",textAlign:"center"}}>{m.slice(5)}</div>)}</div>}
        </div>
        {/* Tickets por tipo */}
        <div style={{background:"#0b0f18",border:"1px solid #1e293b",borderRadius:8,padding:"16px 18px"}}>
          <SLabel style={{marginBottom:14}}>TICKETS POR TIPO</SLabel>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {typeEntries.map(([type,count])=>{
              const color=TYPE_COLORS[type]||"#64748b";
              return (
                <div key={type}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:10,color:"#94a3b8"}}>{type}</span>
                    <span style={{fontSize:10,color,fontWeight:700}}>{count} ({Math.round(count/allKeys.length*100)}%)</span>
                  </div>
                  <div style={{height:4,background:"#1e293b",borderRadius:2,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${Math.round(count/(Math.max(...Object.values(byType),1))*100)}%`,background:color,borderRadius:2}}/>
                  </div>
                </div>
              );
            })}
            {typeEntries.length===0&&<div style={{fontSize:10,color:"#334155"}}>Sin datos</div>}
          </div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        {/* Repos */}
        <div style={{background:"#0b0f18",border:"1px solid #1e293b",borderRadius:8,padding:"16px 18px"}}>
          <SLabel style={{marginBottom:14}}>REPOS MÁS DESPLEGADOS</SLabel>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {repoEntries.map(([repo,count])=>(
              <div key={repo} style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:9,color:"#64748b",width:110,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis"}}>{repo}</span>
                <div style={{flex:1,height:3,background:"#1e293b",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.round(count/maxRepo*100)}%`,background:"#3b82f6",borderRadius:2}}/>
                </div>
                <span style={{fontSize:9,color:"#475569",width:12,textAlign:"right"}}>{count}</span>
              </div>
            ))}
            {repoEntries.length===0&&<div style={{fontSize:10,color:"#334155"}}>Sin datos</div>}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* Rollbacks */}
          <div style={{background:"#0b0f18",border:"1px solid #1e293b",borderRadius:8,padding:"16px 18px"}}>
            <SLabel style={{marginBottom:10}}>ROLLBACKS</SLabel>
            {rollbacks.length===0
              ?<div style={{fontSize:10,color:"#334155"}}>Sin rollbacks 🎉</div>
              :<div style={{display:"flex",flexDirection:"column",gap:6}}>
                {rollbacks.map(rel=>{
                  const dur=rel.start_date&&rel.end_date?diffD(rel.start_date,rel.end_date):null;
                  return <div key={rel.id} style={{background:"#130404",border:"1px solid #7f1d1d",borderRadius:5,padding:"7px 10px",display:"flex",alignItems:"center",gap:10}}>
                    <span style={{color:"#f87171",fontSize:12}}>↩</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:10,color:"#fca5a5",fontWeight:700}}>{rel.release_number||"—"}</div>
                      <div style={{fontSize:8,color:"#7f1d1d"}}>{rel.end_date||"—"}{dur!=null?` · ${dur}d`:""}</div>
                    </div>
                    <span style={{fontSize:9,color:"#7f1d1d"}}>{rel.ticket_ids?.length||0} tickets</span>
                  </div>;
                })}
              </div>
            }
          </div>
          {/* Sugeridas */}
          <div style={{background:"#0b0f18",border:"1px solid #1e293b",borderRadius:8,padding:"16px 18px",flex:1}}>
            <SLabel style={{marginBottom:10}}>💡 MÉTRICAS SUGERIDAS</SLabel>
            {["MTTR — recuperación tras rollback","Lead time: apertura → deployed","Change failure rate por repo","Deploy frequency (releases/semana)","% Hotfix vs planificadas","Tiempo medio en staging","Tickets bloqueados +7 días","Correlación tickets/release con rollback"].map((s,i)=>(
              <div key={i} style={{fontSize:9,color:"#334155",padding:"4px 0",borderBottom:"1px solid #0a0e14",lineHeight:1.5}}>· {s}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── RELEASE MODAL ────────────────────────────────────────────── */
function ReleaseModal({ rel, tMap, unassigned, onClose, onUpd, onAddTicket, onRemoveTicket }) {
  const cfg = STATUS_CFG[rel.status]||STATUS_CFG.planning;
  const relTickets = (rel.ticket_ids||[]).map(k=>tMap[k]).filter(Boolean);
  const relRepos   = [...new Set(relTickets.flatMap(t=>t.repos||[]))];
  const dur = rel.start_date&&rel.end_date?diffD(rel.start_date,rel.end_date):null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#0b0f18",border:`1px solid ${cfg.border}`,borderRadius:10,width:540,maxHeight:"85vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #1e293b",display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1}}>
            <input value={rel.release_number||""} onChange={e=>onUpd({release_number:e.target.value})}
              style={{background:"none",border:"none",fontSize:16,fontWeight:700,color:"#e6edf3",fontFamily:"inherit",outline:"none",width:"100%"}}/>
            <input value={rel.description||""} onChange={e=>onUpd({description:e.target.value})} placeholder="Descripción…"
              style={{background:"none",border:"none",fontSize:11,color:"#475569",fontFamily:"inherit",outline:"none",width:"100%",marginTop:2}}/>
          </div>
          <StatusBadge status={rel.status}/>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#334155",cursor:"pointer",fontSize:18}}>×</button>
        </div>
        <div style={{overflow:"auto",padding:"18px 20px",flex:1}}>
          <div style={{display:"flex",gap:12,marginBottom:16}}>
            <div style={{flex:1}}><SLabel style={{marginBottom:5}}>Inicio</SLabel>
              <input type="date" value={rel.start_date||""} onChange={e=>onUpd({start_date:e.target.value})}
                style={{width:"100%",background:"#07090f",border:"1px solid #1e293b",borderRadius:4,padding:"6px 8px",fontSize:11,color:"#94a3b8",outline:"none"}}/></div>
            <div style={{flex:1}}><SLabel style={{marginBottom:5}}>Fin</SLabel>
              <input type="date" value={rel.end_date||""} onChange={e=>onUpd({end_date:e.target.value})}
                style={{width:"100%",background:"#07090f",border:"1px solid #1e293b",borderRadius:4,padding:"6px 8px",fontSize:11,color:"#94a3b8",outline:"none"}}/></div>
            <div style={{flex:1}}><SLabel style={{marginBottom:5}}>Duración</SLabel>
              <div style={{padding:"6px 8px",fontSize:16,fontWeight:700,color:"#e6edf3"}}>{dur!=null?`${dur}d`:"—"}</div></div>
          </div>
          <div style={{marginBottom:16}}><SLabel style={{marginBottom:5}}>Estado</SLabel>
            <select value={rel.status} onChange={e=>onUpd({status:e.target.value})}
              style={{width:"100%",background:"#07090f",border:"1px solid #1e293b",borderRadius:4,padding:"6px 8px",fontSize:11,color:"#94a3b8",outline:"none"}}>
              {STATUSES.map(s=><option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
            </select>
          </div>
          <div style={{marginBottom:16}}>
            <SLabel style={{marginBottom:8}}>Tickets ({relTickets.length})</SLabel>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {relTickets.map(t=>(
                <div key={t.key} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",background:"#07090f",border:"1px solid #1e293b",borderRadius:4,fontSize:10}}>
                  <span style={{color:"#38bdf8",fontWeight:700}}>{t.key}</span>
                  <span style={{color:"#64748b",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.summary}</span>
                  {t.assignee&&<span style={{color:"#334155"}}>{t.assignee}</span>}
                  <button onClick={()=>onRemoveTicket(t.key)} style={{background:"none",border:"none",color:"#334155",cursor:"pointer",fontSize:11}}>×</button>
                </div>
              ))}
            </div>
            {unassigned.length>0&&(
              <div style={{marginTop:8}}>
                <SLabel style={{marginBottom:5}}>Disponibles</SLabel>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {unassigned.map(t=>(
                    <div key={t.key} onClick={()=>onAddTicket(t.key)}
                      style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",cursor:"pointer",border:"1px dashed #1e293b",borderRadius:4,fontSize:10,color:"#475569"}}
                      onMouseEnter={e=>e.currentTarget.style.borderColor="#38bdf8"}
                      onMouseLeave={e=>e.currentTarget.style.borderColor="#1e293b"}>
                      <span style={{color:"#38bdf8",fontWeight:700}}>{t.key}</span>
                      <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.summary}</span>
                      <span style={{color:"#334155"}}>+</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {relRepos.length>0&&<div><SLabel style={{marginBottom:8}}>Repos ({relRepos.length})</SLabel>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{relRepos.map(r=><RepoChip key={r} name={r}/>)}</div></div>}
        </div>
      </div>
    </div>
  );
}

/* ─── ROOT ──────────────────────────────────────────────────────── */
export function DeployPlanner({ currentUser }) {
  const [tab, setTab]         = useState("planning");
  const [releases, setReleases] = useState([]);
  const [tickets, setTickets]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [fetchingJira, setFetchingJira] = useState(false);
  const [modal, setModal]       = useState(null);

  // Load releases from Supabase
  useEffect(() => {
    loadReleases();
  }, []);

  async function loadReleases() {
    setLoading(true);
    const { data } = await supabase.from("dp_releases").select("*").order("start_date", { ascending: true });
    setReleases(data || []);
    setLoading(false);
  }

  // Load Jira tickets using the existing jira_connections config
  async function loadJiraTickets() {
    setFetchingJira(true);
    try {
      const { data: conn } = await supabase
        .from("jira_connections")
        .select("base_url, email, api_token")
        .limit(1).single();

      if (!conn) { alert("No hay conexión con Jira configurada. Ve a Admin → Jira Config."); setFetchingJira(false); return; }

      // Use the API endpoint (same as JiraTracker)
      const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` };

      const res = await fetch(`${API_BASE}/jira/search?jql=status%3D%22Ready+to+Production%22+ORDER+BY+updated+DESC&maxResults=100`, { headers });
      if (!res.ok) throw new Error(`Jira API error ${res.status}`);
      const data = await res.json();

      const newTickets = (data.issues || []).map(i => ({
        key:      i.key,
        summary:  i.fields?.summary || "",
        assignee: i.fields?.assignee?.displayName || "—",
        priority: i.fields?.priority?.name || "Medium",
        type:     i.fields?.issuetype?.name || "Task",
        repos:    (i.fields?.customfield_10014 || i.fields?.labels || [])
          .filter(Boolean)
          .map(s => typeof s === "string" ? s : s.label || "")
          .filter(s => s.length),
      }));
      setTickets(newTickets);
      setTab("planning");
    } catch (e) {
      console.error(e);
      alert(`Error al cargar tickets de Jira: ${e.message}`);
    }
    setFetchingJira(false);
  }

  // CRUD releases — persist to Supabase
  const upd = async (id, patch) => {
    setReleases(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
    await supabase.from("dp_releases").update(patch).eq("id", id);
  };

  const addRelease = async () => {
    const last = releases[releases.length - 1];
    const newRel = {
      release_number: "",
      description:    "",
      status:         "planning",
      start_date:     last ? addD(last.end_date || fmt(today), 2) : fmt(today),
      end_date:       last ? addD(last.end_date || fmt(today), 7) : addD(fmt(today), 5),
      ticket_ids:     [],
      created_by:     currentUser.id,
    };
    const { data } = await supabase.from("dp_releases").insert(newRel).select().single();
    if (data) setReleases(rs => [...rs, data]);
  };

  const delRelease = async (id) => {
    setReleases(rs => rs.filter(r => r.id !== id));
    await supabase.from("dp_releases").delete().eq("id", id);
  };

  const tMap       = Object.fromEntries(tickets.map(t => [t.key, t]));
  const unassigned = tickets.filter(t => !releases.some(r => r.ticket_ids?.includes(t.key)));
  const modalRel   = modal ? releases.find(r => r.id === modal) : null;

  const TABS = [
    { id:"planning", label:"Planning", badge:releases.filter(r=>r.status!=="deployed"&&r.status!=="rollback").length||undefined },
    { id:"timeline", label:"Timeline" },
    { id:"history",  label:"History",  badge:releases.filter(r=>r.status==="deployed"||r.status==="rollback").length||undefined },
    { id:"metrics",  label:"Metrics"  },
  ];

  return (
    <div className="dp-root" style={{height:"100%",overflow:"auto"}}>
      <style>{CSS}</style>

      {/* Nav */}
      <nav style={{borderBottom:"1px solid #0e1520",padding:"0 28px",display:"flex",alignItems:"center",height:52,background:"#07090f",gap:2,position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginRight:24}}>
          <div style={{width:26,height:26,background:"linear-gradient(135deg,#1d4ed8 0%,#0ea5e9 100%)",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🚀</div>
          <span style={{fontWeight:700,fontSize:13,color:"#e6edf3",letterSpacing:".04em"}}>Deploy Planner</span>
        </div>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{height:52,padding:"0 16px",border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:500,letterSpacing:".08em",textTransform:"uppercase",color:tab===t.id?"#38bdf8":"#64748b",borderBottom:tab===t.id?"2px solid #38bdf8":"2px solid transparent",transition:"color .15s",display:"flex",alignItems:"center",gap:6}}>
            {t.label}
            {t.badge>0&&<span style={{background:tab===t.id?"#0a1f38":"#111827",color:tab===t.id?"#38bdf8":"#475569",fontSize:9,padding:"1px 6px",borderRadius:10}}>{t.badge}</span>}
          </button>
        ))}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          {tickets.length>0&&<span style={{fontSize:10,color:"#334155"}}>{tickets.length} tickets cargados</span>}
          <button onClick={loadJiraTickets} disabled={fetchingJira} style={{background:"transparent",border:"1px solid #1e293b",borderRadius:5,padding:"5px 12px",color:fetchingJira?"#334155":"#64748b",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>
            {fetchingJira?"Cargando…":"Conectar Jira →"}
          </button>
        </div>
      </nav>

      {/* Content */}
      <div style={{padding:28}}>
        {loading ? (
          <div style={{textAlign:"center",padding:60,color:"#334155",fontSize:13}}>Cargando…</div>
        ) : (
          <>
            {tab==="planning" && <Planning releases={releases} tickets={tickets} upd={upd} addRelease={addRelease} delRelease={delRelease}/>}
            {tab==="timeline" && <Timeline releases={releases} tickets={tickets} upd={upd} setModal={setModal}/>}
            {tab==="history"  && <History  releases={releases} tickets={tickets} setModal={setModal}/>}
            {tab==="metrics"  && <Metrics  releases={releases} tickets={tickets}/>}
          </>
        )}
      </div>

      {/* Modal */}
      {modalRel && (
        <ReleaseModal
          rel={modalRel}
          tMap={tMap}
          unassigned={unassigned}
          onClose={()=>setModal(null)}
          onUpd={p=>upd(modal,p)}
          onAddTicket={k=>upd(modal,{ticket_ids:[...(modalRel.ticket_ids||[]),k]})}
          onRemoveTicket={k=>upd(modal,{ticket_ids:(modalRel.ticket_ids||[]).filter(x=>x!==k)})}
        />
      )}
    </div>
  );
}
