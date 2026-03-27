// ─── EnvironmentsModule.jsx — Reservas de Entornos para WorkSuite ──────────
// Integrado con WorkSuite: usa Supabase auth, CSS variables del sistema,
// y el mismo estilo de card/timeline que el resto de la plataforma.
import { useState, useEffect, useRef, useMemo, useCallback } from "react";

// ── Utilidades ────────────────────────────────────────────────────────────────
const uid     = () => Math.random().toString(36).slice(2, 10);
const fmtDt   = iso => iso ? new Date(iso).toLocaleString("es-ES",{dateStyle:"short",timeStyle:"short"}) : "—";
const durH    = (s, e) => (new Date(e) - new Date(s)) / 3_600_000;
const overlap = (s1,e1,s2,e2) => new Date(s1) < new Date(e2) && new Date(s2) < new Date(e1);
const isJira  = k => /^[A-Z][A-Z0-9]+-\d+$/.test((k||"").trim());
const pad     = n => String(n).padStart(2,"0");
const checkOverlap = (ress, envId, s, e, excId) =>
  ress.filter(r => r.environment_id===envId && r.id!==excId &&
    ["Reserved","InUse","PolicyViolation"].includes(r.status) &&
    overlap(s, e, r.planned_start, r.planned_end));

const autoRelease = ress => {
  const n = new Date();
  return ress.map(r => {
    if(["Reserved","InUse"].includes(r.status) && new Date(r.planned_end) <= n)
      return { ...r, status:"Completed",
        usage_session: r.usage_session
          ? {...r.usage_session, actual_end: r.planned_end}
          : {actual_start: r.planned_start, actual_end: r.planned_end, branches:[]} };
    return r;
  });
};

// ── Constantes de UI ──────────────────────────────────────────────────────────
const SM = {
  Reserved:        { color:"#3b82f6", label:"Reservado",        icon:"⏳" },
  InUse:           { color:"#22c55e", label:"En uso",            icon:"🟢" },
  Completed:       { color:"#6b7280", label:"Completado",        icon:"✅" },
  Cancelled:       { color:"#ef4444", label:"Cancelado",         icon:"❌" },
  PolicyViolation: { color:"#f97316", label:"Violación política",icon:"⚠️" },
};
const CC = {
  DEV:     { bar:"#7c3aed", badge:"rgba(124,58,237,.15)",  btext:"#a78bfa" },
  PRE:     { bar:"#b45309", badge:"rgba(180,83,9,.15)",    btext:"#fbbf24" },
  STAGING: { bar:"#0e7490", badge:"rgba(14,116,144,.15)",  btext:"#22d3ee" },
};
const ENV_PALETTE = [
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e","#10b981","#14b8a6",
  "#06b6d4","#0ea5e9","#3b82f6","#6366f1","#8b5cf6","#a855f7","#ec4899","#f43f5e",
  "#7c3aed","#9333ea","#db2777","#e11d48","#dc2626","#0891b2","#0284c7","#2563eb",
];
const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_ES   = ["Lu","Ma","Mi","Ju","Vi","Sá","Do"];

// ── Estilos helpers (usan CSS vars de WorkSuite) ───────────────────────────────
const SI = (extra={}) => ({
  background:"var(--sf2,#1a1a28)", border:"1px solid var(--bd,#252535)",
  borderRadius:8, padding:"8px 12px", fontSize:13, color:"var(--tx,#e8e8f2)",
  width:"100%", outline:"none", fontFamily:"inherit", ...extra,
});
const SB = (variant="primary", extra={}) => ({
  background: variant==="primary"?"var(--ac,#6366f1)":variant==="danger"?"#dc2626":variant==="success"?"#16a34a":variant==="warning"?"#d97706":variant==="outline"?"transparent":"transparent",
  color: variant==="ghost"?"var(--tx3,#6a6a9a)":variant==="outline"?"var(--ac,#6366f1)":"#fff",
  border: variant==="outline"?"1px solid var(--ac,#6366f1)":"none",
  borderRadius:8, cursor:"pointer", fontWeight:500, fontSize:13,
  padding:"6px 14px", transition:"all .15s", fontFamily:"inherit", ...extra,
});

// ── Sub-componentes ────────────────────────────────────────────────────────────
const CatBadge = ({cat}) => {
  const c = CC[cat]||CC.DEV;
  return <span style={{background:c.badge,color:c.btext,padding:"2px 7px",borderRadius:20,fontSize:11,fontWeight:600}}>{cat}</span>;
};
const SBadge = ({status}) => {
  const s = SM[status]||SM.Completed;
  return <span style={{background:s.color+"22",color:s.color,padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600}}>{s.icon} {s.label}</span>;
};
const Lbl = ({c}) => <label style={{display:"block",fontSize:11,fontWeight:600,color:"var(--tx3,#6a6a9a)",marginBottom:5,textTransform:"uppercase",letterSpacing:".05em"}}>{c}</label>;
const Err = ({m}) => m ? <p style={{color:"#ef4444",fontSize:11,marginTop:4}}>⚠ {m}</p> : null;

function MHead({title, onClose}) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid var(--bd,#252535)"}}>
      <span style={{fontWeight:700,fontSize:15,color:"var(--tx,#e8e8f2)"}}>{title}</span>
      <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"var(--tx3,#6a6a9a)",fontSize:20,lineHeight:1,padding:"2px 6px"}}>×</button>
    </div>
  );
}
function Modal({children, onClose}) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.65)",padding:16,backdropFilter:"blur(4px)"}}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()}
        style={{background:"var(--sf,#12121e)",border:"1px solid var(--bd,#252535)",borderRadius:16,
          boxShadow:"0 24px 80px rgba(0,0,0,.6)",color:"var(--tx,#e8e8f2)",maxWidth:580,width:"100%",maxHeight:"92vh",overflowY:"auto"}}>
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({title, message, confirmLabel="Confirmar", confirmVariant="danger", onConfirm, onClose}) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.72)",padding:16}}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()}
        style={{background:"var(--sf,#12121e)",border:"1px solid var(--bd,#252535)",borderRadius:14,
          boxShadow:"0 24px 60px rgba(0,0,0,.6)",width:"100%",maxWidth:420,overflow:"hidden"}}>
        <div style={{padding:"18px 20px 14px",borderBottom:"1px solid var(--bd,#252535)",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>{confirmVariant==="danger"?"🗑️":"⚠️"}</span>
          <span style={{fontWeight:700,fontSize:15,color:"var(--tx,#e8e8f2)"}}>{title}</span>
        </div>
        <div style={{padding:"16px 20px"}}>
          <p style={{color:"var(--tx3,#6a6a9a)",fontSize:13,lineHeight:1.6,marginBottom:20}}>{message}</p>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <button style={SB("ghost")} onClick={onClose}>Cancelar</button>
            <button style={SB(confirmVariant)} onClick={()=>{onConfirm();onClose();}}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MultiSelect({options, value, onChange, placeholder="Seleccionar…"}) {
  const [open,setOpen] = useState(false);
  const [q,setQ]       = useState("");
  const ref            = useRef();
  useEffect(()=>{
    const h = e => { if(ref.current&&!ref.current.contains(e.target)){setOpen(false);setQ("");} };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);
  const filtered = options.filter(o=>o.name.toLowerCase().includes(q.toLowerCase()));
  const toggle   = id => onChange(value.includes(id)?value.filter(v=>v!==id):[...value,id]);
  const selected = options.filter(o=>value.includes(o.id));
  return (
    <div ref={ref} style={{position:"relative",width:"100%"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{...SI({cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",minHeight:38,userSelect:"none"})}}>
        <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:selected.length?"var(--tx,#e8e8f2)":"var(--tx3,#6a6a9a)",fontSize:13}}>
          {selected.length ? selected.map(o=>o.name).join(", ") : placeholder}
        </span>
        <span style={{display:"flex",alignItems:"center",gap:4,marginLeft:6,flexShrink:0}}>
          {value.length>0&&<span style={{background:"var(--ac,#6366f1)",color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10}}>{value.length}</span>}
          <span style={{color:"var(--tx3,#6a6a9a)",fontSize:10}}>{open?"▲":"▼"}</span>
        </span>
      </div>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:300,background:"var(--sf,#12121e)",border:"1px solid var(--bd,#252535)",borderRadius:10,boxShadow:"0 8px 32px rgba(0,0,0,.4)",overflow:"hidden",marginTop:4}}>
          <div style={{padding:"8px 10px",borderBottom:"1px solid var(--bd,#252535)"}}>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar…" style={SI({padding:"6px 10px",fontSize:12})} onClick={e=>e.stopPropagation()}/>
          </div>
          <div style={{maxHeight:180,overflowY:"auto"}}>
            {filtered.map(o=>(
              <div key={o.id} onClick={()=>toggle(o.id)}
                style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",cursor:"pointer",background:value.includes(o.id)?"rgba(99,102,241,.18)":"transparent"}}
                onMouseEnter={e=>e.currentTarget.style.background=value.includes(o.id)?"rgba(99,102,241,.28)":"rgba(255,255,255,.04)"}
                onMouseLeave={e=>e.currentTarget.style.background=value.includes(o.id)?"rgba(99,102,241,.18)":"transparent"}>
                <div style={{width:15,height:15,borderRadius:4,border:`2px solid ${value.includes(o.id)?"var(--ac,#6366f1)":"var(--tx3,#6a6a9a)"}`,background:value.includes(o.id)?"var(--ac,#6366f1)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {value.includes(o.id)&&<span style={{color:"#fff",fontSize:9,lineHeight:1}}>✓</span>}
                </div>
                <span style={{fontSize:13,color:"var(--tx,#e8e8f2)"}}>{o.name}</span>
              </div>
            ))}
          </div>
          {value.length>0&&<div style={{borderTop:"1px solid var(--bd,#252535)",padding:"6px 12px"}}>
            <button onClick={()=>{onChange([]);setQ("");}} style={{...SB("ghost",{fontSize:11,padding:"2px 8px",color:"#ef4444"})}}>Limpiar</button>
          </div>}
        </div>
      )}
    </div>
  );
}

function JiraTagInput({value, onChange}) {
  const [draft,setDraft] = useState("");
  const [err,setErr]     = useState("");
  const add = k => {
    const key = (k||"").trim().toUpperCase();
    if(!key) return;
    if(!isJira(key)){setErr(`Inválido: "${key}" — usa PROYECTO-123`);return;}
    if(value.includes(key)){setErr("Ya añadido");return;}
    onChange([...value,key]); setDraft(""); setErr("");
  };
  return (
    <div>
      <div style={{...SI({minHeight:42,display:"flex",flexWrap:"wrap",gap:4,alignItems:"center",padding:"6px 10px",cursor:"text"})}}
        onClick={()=>document.getElementById("jtag")?.focus()}>
        {value.map(k=>(
          <span key={k} style={{background:"rgba(99,102,241,.22)",color:"var(--ac,#6366f1)",padding:"2px 8px",borderRadius:6,fontSize:12,fontFamily:"monospace",display:"flex",alignItems:"center",gap:4}}>
            {k}<span onClick={()=>onChange(value.filter(v=>v!==k))} style={{cursor:"pointer",opacity:.7,fontSize:14,lineHeight:1}}>×</span>
          </span>
        ))}
        <input id="jtag" value={draft}
          onChange={e=>{setDraft(e.target.value.toUpperCase());setErr("");}}
          onKeyDown={e=>{
            if(["Enter","Tab",","," "].includes(e.key)){e.preventDefault();add(draft);}
            if(e.key==="Backspace"&&!draft&&value.length) onChange(value.slice(0,-1));
          }}
          onBlur={()=>{if(draft.trim()) add(draft);}}
          placeholder={value.length?"":"PROJ-123 → Enter para añadir"}
          style={{background:"transparent",border:"none",outline:"none",fontSize:13,color:"var(--tx,#e8e8f2)",fontFamily:"monospace",flex:1,minWidth:140,padding:"2px 0"}}/>
      </div>
      <Err m={err}/>
    </div>
  );
}

function DatePicker({value, onChange, ress, envId, excludeId}) {
  const parsed = value ? new Date(value) : null;
  const [open,setOpen]           = useState(false);
  const [viewYear,setViewYear]   = useState((parsed||new Date()).getFullYear());
  const [viewMonth,setViewMonth] = useState((parsed||new Date()).getMonth());
  const [timeVal,setTimeVal]     = useState(parsed ? `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}` : "09:00");
  const trigRef = useRef(); const panelRef = useRef();
  const [coords,setCoords] = useState({top:0,left:0});

  useEffect(()=>{
    const h = e => {
      if(open && trigRef.current && !trigRef.current.contains(e.target) && panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[open]);

  const busyDays = useMemo(()=>{
    if(!envId) return new Set();
    const busy = new Set();
    ress.filter(r=>r.environment_id===envId&&r.id!==excludeId&&["Reserved","InUse","PolicyViolation"].includes(r.status))
      .forEach(r=>{
        let cur = new Date(r.planned_start); cur.setHours(0,0,0,0);
        const end = new Date(r.planned_end);
        while(cur<=end){ busy.add(`${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`); cur=new Date(cur.getTime()+86400000); }
      });
    return busy;
  },[ress,envId,excludeId]);

  const today = useMemo(()=>{ const d=new Date(); d.setHours(0,0,0,0); return d; },[]);
  const firstWd = new Date(viewYear,viewMonth,1).getDay();
  const startOff = (firstWd+6)%7;
  const daysInM  = new Date(viewYear,viewMonth+1,0).getDate();

  const apply = (day, t) => {
    const d = new Date(viewYear,viewMonth,day);
    const [hh,mm] = (t||timeVal).split(":").map(Number);
    d.setHours(hh,mm,0,0);
    onChange(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(hh)}:${pad(mm)}`);
    setOpen(false);
  };
  const handleTime = t => {
    setTimeVal(t);
    if(parsed){ const d=new Date(parsed); const [hh,mm]=t.split(":").map(Number); d.setHours(hh,mm,0,0); onChange(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(hh)}:${pad(mm)}`); }
  };
  const openPicker = ()=>{
    if(trigRef.current){ const r=trigRef.current.getBoundingClientRect(); const spaceBelow=window.innerHeight-r.bottom; const ph=310;
      setCoords({top:spaceBelow>ph?r.bottom+4:r.top-ph-4, left:Math.min(r.left,window.innerWidth-268)}); }
    setOpen(o=>!o);
  };
  const display = parsed ? parsed.toLocaleString("es-ES",{dateStyle:"short",timeStyle:"short"}) : "Seleccionar…";
  return (
    <>
      <div ref={trigRef} onClick={openPicker}
        style={{...SI({cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",userSelect:"none",borderColor:open?"var(--ac,#6366f1)":"var(--bd,#252535)"})}}>
        <span style={{color:parsed?"var(--tx,#e8e8f2)":"var(--tx3,#6a6a9a)",fontSize:13}}>{display}</span>
        <span style={{fontSize:13,color:"var(--tx3,#6a6a9a)",marginLeft:6}}>📅</span>
      </div>
      {open&&(
        <div ref={panelRef} style={{position:"fixed",top:coords.top,left:coords.left,width:260,zIndex:9998,
          background:"var(--sf,#12121e)",border:"1px solid var(--bd,#252535)",borderRadius:12,
          boxShadow:"0 16px 48px rgba(0,0,0,.6)",padding:12}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <button onClick={()=>viewMonth===0?setViewMonth(11)||setViewYear(y=>y-1):setViewMonth(m=>m-1)}
              style={SB("ghost",{padding:"2px 8px",fontSize:15,lineHeight:1})}>‹</button>
            <span style={{fontWeight:700,fontSize:13,color:"var(--tx,#e8e8f2)"}}>{MONTHS_ES[viewMonth]} {viewYear}</span>
            <button onClick={()=>viewMonth===11?setViewMonth(0)||setViewYear(y=>y+1):setViewMonth(m=>m+1)}
              style={SB("ghost",{padding:"2px 8px",fontSize:15,lineHeight:1})}>›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:4}}>
            {DAYS_ES.map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:"var(--tx3,#6a6a9a)",padding:"2px 0"}}>{d}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
            {Array.from({length:startOff}).map((_,i)=><div key={"e"+i}/>)}
            {Array.from({length:daysInM}).map((_,i)=>{
              const day=i+1, dayDate=new Date(viewYear,viewMonth,day), dayKey=`${viewYear}-${viewMonth}-${day}`;
              const isPast=dayDate<today, isBusy=!isPast&&envId&&busyDays.has(dayKey);
              const isSel=parsed&&parsed.getFullYear()===viewYear&&parsed.getMonth()===viewMonth&&parsed.getDate()===day;
              const isToday=dayDate.getTime()===today.getTime();
              let bg="transparent",fg="var(--tx,#e8e8f2)",brd="transparent",cursor="pointer";
              if(isSel){bg="var(--ac,#6366f1)";fg="#fff";}
              else if(isPast){fg="rgba(106,106,154,.4)";cursor="default";}
              else if(isBusy){bg="rgba(239,68,68,.18)";fg="#f87171";brd="rgba(239,68,68,.4)";cursor="not-allowed";}
              else{bg="rgba(34,197,94,.15)";fg="#4ade80";brd="rgba(34,197,94,.35)";}
              if(isToday&&!isSel) brd="var(--ac,#6366f1)";
              return(
                <div key={day} onClick={()=>{ if(!isPast&&!isBusy) apply(day); }}
                  style={{textAlign:"center",padding:"4px 0",borderRadius:6,fontSize:12,fontWeight:isSel||isToday?700:400,
                    background:bg,color:fg,cursor,border:`1px solid ${brd}`,transition:"all .1s"}}>
                  {day}
                </div>
              );
            })}
          </div>
          <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid var(--bd,#252535)",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:11,color:"var(--tx3,#6a6a9a)",fontWeight:600,textTransform:"uppercase",letterSpacing:".04em",whiteSpace:"nowrap"}}>Hora</span>
            <input type="time" value={timeVal} onChange={e=>handleTime(e.target.value)} style={SI({flex:1,padding:"5px 8px",fontSize:13})}/>
          </div>
          {envId&&(
            <div style={{display:"flex",gap:14,marginTop:8,fontSize:10}}>
              <span style={{display:"flex",alignItems:"center",gap:4,color:"#4ade80"}}>
                <span style={{width:10,height:10,borderRadius:3,background:"rgba(34,197,94,.2)",border:"1px solid #4ade80",display:"inline-block"}}/>Disponible
              </span>
              <span style={{display:"flex",alignItems:"center",gap:4,color:"#f87171"}}>
                <span style={{width:10,height:10,borderRadius:3,background:"rgba(239,68,68,.2)",border:"1px solid #f87171",display:"inline-block"}}/>Ocupado
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── ColorPicker ───────────────────────────────────────────────────────────────
function ColorPicker({value, onChange}) {
  const [open,setOpen] = useState(false);
  const ref = useRef();
  useEffect(()=>{ const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);}; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); },[]);
  return(
    <div ref={ref} style={{position:"relative",display:"inline-block"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{width:36,height:36,borderRadius:8,background:value||"#6366f1",cursor:"pointer",border:"2px solid var(--bd,#252535)",boxShadow:`0 0 0 2px ${value||"#6366f1"}44`}}/>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 8px)",left:0,zIndex:600,background:"var(--sf,#12121e)",border:"1px solid var(--bd,#252535)",borderRadius:12,padding:12,boxShadow:"0 12px 40px rgba(0,0,0,.5)",width:224}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:5}}>
            {ENV_PALETTE.map(c=><div key={c} onClick={()=>{onChange(c);setOpen(false);}} style={{width:22,height:22,borderRadius:5,background:c,cursor:"pointer",border:value===c?"2px solid #fff":"2px solid transparent",transform:value===c?"scale(1.15)":"scale(1)",transition:"all .1s"}}/>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Formulario de reserva ─────────────────────────────────────────────────────
export function ResForm({res, envs, repos, ress, currentUser, policy, onSave, onClose}) {
  const isEdit = !!res;
  const [envId, setEnvId]  = useState(res?.environment_id||"");
  const [jiras, setJiras]  = useState(res?.jira_issue_keys||[]);
  const [desc,  setDesc]   = useState(res?.description||"");
  const [start, setStart]  = useState(res?.planned_start?res.planned_start.slice(0,16):"");
  const [end,   setEnd]    = useState(res?.planned_end?res.planned_end.slice(0,16):"");
  const [rids,  setRids]   = useState(res?.selected_repository_ids||[]);
  const [errors,setErrors] = useState({});
  const selEnv = envs.find(e=>e.id===envId);
  const isAdmin = currentUser.role==="admin";

  const validate = () => {
    const e={};
    if(!envId) e.env="Selecciona un entorno";
    if(!jiras.length) e.jiras="Añade al menos una clave Jira";
    if(selEnv?.is_locked&&!isAdmin) e.env="Entorno bloqueado por admin";
    if(!start) e.start="Requerido";
    if(!end)   e.end="Requerido";
    if(start&&end){
      const sD=new Date(start),eD=new Date(end),n=new Date();
      if(sD>=eD) e.end="El fin debe ser posterior al inicio";
      else if(eD<=n) e.end="El fin debe ser en el futuro";
      else {
        if(!isAdmin&&policy?.booking_window_days){
          const max=new Date(n.getTime()+policy.booking_window_days*86400000);
          if(eD>max) e.end=`Máximo ${policy.booking_window_days} días por adelantado`;
        }
        if(selEnv&&!e.end){
          const dur=durH(start,end);
          if(dur>selEnv.max_reservation_duration) e.end=`Excede max ${selEnv.max_reservation_duration}h`;
          if(policy&&dur<policy.min_duration_hours) e.end=`Mín ${policy.min_duration_hours}h`;
        }
        if(envId&&!e.end){
          const ov=checkOverlap(ress,envId,start,end,res?.id);
          if(ov.length) e.overlap=`Solapamiento con: ${ov.map(r=>(r.jira_issue_keys||[]).join(",")).join(" / ")}`;
        }
      }
    }
    return e;
  };

  const handleSave = () => {
    const errs=validate(); if(Object.keys(errs).length){setErrors(errs);return;}
    const sD=new Date(start),n=new Date();
    const status  = isEdit ? res.status : sD<=n?"InUse":"Reserved";
    const session = isEdit ? res.usage_session : sD<=n?{actual_start:sD.toISOString(),actual_end:null,branches:[]}:null;
    onSave({
      id:res?.id||uid(), environment_id:envId,
      reserved_by_user_id:res?.reserved_by_user_id||currentUser.id,
      jira_issue_keys:jiras, description:desc.trim(),
      planned_start:new Date(start).toISOString(), planned_end:new Date(end).toISOString(),
      status, selected_repository_ids:rids, usage_session:session,
      policy_flags:{exceedsMaxDuration:false},
    });
  };

  return(
    <Modal onClose={onClose}>
      <MHead title={isEdit?"Editar Reserva":"Nueva Reserva"} onClose={onClose}/>
      <div style={{padding:20}}>
        <div style={{marginBottom:14}}>
          <Lbl c="Entorno"/>
          <select style={SI()} value={envId} onChange={e=>setEnvId(e.target.value)}>
            <option value="">Selecciona entorno…</option>
            {envs.filter(e=>!e.is_archived&&(isAdmin||!e.is_locked)).map(e=>(
              <option key={e.id} value={e.id}>{e.is_locked?"🔒 ":""}{e.name} ({e.category}) — max {e.max_reservation_duration}h</option>
            ))}
          </select>
          <Err m={errors.env}/>
        </div>
        <div style={{marginBottom:14}}>
          <Lbl c="Claves Jira"/>
          <JiraTagInput value={jiras} onChange={setJiras}/>
          <p style={{fontSize:11,color:"var(--tx3,#6a6a9a)",marginTop:3}}>Enter · Tab · Espacio para añadir</p>
          <Err m={errors.jiras}/>
        </div>
        <div style={{marginBottom:14}}>
          <Lbl c="Descripción"/>
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={2} style={SI({resize:"vertical",lineHeight:1.55})} placeholder="Propósito de la reserva…"/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{marginBottom:14}}>
            <Lbl c="Inicio planificado"/>
            <DatePicker value={start} onChange={setStart} ress={ress} envId={envId} excludeId={res?.id}/>
            <Err m={errors.start}/>
          </div>
          <div style={{marginBottom:14}}>
            <Lbl c="Fin planificado"/>
            <DatePicker value={end} onChange={setEnd} ress={ress} envId={envId} excludeId={res?.id}/>
            <Err m={errors.end}/>
          </div>
        </div>
        {errors.overlap&&<div style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",borderRadius:8,padding:"8px 12px",color:"#ef4444",fontSize:12,marginBottom:12}}>⛔ {errors.overlap}</div>}
        <div style={{marginBottom:14}}>
          <Lbl c="Repositorios"/>
          <MultiSelect options={repos.filter(r=>!r.is_archived)} value={rids} onChange={setRids} placeholder="Buscar repositorios…"/>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:8}}>
          <button style={SB("ghost")} onClick={onClose}>Cancelar</button>
          <button style={SB()} onClick={handleSave}>{isEdit?"Actualizar":"Crear Reserva"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Detalle de reserva ────────────────────────────────────────────────────────
export function ResDetail({res, envs, repos, users, currentUser, onClose, onEdit, onCancel, onCheckIn, onCheckOut, onAddBranch}) {
  const env     = envs.find(e=>e.id===res.environment_id);
  const owner   = users.find(u=>u.id===res.reserved_by_user_id);
  const isOwner = currentUser.id===res.reserved_by_user_id;
  const isAdmin = currentUser.role==="admin";
  const [nb,setNb]     = useState("");
  const [showB,setShowB] = useState(false);
  const repoNames = (res.selected_repository_ids||[]).map(id=>repos.find(r=>r.id===id)?.name).filter(Boolean);
  const canEdit   = (isOwner||isAdmin)&&["Reserved","PolicyViolation","InUse"].includes(res.status);
  const canCI     = isOwner&&res.status==="Reserved";
  const canCO     = isOwner&&res.status==="InUse";
  const canCancel = (isOwner||isAdmin)&&["Reserved","InUse","PolicyViolation"].includes(res.status);
  const IR = ({l,v,mono}) => (
    <div style={{marginBottom:8}}>
      <span style={{fontSize:10,color:"var(--tx3,#6a6a9a)",fontWeight:700,display:"block",textTransform:"uppercase",letterSpacing:".04em"}}>{l}</span>
      <span style={{color:"var(--tx,#e8e8f2)",fontSize:13,fontFamily:mono?"monospace":"inherit"}}>{v||"—"}</span>
    </div>
  );
  return(
    <Modal onClose={onClose}>
      <MHead title="Detalle de Reserva" onClose={onClose}/>
      <div style={{padding:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <CatBadge cat={env?.category}/><span style={{fontWeight:700,fontSize:16,color:"var(--tx,#e8e8f2)"}}>{env?.name}</span>
          </div>
          <SBadge status={res.status}/>
        </div>
        {res.policy_flags?.exceedsMaxDuration&&(
          <div style={{background:"rgba(249,115,22,.1)",border:"1px solid rgba(249,115,22,.3)",borderRadius:8,padding:"10px 14px",color:"#fb923c",fontSize:13,marginBottom:14}}>
            ⚠️ <strong>Requiere atención admin</strong> — Excede la duración máxima del entorno.
          </div>
        )}
        <div style={{marginBottom:12}}>
          <span style={{fontSize:10,color:"var(--tx3,#6a6a9a)",fontWeight:700,display:"block",textTransform:"uppercase",letterSpacing:".04em",marginBottom:5}}>Claves Jira</span>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {(res.jira_issue_keys||[]).map(k=><span key={k} style={{background:"rgba(99,102,241,.2)",color:"var(--ac,#6366f1)",padding:"3px 10px",borderRadius:6,fontSize:12,fontFamily:"monospace"}}>{k}</span>)}
          </div>
        </div>
        {res.description&&<div style={{marginBottom:12,background:"var(--sf2,#1a1a28)",border:"1px solid var(--bd,#252535)",borderRadius:8,padding:"10px 12px"}}>
          <span style={{fontSize:10,color:"var(--tx3,#6a6a9a)",fontWeight:700,display:"block",textTransform:"uppercase",letterSpacing:".04em",marginBottom:4}}>Descripción</span>
          <span style={{color:"var(--tx,#e8e8f2)",fontSize:13,lineHeight:1.6}}>{res.description}</span>
        </div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <IR l="Responsable" v={owner?.name||owner?.email}/>
          <IR l="Duración" v={`${durH(res.planned_start,res.planned_end).toFixed(1)}h`}/>
          <IR l="Inicio planificado" v={fmtDt(res.planned_start)}/>
          <IR l="Fin planificado" v={fmtDt(res.planned_end)}/>
          {res.usage_session&&<>
            <IR l="Inicio real" v={fmtDt(res.usage_session.actual_start)}/>
            <IR l="Fin real" v={fmtDt(res.usage_session.actual_end)||"—"}/>
          </>}
        </div>
        {repoNames.length>0&&<div style={{marginBottom:10}}>
          <span style={{fontSize:10,color:"var(--tx3,#6a6a9a)",fontWeight:700,display:"block",textTransform:"uppercase",letterSpacing:".04em",marginBottom:4}}>Repositorios</span>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {repoNames.map(n=><span key={n} style={{background:"var(--bd,#252535)",color:"var(--tx,#e8e8f2)",padding:"2px 8px",borderRadius:4,fontSize:12}}>📦 {n}</span>)}
          </div>
        </div>}
        {res.usage_session?.branches?.length>0&&<div style={{marginBottom:10}}>
          <span style={{fontSize:10,color:"var(--tx3,#6a6a9a)",fontWeight:700,display:"block",textTransform:"uppercase",letterSpacing:".04em",marginBottom:4}}>Ramas</span>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {res.usage_session.branches.map(b=><span key={b} style={{background:"rgba(99,102,241,.15)",color:"#a5b4fc",padding:"2px 8px",borderRadius:4,fontSize:12,fontFamily:"monospace"}}>{b}</span>)}
          </div>
        </div>}
        {res.status==="InUse"&&isOwner&&<div style={{marginTop:10,borderTop:"1px solid var(--bd,#252535)",paddingTop:10}}>
          {showB?(
            <div style={{display:"flex",gap:8}}>
              <input style={SI({flex:1,fontFamily:"monospace"})} value={nb} onChange={e=>setNb(e.target.value)} autoFocus placeholder="nombre-rama"
                onKeyDown={e=>{if(e.key==="Enter"&&nb.trim()){onAddBranch(res.id,nb.trim());setNb("");setShowB(false);}}}/>
              <button style={SB()} onClick={()=>{if(nb.trim()){onAddBranch(res.id,nb.trim());setNb("");setShowB(false);}}}>Añadir</button>
              <button style={SB("ghost")} onClick={()=>setShowB(false)}>×</button>
            </div>
          ):(
            <button style={SB("outline",{fontSize:12})} onClick={()=>setShowB(true)}>+ Añadir rama</button>
          )}
        </div>}
        {env?.url&&<div style={{marginTop:14,borderTop:"1px solid var(--bd,#252535)",paddingTop:14}}>
          <a href={env.url} target="_blank" rel="noopener noreferrer"
            style={{...SB("primary",{display:"inline-flex",alignItems:"center",gap:6,textDecoration:"none",width:"100%",justifyContent:"center",padding:"9px 14px",fontSize:14})}}>
            🔗 Acceder al entorno
          </a>
        </div>}
        {(canEdit||canCI||canCO||canCancel)&&<div style={{marginTop:10,display:"flex",flexWrap:"wrap",gap:8}}>
          {canEdit  &&<button style={SB()} onClick={()=>onEdit(res)}>✏️ Editar</button>}
          {canCI    &&<button style={SB("success")} onClick={()=>onCheckIn(res.id)}>▶ Iniciar</button>}
          {canCO    &&<button style={SB("warning")} onClick={()=>onCheckOut(res.id)}>⏹ Finalizar</button>}
          {canCancel&&<button style={SB("danger")} onClick={()=>onCancel(res.id)}>✕ Cancelar</button>}
        </div>}
      </div>
    </Modal>
  );
}

// ── Timeline Gantt ─────────────────────────────────────────────────────────────
const SCALE_MODES = {
  hours: { label:"Horas",   pxH:160, winH:24,    major:3600000,      minor:null,          fmtMajor:d=>`${pad(d.getHours())}:00`,  fmtDay:d=>d.toLocaleDateString("es-ES",{weekday:"short",day:"numeric",month:"short"}) },
  days:  { label:"Días",    pxH:80,  winH:7*24,  major:86400000,     minor:3*3600000,     fmtMajor:d=>pad(d.getHours())+"h",       fmtDay:d=>d.toLocaleDateString("es-ES",{weekday:"short",day:"numeric",month:"short"}) },
  weeks: { label:"Semanas", pxH:20,  winH:28*24, major:86400000,     minor:null,          fmtMajor:d=>d.toLocaleDateString("es-ES",{day:"numeric",month:"short"}), fmtDay:d=>d.toLocaleDateString("es-ES",{month:"short",year:"2-digit"}) },
  months:{ label:"Meses",   pxH:6,   winH:90*24, major:7*86400000,   minor:null,          fmtMajor:d=>`S${Math.ceil(d.getDate()/7)}`, fmtDay:d=>d.toLocaleDateString("es-ES",{month:"long",year:"numeric"}) },
};
const LBL_W=148, ROW_H=60, DAY_H=24, HR_H=22, HDR_H=46, SNAP=0.5;

function Timeline({envs, ress, repos, users, currentUser, onResClick, onNew, onResUpdate, policy}) {
  const [fCat,  setFCat]  = useState("ALL");
  const [fUser, setFUser] = useState("ALL");
  const [fJira, setFJira] = useState("");
  const [winOff,setWinOff]= useState(-1);
  const [scaleKey,setScaleKey] = useState("days");
  const scale = SCALE_MODES[scaleKey];
  const scrollRef = useRef(); const dragRef = useRef(null);
  const winStart = useMemo(()=>{ const d=new Date(); d.setHours(0,0,0,0); return new Date(d.getTime()+winOff*86400000); },[winOff]);
  const winEnd   = useMemo(()=>new Date(winStart.getTime()+scale.winH*3600000),[winStart,scale.winH]);
  const totalW   = scale.winH * scale.pxH;
  useEffect(()=>{ const nowX=(new Date()-winStart)/3600000*scale.pxH; if(scrollRef.current) scrollRef.current.scrollLeft=Math.max(0,nowX-120); },[winStart,scale.pxH]);
  const nowX = (new Date()-winStart)/3600000*scale.pxH;
  const filtEnvs = useMemo(()=>envs.filter(e=>!e.is_archived&&(fCat==="ALL"||e.category===fCat)),[envs,fCat]);
  const getEnvRes = envId => ress.filter(r=>{
    if(r.environment_id!==envId) return false;
    if(fUser!=="ALL"&&r.reserved_by_user_id!==fUser) return false;
    if(fJira&&!(r.jira_issue_keys||[]).some(k=>k.toLowerCase().includes(fJira.toLowerCase()))) return false;
    return new Date(r.planned_start)<winEnd && new Date(r.planned_end)>winStart;
  });
  const majorTicks = useMemo(()=>{ const ticks=[]; let d=new Date(winStart); if(scaleKey==="hours") d.setMinutes(0,0,0); else d.setHours(0,0,0,0); if(scaleKey==="months"){while(d.getDay()!==1) d=new Date(d.getTime()+86400000);} while(d<winEnd){ticks.push(new Date(d));d=new Date(d.getTime()+scale.major);} return ticks; },[winStart,winEnd,scaleKey,scale]);
  const minorTicks = useMemo(()=>{ if(!scale.minor) return []; const ticks=[]; let d=new Date(winStart); while(d<winEnd){ticks.push(new Date(d));d=new Date(d.getTime()+scale.minor);} return ticks; },[winStart,winEnd,scale]);

  const startDrag = useCallback((e, res, type) => {
    if(!["Reserved","PolicyViolation","InUse"].includes(res.status)) return;
    const isAdmin=currentUser.role==="admin", isOwner=currentUser.id===res.reserved_by_user_id;
    if(!isOwner&&!isAdmin) return;
    e.preventDefault(); e.stopPropagation();
    const startX=e.clientX, origStart=new Date(res.planned_start), origEnd=new Date(res.planned_end), dur=origEnd-origStart;
    dragRef.current={type,resId:res.id,moved:false};
    const onMove=me=>{ const dx=me.clientX-startX; if(Math.abs(dx)<4) return; dragRef.current.moved=true;
      const dh=Math.round((dx/scale.pxH)/SNAP)*SNAP;
      if(type==="move"){ dragRef.current.newStart=new Date(origStart.getTime()+dh*3600000); dragRef.current.newEnd=new Date(origStart.getTime()+dh*3600000+dur); }
      else dragRef.current.newEnd=new Date(origEnd.getTime()+dh*3600000); };
    const onUp=()=>{ document.removeEventListener("mousemove",onMove); document.removeEventListener("mouseup",onUp);
      const st=dragRef.current; if(!st||!st.moved){dragRef.current=null;return;} dragRef.current=null;
      const {newStart,newEnd}=st;
      if(type==="move"&&newStart&&newEnd){ if(newEnd<=new Date()){alert("No se puede mover: el fin quedaría en el pasado.");return;}
        const ov=checkOverlap(ress,res.environment_id,newStart.toISOString(),newEnd.toISOString(),res.id); if(ov.length){alert(`Solapamiento con: ${ov.map(r=>r.jira_issue_keys.join(",")).join(", ")}`);return;}
        onResUpdate(res.id,{planned_start:newStart.toISOString(),planned_end:newEnd.toISOString()}); }
      else if(type==="resize"&&newEnd){ if(newEnd<=origStart||newEnd<=new Date()){alert("Fecha inválida.");return;}
        const env=envs.find(ev=>ev.id===res.environment_id); if(env&&durH(origStart.toISOString(),newEnd.toISOString())>env.max_reservation_duration){alert(`Excede max ${env.max_reservation_duration}h`);return;}
        const ov=checkOverlap(ress,res.environment_id,res.planned_start,newEnd.toISOString(),res.id); if(ov.length){alert("El redimensionado solaparía otra reserva.");return;}
        onResUpdate(res.id,{planned_end:newEnd.toISOString()}); } };
    document.addEventListener("mousemove",onMove); document.addEventListener("mouseup",onUp);
  },[currentUser,ress,envs,onResUpdate,scale.pxH]);

  const handleBlockClick = (e, res) => { if(dragRef.current?.moved) return; onResClick(res); };
  const navStep = scaleKey==="hours"?1:scaleKey==="days"?7:scaleKey==="weeks"?28:90;

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {/* Filtros */}
      <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:6,padding:"8px 14px",borderBottom:"1px solid var(--bd,#252535)",background:"var(--sf,#12121e)",flexShrink:0}}>
        <select style={SI({width:130})} value={fCat} onChange={e=>setFCat(e.target.value)}>
          <option value="ALL">Todas las categorías</option>
          <option value="DEV">DEV</option><option value="PRE">PRE</option><option value="STAGING">STAGING</option>
        </select>
        <select style={SI({width:140})} value={fUser} onChange={e=>setFUser(e.target.value)}>
          <option value="ALL">Todos los usuarios</option>
          {users.map(u=><option key={u.id} value={u.id}>{u.name||u.email}</option>)}
        </select>
        <input style={SI({width:120})} placeholder="Jira…" value={fJira} onChange={e=>setFJira(e.target.value)}/>
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          <button style={SB("ghost")} onClick={()=>setWinOff(w=>w-navStep)}>◀</button>
          <button style={SB("ghost")} onClick={()=>setWinOff(-1)}>Hoy</button>
          <button style={SB("ghost")} onClick={()=>setWinOff(w=>w+navStep)}>▶</button>
          <button style={{...SB(),marginLeft:8}} onClick={onNew}>+ Nueva reserva</button>
        </div>
      </div>
      <div style={{flex:1,overflow:"hidden",display:"flex"}}>
        {/* Etiquetas izquierda */}
        <div style={{width:LBL_W,flexShrink:0,borderRight:"1px solid var(--bd,#252535)",background:"var(--sf,#12121e)"}}>
          <div style={{height:HDR_H,borderBottom:"1px solid var(--bd,#252535)",display:"flex",alignItems:"center",padding:"0 12px"}}>
            <span style={{fontSize:10,fontWeight:700,color:"var(--tx3,#6a6a9a)",textTransform:"uppercase",letterSpacing:".05em"}}>Entorno</span>
          </div>
          {filtEnvs.map(env=>{
            const envColor = env.color||(CC[env.category]||CC.DEV).bar;
            return(
              <div key={env.id} style={{height:ROW_H,borderBottom:"1px solid var(--bd,#252535)",display:"flex",alignItems:"center",padding:"0 10px",gap:8,
                background:env.is_locked?"rgba(251,191,36,.06)":"transparent"}}>
                <div style={{width:3,height:26,borderRadius:2,background:envColor,flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:12,color:"var(--tx,#e8e8f2)",lineHeight:1.2,display:"flex",alignItems:"center",gap:4}}>
                    {env.name}{env.is_locked&&<span title="Bloqueado" style={{fontSize:11}}>🔒</span>}
                  </div>
                  <div style={{marginTop:3,display:"flex",alignItems:"center",gap:5}}>
                    <CatBadge cat={env.category}/>
                    {env.url&&<a href={env.url} target="_blank" rel="noopener noreferrer"
                      style={{display:"inline-flex",alignItems:"center",gap:3,background:"rgba(99,102,241,.15)",color:"#a5b4fc",padding:"1px 6px",borderRadius:6,fontSize:10,fontWeight:600,textDecoration:"none",border:"1px solid rgba(99,102,241,.3)"}}
                      onClick={e=>e.stopPropagation()}>🔗</a>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {/* Canvas scrollable */}
        <div style={{flex:1,overflowX:"auto",overflowY:"auto"}} ref={scrollRef}>
          <div style={{width:totalW,position:"relative",minHeight:HDR_H+filtEnvs.length*ROW_H}}>
            {/* Header sticky */}
            <div style={{height:HDR_H,position:"sticky",top:0,zIndex:20,background:"var(--sf,#12121e)",borderBottom:"1px solid var(--bd,#252535)"}}>
              <div style={{height:DAY_H,position:"relative",borderBottom:"1px solid var(--bd,#252535)",overflow:"hidden"}}>
                {majorTicks.map((d,i)=>{
                  const x=(d-winStart)/3600000*scale.pxH, w=scale.major/3600000*scale.pxH, isNow=d.toDateString()===new Date().toDateString();
                  return(<div key={i} style={{position:"absolute",left:x,width:w,top:0,height:DAY_H,display:"flex",alignItems:"center",paddingLeft:6,
                    borderLeft:i>0?"1px solid rgba(99,102,241,.35)":"none",background:isNow?"rgba(99,102,241,.07)":"transparent"}}>
                    <span style={{fontSize:10,fontWeight:500,color:"var(--tx,#e8e8f2)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",userSelect:"none"}}>
                      {scale.fmtDay(d)}{isNow&&scaleKey==="days"&&<span style={{marginLeft:4,background:"var(--ac,#6366f1)",color:"#fff",fontSize:9,padding:"1px 4px",borderRadius:4,fontWeight:700}}>HOY</span>}
                    </span>
                  </div>);
                })}
              </div>
              <div style={{height:HR_H,position:"relative",overflow:"hidden"}}>
                {(minorTicks.length?minorTicks:majorTicks).map((d,i)=>{
                  const x=(d-winStart)/3600000*scale.pxH;
                  return(<div key={i} style={{position:"absolute",left:x,top:0,height:"100%"}}>
                    <div style={{position:"absolute",left:0,top:0,width:1,height:"100%",background:"rgba(255,255,255,.04)"}}/>
                    <span style={{position:"absolute",top:4,left:4,fontSize:10,color:"rgba(106,106,154,.9)",userSelect:"none",whiteSpace:"nowrap"}}>{scale.fmtMajor(d)}</span>
                  </div>);
                })}
                {nowX>0&&nowX<totalW&&<div style={{position:"absolute",left:nowX,top:0,height:"100%",width:2,background:"#ef4444",opacity:.9}}>
                  <span style={{position:"absolute",top:2,left:4,fontSize:9,color:"#ef4444",fontWeight:700,whiteSpace:"nowrap"}}>NOW</span>
                </div>}
              </div>
            </div>
            {/* Filas */}
            {filtEnvs.map((env,ri)=>{
              const envRes=getEnvRes(env.id);
              const envColor=env.color||(CC[env.category]||CC.DEV).bar;
              return(
                <div key={env.id} style={{position:"relative",height:ROW_H,borderBottom:"1px solid var(--bd,#252535)",background:ri%2===0?"transparent":"rgba(255,255,255,.01)"}}>
                  {majorTicks.map((d,i)=><div key={i} style={{position:"absolute",left:(d-winStart)/3600000*scale.pxH,top:0,width:1,height:"100%",background:"rgba(99,102,241,.35)"}}/>)}
                  {nowX>0&&nowX<totalW&&<div style={{position:"absolute",left:nowX,top:0,width:2,height:"100%",background:"#ef4444",opacity:.4,zIndex:4}}/>}
                  {envRes.map(res=>{
                    const dispEnd=res.status==="Completed"&&res.usage_session?.actual_end?res.usage_session.actual_end:res.planned_end;
                    const sx=(new Date(res.planned_start)-winStart)/3600000*scale.pxH;
                    const ex=(new Date(dispEnd)-winStart)/3600000*scale.pxH;
                    const x=Math.max(0,sx), w=Math.max(10,ex-Math.max(0,sx));
                    const sc=SM[res.status]||SM.Completed;
                    const blockColor=["Reserved","InUse","PolicyViolation"].includes(res.status)?envColor:sc.color;
                    const ou=users.find(u=>u.id===res.reserved_by_user_id);
                    const draggable=["Reserved","PolicyViolation","InUse"].includes(res.status);
                    return(
                      <div key={res.id}
                        onMouseDown={e=>{ if(e.button!==0) return; startDrag(e,res,"move"); }}
                        onClick={e=>handleBlockClick(e,res)}
                        style={{position:"absolute",left:x,width:w,top:6,height:ROW_H-12,
                          background:blockColor+"c0",borderLeft:`3px solid ${blockColor}`,
                          borderRadius:6,cursor:draggable?"grab":"pointer",overflow:"hidden",
                          padding:"3px 8px 3px 5px",zIndex:10,boxShadow:`0 2px 8px ${blockColor}30`,
                          transition:"box-shadow .12s",userSelect:"none"}}
                        onMouseEnter={e=>{e.currentTarget.style.boxShadow=`0 4px 16px ${blockColor}60`;e.currentTarget.style.zIndex=15;}}
                        onMouseLeave={e=>{e.currentTarget.style.boxShadow=`0 2px 8px ${blockColor}30`;e.currentTarget.style.zIndex=10;}}>
                        <div style={{fontWeight:700,fontSize:11,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{(res.jira_issue_keys||[]).join(", ")}</div>
                        <div style={{fontSize:10,color:"rgba(255,255,255,.82)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ou?.name||ou?.email}{res.policy_flags?.exceedsMaxDuration?" ⚠️":""}</div>
                        {draggable&&w>20&&<div
                          onMouseDown={e=>{e.stopPropagation();startDrag(e,res,"resize");}}
                          onClick={e=>{e.stopPropagation();e.preventDefault();}}
                          style={{position:"absolute",right:0,top:0,width:10,height:"100%",cursor:"ew-resize",background:"rgba(255,255,255,.15)",borderRadius:"0 6px 6px 0",zIndex:20,display:"flex",alignItems:"center",justifyContent:"center"}}
                          title="Arrastra para ajustar fin">
                          <div style={{width:2,height:"55%",borderRadius:1,background:"rgba(255,255,255,.5)"}}/>
                        </div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* Leyenda + escala */}
      <div style={{display:"flex",alignItems:"center",gap:14,padding:"6px 14px",borderTop:"1px solid var(--bd,#252535)",background:"var(--sf,#12121e)",flexShrink:0,flexWrap:"wrap"}}>
        {Object.entries(SM).map(([k,v])=><div key={k} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:9,height:9,borderRadius:2,background:v.color}}/><span style={{fontSize:11,color:"var(--tx3,#6a6a9a)"}}>{v.label}</span></div>)}
        <span style={{fontSize:11,color:"var(--tx3,#6a6a9a)",marginLeft:"auto",marginRight:12}}>💡 Arrastra = mover · Borde = redimensionar · Click = detalle</span>
        <div style={{display:"flex",gap:2,background:"var(--sf2,#1a1a28)",border:"1px solid var(--bd,#252535)",borderRadius:8,padding:2}}>
          {Object.entries(SCALE_MODES).map(([key,cfg])=>(
            <button key={key} onClick={()=>setScaleKey(key)}
              style={{background:scaleKey===key?"var(--ac,#6366f1)":"transparent",color:scaleKey===key?"#fff":"var(--tx3,#6a6a9a)",border:"none",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:scaleKey===key?700:400,padding:"3px 10px",transition:"all .15s"}}>
              {cfg.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Vista lista de reservas ────────────────────────────────────────────────────
function ResList({ress, envs, repos, users, currentUser, onResClick, onNew}) {
  const vis = (currentUser.role==="admin"?ress:ress.filter(r=>r.reserved_by_user_id===currentUser.id))
    .sort((a,b)=>new Date(b.planned_start)-new Date(a.planned_start));
  return(
    <div style={{padding:20,maxWidth:820,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
        <h2 style={{fontWeight:700,fontSize:20,color:"var(--tx,#e8e8f2)"}}>{currentUser.role==="admin"?"Todas las reservas":"Mis reservas"}</h2>
        <button style={SB()} onClick={onNew}>+ Nueva reserva</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {vis.map(r=>{
          const env=envs.find(e=>e.id===r.environment_id);
          const ou=users.find(u=>u.id===r.reserved_by_user_id);
          const sc=SM[r.status]||SM.Completed;
          return(
            <div key={r.id} onClick={()=>onResClick(r)}
              style={{background:"var(--sf2,#1a1a28)",border:"1px solid var(--bd,#252535)",borderLeft:`4px solid ${sc.color}`,borderRadius:10,padding:"12px 14px",cursor:"pointer",transition:"background .15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="var(--bd,#252535)"}
              onMouseLeave={e=>e.currentTarget.style.background="var(--sf2,#1a1a28)"}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <CatBadge cat={env?.category}/><span style={{fontWeight:600,color:"var(--tx,#e8e8f2)"}}>{env?.name}</span>
                  <span style={{fontFamily:"monospace",fontSize:12,color:"var(--ac,#6366f1)"}}>{(r.jira_issue_keys||[]).join(", ")}</span>
                </div>
                <SBadge status={r.status}/>
              </div>
              <div style={{fontSize:12,color:"var(--tx3,#6a6a9a)"}}>
                {ou?.name||ou?.email} · {fmtDt(r.planned_start)} → {fmtDt(r.planned_end)}
                {r.description&&<span style={{marginLeft:6}}>· {r.description.slice(0,50)}{r.description.length>50?"…":""}</span>}
                {r.policy_flags?.exceedsMaxDuration&&<span style={{color:"#f97316",marginLeft:8}}>⚠️ Violación de política</span>}
              </div>
            </div>
          );
        })}
        {vis.length===0&&<p style={{color:"var(--tx3,#6a6a9a)",textAlign:"center",marginTop:40}}>Sin reservas.</p>}
      </div>
    </div>
  );
}

// ── Módulo principal exportado ─────────────────────────────────────────────────
export default function EnvironmentsModule({supabase, currentUser, wsUsers}) {
  const [envs,  setEnvs]  = useState([]);
  const [repos, setRepos] = useState([]);
  const [ress,  setRess]  = useState([]);
  const [policy,setPolicy]= useState(null);
  const [view,  setView]  = useState("timeline");
  const [selRes,setSelRes]= useState(null);
  const [showCreate,setShowCreate] = useState(false);
  const [editRes,setEditRes]       = useState(null);
  const [loading,setLoading] = useState(true);

  // users con formato uniforme {id, name, email, role}
  const users = useMemo(()=>(wsUsers||[]).map(u=>({
    id: u.id,
    name: u.name||u.email,
    email: u.email,
    role: u.role,
  })),[wsUsers]);

  useEffect(()=>{
    (async()=>{
      setLoading(true);
      const [
        {data:eD}, {data:rD}, {data:resD}, {data:polD}
      ] = await Promise.all([
        supabase.from("syn_environments").select("*").order("name"),
        supabase.from("syn_repositories").select("*").order("name"),
        supabase.from("syn_reservations").select("*"),
        supabase.from("syn_policy").select("*").eq("id",1).single(),
      ]);
      setEnvs(eD||[]);
      setRepos(rD||[]);
      setRess(autoRelease(resD||[]));
      setPolicy(polD||{booking_window_days:30,min_duration_hours:0.5,allow_past_start:true,business_hours_only:false,business_hours_start:8,business_hours_end:20});
      setLoading(false);
    })();
    const iv=setInterval(()=>setRess(r=>autoRelease(r)),30000);
    return()=>clearInterval(iv);
  },[supabase]);

  const checkIn  = async id => { const u={status:"InUse",usage_session:{actual_start:new Date().toISOString(),actual_end:null,branches:[]}}; setRess(r=>r.map(x=>x.id===id?{...x,...u}:x)); await supabase.from("syn_reservations").update(u).eq("id",id); setSelRes(null); };
  const checkOut = async id => { const n=new Date().toISOString(); setRess(r=>r.map(x=>x.id===id?{...x,status:"Completed",usage_session:{...x.usage_session,actual_end:n}}:x)); await supabase.from("syn_reservations").update({status:"Completed",usage_session:{...ress.find(x=>x.id===id)?.usage_session,actual_end:n}}).eq("id",id); setSelRes(null); };
  const cancel   = async id => { setRess(r=>r.map(x=>x.id===id?{...x,status:"Cancelled"}:x)); await supabase.from("syn_reservations").update({status:"Cancelled"}).eq("id",id); setSelRes(null); };
  const addBranch= async (rid,b) => {
    setRess(r=>r.map(x=>x.id===rid?{...x,usage_session:{...x.usage_session,branches:[...(x.usage_session?.branches||[]),b]}}:x));
    setSelRes(p=>p?{...p,usage_session:{...p.usage_session,branches:[...(p.usage_session?.branches||[]),b]}}:p);
    const r=ress.find(x=>x.id===rid);
    if(r) await supabase.from("syn_reservations").update({usage_session:{...r.usage_session,branches:[...(r.usage_session?.branches||[]),b]}}).eq("id",rid);
  };
  const saveRes  = async data => {
    setRess(p=>{ const ex=p.find(r=>r.id===data.id); return ex?p.map(r=>r.id===data.id?data:r):[...p,data]; });
    await supabase.from("syn_reservations").upsert(data);
    setShowCreate(false); setEditRes(null); setSelRes(null);
  };
  const updateRes = async (id, updates) => {
    setRess(p=>p.map(r=>{ if(r.id!==id) return r;
      const up={...r,...updates};
      const env=envs.find(e=>e.id===r.environment_id);
      if(env&&(updates.planned_end||updates.planned_start)){
        const d=durH(up.planned_start,up.planned_end);
        if(d>env.max_reservation_duration) return {...up,status:"PolicyViolation",policy_flags:{exceedsMaxDuration:true}};
        if(up.status==="PolicyViolation") return {...up,status:"Reserved",policy_flags:{exceedsMaxDuration:false}};
      }
      return up;
    }));
    await supabase.from("syn_reservations").update(updates).eq("id",id);
  };

  const NAV=[{id:"timeline",label:"Timeline",icon:"📅"},{id:"list",label:"Reservas",icon:"📋"}];

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"var(--tx3,#6a6a9a)",fontSize:14}}>Cargando reservas…</div>;

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {/* Sub-nav */}
      <div style={{display:"flex",gap:2,padding:"6px 16px",borderBottom:"1px solid var(--bd,#252535)",background:"var(--sf,#12121e)",flexShrink:0}}>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>setView(n.id)} style={{...SB("ghost",{
            background:view===n.id?"rgba(99,102,241,.15)":"transparent",
            color:view===n.id?"var(--ac,#6366f1)":"var(--tx3,#6a6a9a)",
            fontWeight:view===n.id?600:400,
            borderBottom:view===n.id?"2px solid var(--ac,#6366f1)":"2px solid transparent",
            borderRadius:"6px 6px 0 0",
          })}>{n.icon} {n.label}</button>
        ))}
      </div>
      {/* Contenido */}
      {view==="timeline"&&(
        <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
          <Timeline envs={envs} ress={ress} repos={repos} users={users}
            currentUser={currentUser} onResClick={setSelRes} onNew={()=>setShowCreate(true)}
            onResUpdate={updateRes} policy={policy}/>
        </div>
      )}
      {view==="list"&&(
        <div style={{flex:1,overflowY:"auto"}}>
          <ResList ress={ress} envs={envs} repos={repos} users={users}
            currentUser={currentUser} onResClick={setSelRes} onNew={()=>setShowCreate(true)}/>
        </div>
      )}
      {/* Modales */}
      {selRes&&!editRes&&<ResDetail res={selRes} envs={envs} repos={repos} users={users}
        currentUser={currentUser} onClose={()=>setSelRes(null)}
        onEdit={r=>{setEditRes(r);setSelRes(null);}} onCancel={cancel}
        onCheckIn={checkIn} onCheckOut={checkOut} onAddBranch={addBranch}/>}
      {(showCreate||editRes)&&<ResForm res={editRes} envs={envs} repos={repos} ress={ress}
        currentUser={currentUser} policy={policy} onSave={saveRes}
        onClose={()=>{setShowCreate(false);setEditRes(null);}}/>}
    </div>
  );
}
