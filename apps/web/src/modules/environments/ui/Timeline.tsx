// @ts-nocheck
// apps/web/src/modules/environments/ui/Timeline.tsx
// Gantt-style timeline — pure UI, receives onResUpdate callback for drag ops
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { SI, SB, CatBadge, SM, CC, checkOverlap, overlap, durH } from "./_shared";

const SCALE_MODES = {
  hours: { label:"Horas",   pxH:160, winH:24,    major:3600000,      minor:null,          fmtMajor:d=>`${pad(d.getHours())}:00`,  fmtDay:d=>d.toLocaleDateString("es-ES",{weekday:"short",day:"numeric",month:"short"}) },
  days:  { label:"Días",    pxH:80,  winH:7*24,  major:86400000,     minor:3*3600000,     fmtMajor:d=>pad(d.getHours())+"h",       fmtDay:d=>d.toLocaleDateString("es-ES",{weekday:"short",day:"numeric",month:"short"}) },
  weeks: { label:"Semanas", pxH:20,  winH:28*24, major:86400000,     minor:null,          fmtMajor:d=>d.toLocaleDateString("es-ES",{day:"numeric",month:"short"}), fmtDay:d=>d.toLocaleDateString("es-ES",{month:"short",year:"2-digit"}) },
  months:{ label:"Meses",   pxH:6,   winH:90*24, major:7*86400000,   minor:null,          fmtMajor:d=>`S${Math.ceil(d.getDate()/7)}`, fmtDay:d=>d.toLocaleDateString("es-ES",{month:"long",year:"numeric"}) },
};
const LBL_W=148, ROW_H=60, DAY_H=24, HR_H=22, HDR_H=46, SNAP=0.5;

export function Timeline({envs, ress, repos, users, currentUser, onResClick, onNew, onResUpdate, policy}) {
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
