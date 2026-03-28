// ─── EnvironmentsModule.jsx — Sistema de reservas de entornos ────────────────
// Integrado con WorkSuite: usa syn_* tables, supabase de WorkSuite, CSS vars del sistema
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { supabase } from './shared/lib/api';

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

// ── Constantes UI ─────────────────────────────────────────────────────────────
const SM = {
  Reserved:        { color:"#3b82f6", label:"Reservado",          icon:"⏳" },
  InUse:           { color:"#22c55e", label:"En uso",              icon:"🟢" },
  Completed:       { color:"#6b7280", label:"Completado",          icon:"✅" },
  Cancelled:       { color:"#ef4444", label:"Cancelado",           icon:"❌" },
  PolicyViolation: { color:"#f97316", label:"Violación política",  icon:"⚠️" },
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

// ── Style helpers (CSS vars de WorkSuite) ─────────────────────────────────────
const SI = (extra={}) => ({
  background:"var(--sf2)", border:"1px solid var(--bd)",
  borderRadius:8, padding:"8px 12px", fontSize:13, color:"var(--tx)",
  width:"100%", outline:"none", fontFamily:"inherit", ...extra,
});
const SB = (variant="primary", extra={}) => ({
  background: variant==="primary"?"var(--ac)":variant==="danger"?"#dc2626":variant==="success"?"#16a34a":variant==="warning"?"#d97706":variant==="outline"?"transparent":"transparent",
  color: variant==="ghost"?"var(--tx3)":variant==="outline"?"var(--ac)":"#fff",
  border: variant==="outline"?"1px solid var(--ac)":"none",
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
const Lbl = ({c}) => <label style={{display:"block",fontSize:11,fontWeight:600,color:"var(--tx3)",marginBottom:5,textTransform:"uppercase",letterSpacing:".05em"}}>{c}</label>;
const Err = ({m}) => m ? <p style={{color:"#ef4444",fontSize:11,marginTop:4}}>⚠ {m}</p> : null;

function MHead({title, onClose}) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid var(--bd)"}}>
      <span style={{fontWeight:700,fontSize:15,color:"var(--tx)"}}>{title}</span>
      <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:20,lineHeight:1,padding:"2px 6px"}}>×</button>
    </div>
  );
}
function Modal({children, onClose}) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.65)",padding:16,backdropFilter:"blur(4px)"}}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()}
        style={{background:"var(--sf)",border:"1px solid var(--bd2)",borderRadius:16,
          boxShadow:"var(--shadow)",color:"var(--tx)",maxWidth:580,width:"100%",maxHeight:"92vh",overflowY:"auto"}}>
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
        style={{background:"var(--sf)",border:"1px solid var(--bd2)",borderRadius:14,
          boxShadow:"var(--shadow)",width:"100%",maxWidth:420,overflow:"hidden"}}>
        <div style={{padding:"18px 20px 14px",borderBottom:"1px solid var(--bd)",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>{confirmVariant==="danger"?"🗑️":"⚠️"}</span>
          <span style={{fontWeight:700,fontSize:15,color:"var(--tx)"}}>{title}</span>
        </div>
        <div style={{padding:"16px 20px"}}>
          <p style={{color:"var(--tx3)",fontSize:13,lineHeight:1.6,marginBottom:20}}>{message}</p>
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
        <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:selected.length?"var(--tx)":"var(--tx3)",fontSize:13}}>
          {selected.length ? selected.map(o=>o.name).join(", ") : placeholder}
        </span>
        <span style={{display:"flex",alignItems:"center",gap:4,marginLeft:6,flexShrink:0}}>
          {value.length>0&&<span style={{background:"var(--ac)",color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10}}>{value.length}</span>}
          <span style={{color:"var(--tx3)",fontSize:10}}>{open?"▲":"▼"}</span>
        </span>
      </div>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:300,background:"var(--sf)",border:"1px solid var(--bd2)",borderRadius:10,boxShadow:"var(--shadow)",overflow:"hidden",marginTop:4}}>
          <div style={{padding:"8px 10px",borderBottom:"1px solid var(--bd)"}}>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar…" style={SI({padding:"6px 10px",fontSize:12})} onClick={e=>e.stopPropagation()}/>
          </div>
          <div style={{maxHeight:180,overflowY:"auto"}}>
            {filtered.map(o=>(
              <div key={o.id} onClick={()=>toggle(o.id)}
                style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",cursor:"pointer",background:value.includes(o.id)?"var(--glow)":"transparent"}}
                onMouseEnter={e=>e.currentTarget.style.background=value.includes(o.id)?"var(--glow)":"var(--sf2)"}
                onMouseLeave={e=>e.currentTarget.style.background=value.includes(o.id)?"var(--glow)":"transparent"}>
                <div style={{width:15,height:15,borderRadius:4,border:"2px solid "+(value.includes(o.id)?"var(--ac)":"var(--tx3)"),background:value.includes(o.id)?"var(--ac)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {value.includes(o.id)&&<span style={{color:"#fff",fontSize:9,lineHeight:1}}>✓</span>}
                </div>
                <span style={{fontSize:13,color:"var(--tx)"}}>{o.name}</span>
              </div>
            ))}
          </div>
          {value.length>0&&<div style={{borderTop:"1px solid var(--bd)",padding:"6px 12px"}}>
            <button onClick={()=>{onChange([]);setQ("");}} style={{...SB("ghost",{fontSize:11,padding:"2px 8px",color:"var(--red)"})}}>Limpiar</button>
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
    if(!isJira(key)){setErr("Inválido: \""+key+"\" — usa PROYECTO-123");return;}
    if(value.includes(key)){setErr("Ya añadido");return;}
    onChange([...value,key]); setDraft(""); setErr("");
  };
  return (
    <div>
      <div style={{...SI({minHeight:42,display:"flex",flexWrap:"wrap",gap:4,alignItems:"center",padding:"6px 10px",cursor:"text"})}}
        onClick={()=>document.getElementById("jtag")?.focus()}>
        {value.map(k=>(
          <span key={k} style={{background:"rgba(99,102,241,.22)",color:"var(--ac2)",padding:"2px 8px",borderRadius:6,fontSize:12,fontFamily:"monospace",display:"flex",alignItems:"center",gap:4}}>
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
          style={{background:"transparent",border:"none",outline:"none",fontSize:13,color:"var(--tx)",fontFamily:"monospace",flex:1,minWidth:140,padding:"2px 0"}}/>
      </div>
      <Err m={err}/>
    </div>
  );
}

function ColorPicker({value, onChange}) {
  const [open,setOpen] = useState(false);
  const ref = useRef();
  useEffect(()=>{ const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);}; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); },[]);
  return(
    <div ref={ref} style={{position:"relative",display:"inline-block"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{width:36,height:36,borderRadius:8,background:value||"var(--ac)",cursor:"pointer",border:"2px solid var(--bd2)"}}/>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 8px)",left:0,zIndex:600,background:"var(--sf)",border:"1px solid var(--bd2)",borderRadius:12,padding:12,boxShadow:"var(--shadow)",width:224}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:5}}>
            {ENV_PALETTE.map(c=><div key={c} onClick={()=>{onChange(c);setOpen(false);}} style={{width:22,height:22,borderRadius:5,background:c,cursor:"pointer",border:value===c?"2px solid #fff":"2px solid transparent",transform:value===c?"scale(1.15)":"scale(1)",transition:"all .1s"}}/>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Formulario de reserva ─────────────────────────────────────────────────────
function ResForm({res, envs, repos, ress, currentUser, policy, onSave, onClose}) {
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
        if(!isAdmin&&policy?.bookingWindowDays){
          const max=new Date(n.getTime()+policy.bookingWindowDays*86400000);
          if(eD>max) e.end="Máximo "+policy.bookingWindowDays+" días por adelantado";
        }
        if(selEnv&&!e.end){
          const dur=durH(start,end);
          if(dur>selEnv.max_reservation_duration) e.end="Excede max "+selEnv.max_reservation_duration+"h";
          if(policy&&dur<policy.minDurationHours) e.end="Mín "+policy.minDurationHours+"h";
        }
        if(envId&&!e.end){
          const ov=checkOverlap(ress,envId,start,end,res?.id);
          if(ov.length) e.overlap="Solapamiento con: "+ov.map(r=>(r.jira_issue_keys||[]).join(",")).join(" / ");
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
          <p style={{fontSize:11,color:"var(--tx3)",marginTop:3}}>Enter · Tab · Espacio para añadir</p>
          <Err m={errors.jiras}/>
        </div>
        <div style={{marginBottom:14}}>
          <Lbl c="Descripción"/>
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={2} style={SI({resize:"vertical",lineHeight:1.55})} placeholder="Propósito de la reserva…"/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{marginBottom:14}}>
            <Lbl c="Inicio planificado"/>
            <input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} style={SI()}/>
            <Err m={errors.start}/>
          </div>
          <div style={{marginBottom:14}}>
            <Lbl c="Fin planificado"/>
            <input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} style={SI()}/>
            <Err m={errors.end}/>
          </div>
        </div>
        {errors.overlap&&<div style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",borderRadius:8,padding:"8px 12px",color:"var(--red)",fontSize:12,marginBottom:12}}>⛔ {errors.overlap}</div>}
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
function ResDetail({res, envs, repos, users, currentUser, onClose, onEdit, onCancel, onCheckIn, onCheckOut, onAddBranch}) {
  const env     = envs.find(e=>e.id===res.environment_id);
  const owner   = users.find(u=>u.id===res.reserved_by_user_id);
  const isOwner = currentUser.id===res.reserved_by_user_id;
  const isAdmin = currentUser.role==="admin";
  const [nb,setNb]       = useState("");
  const [showB,setShowB] = useState(false);
  const repoNames = (res.selected_repository_ids||[]).map(id=>repos.find(r=>r.id===id)?.name).filter(Boolean);
  const canEdit   = (isOwner||isAdmin)&&["Reserved","PolicyViolation","InUse"].includes(res.status);
  const canCI     = isOwner&&res.status==="Reserved";
  const canCO     = isOwner&&res.status==="InUse";
  const canCancel = (isOwner||isAdmin)&&["Reserved","InUse","PolicyViolation"].includes(res.status);
  const IR = ({l,v}) => (
    <div style={{marginBottom:8}}>
      <span style={{fontSize:10,color:"var(--tx3)",fontWeight:700,display:"block",textTransform:"uppercase",letterSpacing:".04em"}}>{l}</span>
      <span style={{color:"var(--tx)",fontSize:13}}>{v||"—"}</span>
    </div>
  );
  return(
    <Modal onClose={onClose}>
      <MHead title="Detalle de Reserva" onClose={onClose}/>
      <div style={{padding:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <CatBadge cat={env?.category}/><span style={{fontWeight:700,fontSize:16,color:"var(--tx)"}}>{env?.name}</span>
          </div>
          <SBadge status={res.status}/>
        </div>
        {res.policy_flags?.exceedsMaxDuration&&(
          <div style={{background:"rgba(249,115,22,.1)",border:"1px solid rgba(249,115,22,.3)",borderRadius:8,padding:"10px 14px",color:"#fb923c",fontSize:13,marginBottom:14}}>
            ⚠️ <strong>Requiere atención admin</strong> — Excede la duración máxima del entorno.
          </div>
        )}
        <div style={{marginBottom:12}}>
          <span style={{fontSize:10,color:"var(--tx3)",fontWeight:700,display:"block",textTransform:"uppercase",letterSpacing:".04em",marginBottom:5}}>Claves Jira</span>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {(res.jira_issue_keys||[]).map(k=><span key={k} style={{background:"var(--glow)",color:"var(--ac2)",padding:"3px 10px",borderRadius:6,fontSize:12,fontFamily:"monospace"}}>{k}</span>)}
          </div>
        </div>
        {res.description&&<div style={{marginBottom:12,background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,padding:"10px 12px"}}>
          <span style={{fontSize:10,color:"var(--tx3)",fontWeight:700,display:"block",textTransform:"uppercase",letterSpacing:".04em",marginBottom:4}}>Descripción</span>
          <span style={{color:"var(--tx)",fontSize:13,lineHeight:1.6}}>{res.description}</span>
        </div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <IR l="Responsable" v={owner?.name||owner?.email}/>
          <IR l="Duración" v={durH(res.planned_start,res.planned_end).toFixed(1)+"h"}/>
          <IR l="Inicio planificado" v={fmtDt(res.planned_start)}/>
          <IR l="Fin planificado" v={fmtDt(res.planned_end)}/>
          {res.usage_session&&<>
            <IR l="Inicio real" v={fmtDt(res.usage_session.actual_start)}/>
            <IR l="Fin real" v={res.usage_session.actual_end?fmtDt(res.usage_session.actual_end):"—"}/>
          </>}
        </div>
        {repoNames.length>0&&<div style={{marginBottom:10}}>
          <span style={{fontSize:10,color:"var(--tx3)",fontWeight:700,display:"block",textTransform:"uppercase",letterSpacing:".04em",marginBottom:4}}>Repositorios</span>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {repoNames.map(n=><span key={n} style={{background:"var(--sf2)",color:"var(--tx2)",padding:"2px 8px",borderRadius:4,fontSize:12}}>📦 {n}</span>)}
          </div>
        </div>}
        {(res.usage_session?.branches||[]).length>0&&<div style={{marginBottom:10}}>
          <span style={{fontSize:10,color:"var(--tx3)",fontWeight:700,display:"block",textTransform:"uppercase",letterSpacing:".04em",marginBottom:4}}>Ramas</span>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {res.usage_session.branches.map(b=><span key={b} style={{background:"var(--glow)",color:"var(--ac2)",padding:"2px 8px",borderRadius:4,fontSize:12,fontFamily:"monospace"}}>{b}</span>)}
          </div>
        </div>}
        {res.status==="InUse"&&isOwner&&<div style={{marginTop:10,borderTop:"1px solid var(--bd)",paddingTop:10}}>
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
        {env?.url&&<div style={{marginTop:14,borderTop:"1px solid var(--bd)",paddingTop:14}}>
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
  hours:  { label:"Horas",    pxH:160, winH:24,    major:3600000,    fmtMajor:d=>pad(d.getHours())+":00",  fmtDay:d=>d.toLocaleDateString("es-ES",{weekday:"short",day:"numeric",month:"short"}) },
  days:   { label:"Días",     pxH:80,  winH:7*24,  major:86400000,   fmtMajor:d=>pad(d.getHours())+"h",    fmtDay:d=>d.toLocaleDateString("es-ES",{weekday:"short",day:"numeric",month:"short"}) },
  weeks:  { label:"Semanas",  pxH:20,  winH:28*24, major:86400000,   fmtMajor:d=>d.toLocaleDateString("es-ES",{day:"numeric",month:"short"}), fmtDay:d=>d.toLocaleDateString("es-ES",{month:"short",year:"2-digit"}) },
  months: { label:"Meses",    pxH:6,   winH:90*24, major:604800000,  fmtMajor:d=>"S"+Math.ceil(d.getDate()/7), fmtDay:d=>d.toLocaleDateString("es-ES",{month:"long",year:"numeric"}) },
};
const LBL_W=148, ROW_H=60, DAY_H=24, HDR_H=46, SNAP=0.5;

function Timeline({envs, ress, repos, users, currentUser, onResClick, onNew, onResUpdate, policy}) {
  const [fCat,    setFCat]    = useState("ALL");
  const [fUser,   setFUser]   = useState("ALL");
  const [fJira,   setFJira]   = useState("");
  const [winOff,  setWinOff]  = useState(-1);
  const [scaleKey,setScaleKey]= useState("days");
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

  const majorTicks = useMemo(()=>{
    const ticks=[]; let d=new Date(winStart);
    if(scaleKey==="hours") d.setMinutes(0,0,0); else d.setHours(0,0,0,0);
    while(d<winEnd){ticks.push(new Date(d));d=new Date(d.getTime()+scale.major);}
    return ticks;
  },[winStart,winEnd,scaleKey,scale]);

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
        const ov=checkOverlap(ress,res.environment_id,newStart.toISOString(),newEnd.toISOString(),res.id); if(ov.length){alert("Solapamiento con otra reserva");return;}
        onResUpdate(res.id,{planned_start:newStart.toISOString(),planned_end:newEnd.toISOString()}); }
      else if(type==="resize"&&newEnd){ if(newEnd<=origStart||newEnd<=new Date()){alert("Fecha inválida.");return;}
        const env=envs.find(ev=>ev.id===res.environment_id); if(env&&durH(origStart.toISOString(),newEnd.toISOString())>env.max_reservation_duration){alert("Excede max "+env.max_reservation_duration+"h");return;}
        const ov=checkOverlap(ress,res.environment_id,res.planned_start,newEnd.toISOString(),res.id); if(ov.length){alert("El redimensionado solaparía otra reserva.");return;}
        onResUpdate(res.id,{planned_end:newEnd.toISOString()}); } };
    document.addEventListener("mousemove",onMove); document.addEventListener("mouseup",onUp);
  },[currentUser,ress,envs,onResUpdate,scale.pxH]);

  const handleBlockClick = (e, res) => { if(dragRef.current?.moved) return; onResClick(res); };
  const navStep = scaleKey==="hours"?1:scaleKey==="days"?7:scaleKey==="weeks"?28:90;

  const scaleKeys = Object.keys(SCALE_MODES);

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {/* Filtros y nav */}
      <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:6,padding:"8px 14px",borderBottom:"1px solid var(--bd)",background:"var(--sf)",flexShrink:0}}>
        <select style={SI({width:130})} value={fCat} onChange={e=>setFCat(e.target.value)}>
          <option value="ALL">Todas las categorías</option>
          <option value="DEV">DEV</option>
          <option value="PRE">PRE</option>
          <option value="STAGING">STAGING</option>
        </select>
        <select style={SI({width:140})} value={fUser} onChange={e=>setFUser(e.target.value)}>
          <option value="ALL">Todos los usuarios</option>
          {users.map(u=><option key={u.id} value={u.id}>{u.name||u.email}</option>)}
        </select>
        <input style={SI({width:120})} placeholder="Jira…" value={fJira} onChange={e=>setFJira(e.target.value)}/>
        {/* Scale selector */}
        <div style={{display:"flex",gap:2,background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,padding:2}}>
          {scaleKeys.map(k=>(
            <button key={k} onClick={()=>setScaleKey(k)} style={{...SB(scaleKey===k?"primary":"ghost",{padding:"4px 10px",fontSize:11,borderRadius:6})}}>
              {SCALE_MODES[k].label}
            </button>
          ))}
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          <button style={SB("ghost")} onClick={()=>setWinOff(w=>w-navStep)}>◀</button>
          <button style={SB("ghost")} onClick={()=>setWinOff(-1)}>Hoy</button>
          <button style={SB("ghost")} onClick={()=>setWinOff(w=>w+navStep)}>▶</button>
          <button style={{...SB(),marginLeft:8}} onClick={onNew}>+ Nueva reserva</button>
        </div>
      </div>
      <div style={{flex:1,overflow:"hidden",display:"flex"}}>
        {/* Etiquetas izquierda */}
        <div style={{width:LBL_W,flexShrink:0,borderRight:"1px solid var(--bd)",background:"var(--sf)"}}>
          <div style={{height:HDR_H,borderBottom:"1px solid var(--bd)",display:"flex",alignItems:"center",padding:"0 12px"}}>
            <span style={{fontSize:10,fontWeight:700,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".05em"}}>Entorno</span>
          </div>
          {filtEnvs.map(env=>{
            const envColor = env.color||(CC[env.category]||CC.DEV).bar;
            return(
              <div key={env.id} style={{height:ROW_H,borderBottom:"1px solid var(--bd)",display:"flex",alignItems:"center",padding:"0 10px",gap:8,
                background:env.is_locked?"rgba(251,191,36,.06)":"transparent"}}>
                <div style={{width:3,height:26,borderRadius:2,background:envColor,flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:12,color:"var(--tx)",lineHeight:1.2,display:"flex",alignItems:"center",gap:4}}>
                    {env.name}{env.is_locked&&<span title="Bloqueado" style={{fontSize:11}}>🔒</span>}
                  </div>
                  <div style={{marginTop:3,display:"flex",alignItems:"center",gap:5}}>
                    <CatBadge cat={env.category}/>
                    {env.url&&<a href={env.url} target="_blank" rel="noopener noreferrer"
                      style={{display:"inline-flex",alignItems:"center",gap:3,background:"var(--glow)",color:"var(--ac2)",padding:"1px 6px",borderRadius:6,fontSize:10,fontWeight:600,textDecoration:"none"}}
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
            {/* Header */}
            <div style={{height:HDR_H,position:"sticky",top:0,zIndex:20,background:"var(--sf)",borderBottom:"1px solid var(--bd)"}}>
              <div style={{height:DAY_H,position:"relative",borderBottom:"1px solid var(--bd)",overflow:"hidden"}}>
                {majorTicks.map((d,i)=>{
                  const x=(d-winStart)/3600000*scale.pxH, w=scale.major/3600000*scale.pxH;
                  const isNow=d.toDateString()===new Date().toDateString();
                  return(
                    <div key={i} style={{position:"absolute",left:x,width:w,top:0,height:DAY_H,display:"flex",alignItems:"center",paddingLeft:6,
                      borderLeft:"1px solid var(--bd)",background:isNow?"rgba(99,102,241,.06)":"transparent"}}>
                      <span style={{fontSize:10,fontWeight:isNow?700:400,color:isNow?"var(--ac2)":"var(--tx3)",whiteSpace:"nowrap",overflow:"hidden"}}>{scale.fmtDay(d)}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{height:HDR_H-DAY_H,position:"relative",overflow:"hidden"}}>
                {majorTicks.map((d,i)=>(
                  <div key={i} style={{position:"absolute",left:(d-winStart)/3600000*scale.pxH,width:scale.major/3600000*scale.pxH,top:0,height:HDR_H-DAY_H,
                    display:"flex",alignItems:"center",paddingLeft:4,borderLeft:"1px solid var(--bd)"}}>
                    <span style={{fontSize:10,color:"var(--tx3)",whiteSpace:"nowrap"}}>{scale.fmtMajor(d)}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Ahora */}
            {nowX>0&&nowX<totalW&&(
              <div style={{position:"absolute",left:nowX,top:HDR_H,bottom:0,width:2,background:"rgba(239,68,68,.5)",zIndex:10,pointerEvents:"none"}}>
                <div style={{position:"absolute",top:0,left:-4,width:10,height:10,borderRadius:"50%",background:"var(--red)"}}/>
              </div>
            )}
            {/* Filas de entornos */}
            {filtEnvs.map(env=>{
              const envRes=getEnvRes(env.id);
              return(
                <div key={env.id} style={{position:"relative",height:ROW_H,borderBottom:"1px solid var(--bd)",background:"var(--sf)"}}>
                  {/* Fondo de ticks */}
                  {majorTicks.map((d,i)=>(
                    <div key={i} style={{position:"absolute",left:(d-winStart)/3600000*scale.pxH,top:0,bottom:0,width:1,background:"var(--bd)",opacity:.5}}/>
                  ))}
                  {/* Bloques de reserva */}
                  {envRes.map(res=>{
                    const rs=Math.max(new Date(res.planned_start),winStart);
                    const re=Math.min(new Date(res.planned_end),winEnd);
                    const x=(rs-winStart)/3600000*scale.pxH;
                    const w=Math.max(4,(re-rs)/3600000*scale.pxH);
                    const sm=SM[res.status]||SM.Completed;
                    const label=(res.jira_issue_keys||[]).join(", ");
                    return(
                      <div key={res.id}
                        style={{position:"absolute",left:x,width:w,top:8,bottom:8,borderRadius:6,
                          background:sm.color+"33",border:"1px solid "+sm.color+"88",
                          cursor:"pointer",overflow:"hidden",userSelect:"none",zIndex:2,
                          boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}
                        onClick={e=>handleBlockClick(e,res)}
                        onMouseDown={e=>startDrag(e,res,"move")}>
                        <div style={{padding:"2px 6px",display:"flex",alignItems:"center",gap:4,height:"100%"}}>
                          <span style={{fontSize:10,fontWeight:700,color:sm.color,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1}}>{sm.icon} {label}</span>
                        </div>
                        {/* Handle de resize */}
                        <div onMouseDown={e=>{e.stopPropagation();startDrag(e,res,"resize");}}
                          style={{position:"absolute",right:0,top:0,bottom:0,width:8,cursor:"ew-resize",background:"transparent"}}/>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function EnvironmentsModule({ currentUser, wsUsers }) {
  const [envs,   setEnvs]   = useState([]);
  const [repos,  setRepos]  = useState([]);
  const [ress,   setRess]   = useState([]);
  const [policy, setPolicy] = useState({bookingWindowDays:30,minDurationHours:.5,allowPastStart:true,businessHoursOnly:false,businessHoursStart:8,businessHoursEnd:20});
  const [loading,setLoading]= useState(true);
  const [resForm,setResForm]= useState(null); // null | 'new' | res-object
  const [resDet, setResDet] = useState(null);
  const [confirm,setConfirm]= useState(null);

  // usuarios de WorkSuite
  const users = wsUsers||[];

  useEffect(()=>{
    (async()=>{
      try {
        const [e,r,res,pol] = await Promise.all([
          supabase.from("syn_environments").select("*").order("name"),
          supabase.from("syn_repositories").select("*").order("name"),
          supabase.from("syn_reservations").select("*"),
          supabase.from("syn_policy").select("*").eq("id",1).single(),
        ]);
        if(e.data)   setEnvs(e.data);
        if(r.data)   setRepos(r.data);
        if(res.data) setRess(autoRelease(res.data));
        if(pol.data) setPolicy({
          bookingWindowDays: pol.data.booking_window_days,
          minDurationHours:  Number(pol.data.min_duration_hours),
          allowPastStart:    pol.data.allow_past_start,
          businessHoursOnly: pol.data.business_hours_only,
          businessHoursStart:pol.data.business_hours_start,
          businessHoursEnd:  pol.data.business_hours_end,
        });
      } catch(err){ console.error("[EnvironmentsModule]",err); }
      finally{ setLoading(false); }
    })();
  },[]);

  const saveRes = async raw => {
    const existing = ress.find(r=>r.id===raw.id);
    if(existing){
      const {error}=await supabase.from("syn_reservations").update(raw).eq("id",raw.id);
      if(!error) setRess(p=>p.map(r=>r.id===raw.id?raw:r));
    } else {
      const {error}=await supabase.from("syn_reservations").insert(raw);
      if(!error) setRess(p=>[...p,raw]);
    }
    setResForm(null);
  };

  const updateRes = async (id, patch) => {
    const {error}=await supabase.from("syn_reservations").update(patch).eq("id",id);
    if(!error) setRess(p=>p.map(r=>r.id===id?{...r,...patch}:r));
  };

  const cancelRes = id => {
    setConfirm({
      title:"Cancelar reserva",
      message:"¿Seguro que quieres cancelar esta reserva?",
      confirmLabel:"Cancelar reserva",
      onConfirm:()=>updateRes(id,{status:"Cancelled"}),
    });
    setResDet(null);
  };

  const checkIn  = id => { updateRes(id,{status:"InUse",usage_session:{actual_start:new Date().toISOString(),actual_end:null,branches:[]}}); setResDet(null); };
  const checkOut = id => { updateRes(id,{status:"Completed","usage_session.actual_end":new Date().toISOString()}); setResDet(null); };
  const addBranch = (id,branch) => {
    const res=ress.find(r=>r.id===id); if(!res) return;
    const branches=[...(res.usage_session?.branches||[]),branch];
    updateRes(id,{usage_session:{...res.usage_session,branches}});
  };

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"var(--tx3)",fontSize:13}}>Cargando entornos…</div>;

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <Timeline
        envs={envs} ress={ress} repos={repos} users={users}
        currentUser={currentUser} policy={policy}
        onResClick={res=>setResDet(res)}
        onNew={()=>setResForm("new")}
        onResUpdate={updateRes}
      />

      {resForm&&(
        <ResForm
          res={resForm==="new"?null:resForm}
          envs={envs} repos={repos} ress={ress}
          currentUser={currentUser} policy={policy}
          onSave={saveRes}
          onClose={()=>setResForm(null)}
        />
      )}

      {resDet&&(
        <ResDetail
          res={resDet} envs={envs} repos={repos} users={users}
          currentUser={currentUser}
          onClose={()=>setResDet(null)}
          onEdit={r=>{setResDet(null);setResForm(r);}}
          onCancel={cancelRes}
          onCheckIn={checkIn}
          onCheckOut={checkOut}
          onAddBranch={addBranch}
        />
      )}

      {confirm&&(
        <ConfirmModal
          title={confirm.title} message={confirm.message}
          confirmLabel={confirm.confirmLabel} confirmVariant="danger"
          onConfirm={confirm.onConfirm}
          onClose={()=>setConfirm(null)}
        />
      )}
    </div>
  );
}
