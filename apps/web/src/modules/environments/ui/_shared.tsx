// @ts-nocheck
// apps/web/src/modules/environments/ui/_shared.tsx
// Shared constants, helpers and sub-components used across the Environments UI
import { useState, useRef, useCallback, useMemo, useEffect } from "react";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";

// ── Utilidades ────────────────────────────────────────────────────────────────
export const uid     = () => Math.random().toString(36).slice(2, 10);
export const fmtDt   = iso => iso ? new Date(iso).toLocaleString("es-ES",{dateStyle:"short",timeStyle:"short"}) : "—";
export const durH    = (s, e) => (new Date(e) - new Date(s)) / 3_600_000;
export const overlap = (s1,e1,s2,e2) => new Date(s1) < new Date(e2) && new Date(s2) < new Date(e1);
const isJira  = k => /^[A-Z][A-Z0-9]+-\d+$/.test((k||"").trim());
export const pad     = n => String(n).padStart(2,"0");
export const checkOverlap = (ress, envId, s, e, excId) =>
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
export const SM = {
  Reserved:        { color:"#3b82f6", label:"Reservado",        icon:"⏳" },
  InUse:           { color:"#22c55e", label:"En uso",            icon:"🟢" },
  Completed:       { color:"#6b7280", label:"Completado",        icon:"✅" },
  Cancelled:       { color:"#ef4444", label:"Cancelado",         icon:"❌" },
  PolicyViolation: { color:"#f97316", label:"Violación política",icon:"⚠️" },
};
export const CC = {
  DEV:     { bar:"#7c3aed", badge:"rgba(124,58,237,.15)",  btext:"#a78bfa" },
  PRE:     { bar:"#b45309", badge:"rgba(180,83,9,.15)",    btext:"#fbbf24" },
  STAGING: { bar:"#0e7490", badge:"rgba(14,116,144,.15)",  btext:"#22d3ee" },
};
export const ENV_PALETTE = [
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e","#10b981","#14b8a6",
  "#06b6d4","#0ea5e9","#3b82f6","#6366f1","#8b5cf6","#a855f7","#ec4899","#f43f5e",
  "#7c3aed","#9333ea","#db2777","#e11d48","#dc2626","#0891b2","#0284c7","#2563eb",
];
export const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
export const DAYS_ES   = ["Lu","Ma","Mi","Ju","Vi","Sá","Do"];

// ── Estilos helpers (usan CSS vars de WorkSuite) ───────────────────────────────
export const SI = (extra={}) => ({
  background:"var(--sf2,#1a1a28)", border:"1px solid var(--bd,#252535)",
  borderRadius:8, padding:"8px 12px", fontSize:13, color:"var(--tx,#e8e8f2)",
  width:"100%", outline:"none", fontFamily:"inherit", ...extra,
});
export const SB = (variant="primary", extra={}) => ({
  background: variant==="primary"?"var(--ac,#6366f1)":variant==="danger"?"#dc2626":variant==="success"?"#16a34a":variant==="warning"?"#d97706":variant==="outline"?"transparent":"transparent",
  color: variant==="ghost"?"var(--tx3,#6a6a9a)":variant==="outline"?"var(--ac,#6366f1)":"#fff",
  border: variant==="outline"?"1px solid var(--ac,#6366f1)":"none",
  borderRadius:8, cursor:"pointer", fontWeight:500, fontSize:13,
  padding:"6px 14px", transition:"all .15s", fontFamily:"inherit", ...extra,
});

// ── Sub-componentes ────────────────────────────────────────────────────────────
export const CatBadge = ({cat}) => {
  const c = CC[cat]||CC.DEV;
  return <span style={{background:c.badge,color:c.btext,padding:"2px 7px",borderRadius:20,fontSize:11,fontWeight:600}}>{cat}</span>;
};
export const SBadge = ({status}) => {
  const s = SM[status]||SM.Completed;
  return <span style={{background:s.color+"22",color:s.color,padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600}}>{s.icon} {s.label}</span>;
};
export const Lbl = ({c}) => <label style={{display:"block",fontSize:11,fontWeight:600,color:"var(--tx3,#6a6a9a)",marginBottom:5,textTransform:"uppercase",letterSpacing:".05em"}}>{c}</label>;
export const Err = ({m}) => m ? <p style={{color:"#ef4444",fontSize:11,marginTop:4}}>⚠ {m}</p> : null;

export function MHead({title, onClose}) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid var(--bd,#252535)"}}>
      <span style={{fontWeight:700,fontSize:15,color:"var(--tx,#e8e8f2)"}}>{title}</span>
      <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"var(--tx3,#6a6a9a)",fontSize:20,lineHeight:1,padding:"2px 6px"}}>×</button>
    </div>
  );
}
export function Modal({children, onClose}) {
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

export function ConfirmModal({title, message, confirmLabel="Confirmar", confirmVariant="danger", onConfirm, onClose}) {
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

export function MultiSelect({options, value, onChange, placeholder="Seleccionar…"}) {
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

export function JiraTagInput({value, onChange}) {
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

export function DatePicker({value, onChange, ress, envId, excludeId}) {
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
export function ColorPicker({value, onChange}) {
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
