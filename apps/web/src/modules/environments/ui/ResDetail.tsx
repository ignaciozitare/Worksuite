// @ts-nocheck
// apps/web/src/modules/environments/ui/ResDetail.tsx
// Reservation detail modal — pure UI, receives callbacks for all actions
import { useState } from "react";
import { SB, Modal, MHead, ConfirmModal, CatBadge, SBadge, fmtDt } from "./_shared";

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
