// @ts-nocheck
// apps/web/src/modules/environments/ui/ResList.tsx
// List view of reservations — pure UI, receives onResClick callback
import { CatBadge, SBadge, fmtDt, SM, SB } from "./_shared";

export function ResList({ress, envs, repos, users, currentUser, onResClick, onNew}) {
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

