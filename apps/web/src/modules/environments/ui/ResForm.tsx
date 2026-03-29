// @ts-nocheck
// apps/web/src/modules/environments/ui/ResForm.tsx
// Reservation create/edit form — pure UI, receives callbacks, no Supabase
import { useState, useEffect } from "react";
import { SI, SB, Lbl, Err, Modal, MHead, MultiSelect, JiraTagInput, DatePicker } from "./_shared";
import { findConflicts } from "../domain/entities/Reservation";
import type { Policy } from "../domain/entities/Policy";

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
