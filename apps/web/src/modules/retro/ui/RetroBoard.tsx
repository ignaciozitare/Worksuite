// @ts-nocheck
// RetroBoard — WorkSuite Module v1.0

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from '@worksuite/i18n';
import { useDialog, Btn, Badge } from '@worksuite/ui';
import { sessionRepo, actionableRepo, teamRepo } from '../container';

// ════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════

const RC = [
  { id:"good",   label:"Hacemos Bien",       emoji:"✨", color:"#4ade80", dim:"rgba(74,222,128,.13)",  border:"rgba(74,222,128,.3)"  },
  { id:"bad",    label:"Hacemos Mal",         emoji:"⚡", color:"#f87171", dim:"rgba(248,113,113,.13)", border:"rgba(248,113,113,.3)" },
  { id:"change", label:"Deberíamos Cambiar",  emoji:"🔄", color:"#fbbf24", dim:"rgba(251,191,36,.13)",  border:"rgba(251,191,36,.3)"  },
  { id:"stop",   label:"Dejar de Hacer",      emoji:"🛑", color:"#a78bfa", dim:"rgba(167,139,250,.13)", border:"rgba(167,139,250,.3)" },
];
const RC_MAP = Object.fromEntries(RC.map(c=>[c.id,c]));

const PHASES = ["lobby","creating","grouping","voting","discussion","summary"];
const PM = {
  lobby:      {label:"Config",    icon:"⚙️",  color:"#64748b"},
  creating:   {label:"Crear",     icon:"📝",  color:"#818cf8"},
  grouping:   {label:"Organizar", icon:"🗂️",  color:"#fbbf24"},
  voting:     {label:"Votación",  icon:"🗳️",  color:"#f472b6"},
  discussion: {label:"Discusión", icon:"💬",  color:"#34d399"},
  summary:    {label:"Resumen",   icon:"🏁",  color:"#fb923c"},
};
const TIMED = ["creating","grouping","voting","discussion"];
const MAX_TITLE = 50;

const RPRI = [
  {id:"minor",    label:"Minor",    color:"#94a3b8", bg:"rgba(148,163,184,.15)"},
  {id:"medium",   label:"Medium",   color:"#60a5fa", bg:"rgba(96,165,250,.15)" },
  {id:"major",    label:"Major",    color:"#fbbf24", bg:"rgba(251,191,36,.15)" },
  {id:"critical", label:"Critical", color:"#f97316", bg:"rgba(249,115,22,.15)" },
  {id:"blocker",  label:"Blocker",  color:"#f87171", bg:"rgba(248,113,113,.15)"},
];
const PMAP = Object.fromEntries(RPRI.map(p=>[p.id,p]));

const ROLE_COLORS = {admin:"#f87171",owner:"#818cf8",temporal:"#fbbf24",member:"#94a3b8"};
const ROLE_LABELS = {admin:"Admin",owner:"Mod. Owner",temporal:"Mod. Temporal",member:"Participante"};
const KANBAN_COLS = [
  {id:"todo",       label:"Por hacer",   color:"#64748b",bg:"rgba(100,116,139,.08)"},
  {id:"inprogress", label:"En progreso", color:"#818cf8",bg:"rgba(129,140,248,.12)"},
  {id:"done",       label:"Hecho",       color:"#4ade80",bg:"rgba(74,222,128,.1)"  },
  {id:"cancelled",  label:"Cancelado",   color:"#f87171",bg:"rgba(248,113,113,.1)" },
];

const fmtT = (s)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const dateR = (d)=>new Date(d).toLocaleDateString("es-ES",{day:"numeric",month:"short",year:"numeric"});
const genId = ()=>Math.random().toString(36).slice(2);

// ════════════════════════════════════════════════════════════════
// UI HELPERS
// ════════════════════════════════════════════════════════════════

function RPriBadge({priority}){
  const p=PMAP[priority]||PMAP.medium;
  return<Badge style={{background:p.bg,color:p.color,fontWeight:700,padding:"1px 7px"}}>{p.label}</Badge>;
}

function RRoleBadge({role}){
  return<Badge style={{background:`${ROLE_COLORS[role]||"#94a3b8"}20`,color:ROLE_COLORS[role]||"#94a3b8",fontSize:11}}>{ROLE_LABELS[role]||role}</Badge>;
}

// ════════════════════════════════════════════════════════════════
// TIMER BAR
// ════════════════════════════════════════════════════════════════

function TimerBar({timer,setTimer,running,setRunning,isMod,phaseMins,setPhaseMins,onNext,nextLabel,extra}){
  const {t}=useTranslation();
  const [editing,setEditing]=useState(false);
  const [editVal,setEditVal]=useState("");
  const pct=phaseMins>0?Math.min(100,(timer/(phaseMins*60))*100):0;
  const tc=timer>60?"var(--green)":timer>20?"#fbbf24":"var(--red)";
  const commit=()=>{const n=parseInt(editVal);if(n>0&&n<=120){setPhaseMins(n);setTimer(n*60);}setEditing(false);};
  return(
    <div style={{position:"sticky",top:0,zIndex:15,background:"var(--sf)",backdropFilter:"blur(10px)",borderBottom:"1px solid var(--bd)",padding:"10px 20px"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,maxWidth:1200,margin:"0 auto"}}>
        <div style={{fontSize:22,fontFamily:"'Sora',sans-serif",fontWeight:700,color:tc,minWidth:60}}>{fmtT(timer)}</div>
        <div style={{flex:1}}>
          <div style={{background:"var(--sf2)",borderRadius:4,height:5,overflow:"hidden",marginBottom:5}}>
            <div style={{width:`${pct}%`,height:"100%",background:tc,borderRadius:4,transition:"width 1s linear"}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {extra}
            {isMod&&(
              <div style={{display:"flex",alignItems:"center",gap:5,marginLeft:"auto"}}>
                <span style={{fontSize:11,color:"var(--tx3)"}}>Duración:</span>
                {editing
                  ?<input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape")setEditing(false);}} style={{width:40,background:"var(--bg,#0c0e14)",border:"1px solid #6366f1",borderRadius:5,padding:"2px 5px",color:"var(--tx)",fontSize:11,textAlign:"center",outline:"none",fontFamily:"inherit"}}/>
                  :<button onClick={()=>{setEditVal(String(phaseMins));setEditing(true);}} style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:5,padding:"2px 7px",color:"var(--tx3)",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{phaseMins} min ✎</button>
                }
              </div>
            )}
          </div>
        </div>
        {isMod&&(
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            <Btn size="sm" variant={running?"warn":"success"} onClick={()=>setRunning(r=>!r)}>{running?"⏸ Pausar":"▶ Iniciar"}</Btn>
            {onNext&&<Btn size="sm" variant="ghost" onClick={onNext}>{nextLabel||t("retro.next")}</Btn>}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// PHASE: LOBBY
// ════════════════════════════════════════════════════════════════

function RetroLobby({user,wsUsers,teams,retroName,setRetroName,selectedTeamId,setSelectedTeamId,phaseTimes,setPhaseTimes,votesPerUser,setVotesPerUser,history,onStart}){
  const upd=(ph,v)=>setPhaseTimes((p)=>({...p,[ph]:Math.max(1,v)}));
  const remaining=MAX_TITLE-retroName.length;
  const myTeams=user.role==="admin"?teams:teams.filter(tm=>tm.members?.some(m=>m.user_id===user.id));
  const lastRetro=history.filter(r=>r.team_id===selectedTeamId).slice(-1)[0];

  return(
    <div style={{maxWidth:680,margin:"0 auto",padding:"20px 18px 60px"}}>
      <div style={{textAlign:"center",marginBottom:22}}>
        <div style={{fontSize:32,marginBottom:8}}>🔁</div>
        <h2 style={{fontFamily:"'Sora',sans-serif",fontSize:18,color:"var(--tx)",marginBottom:4}}>Configuración de la retro</h2>
        <p style={{fontSize:13,color:"var(--tx3)"}}>Configura la sesión antes de que el equipo entre</p>
      </div>
      {myTeams.length>0&&(
        <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:12,padding:"14px 18px",marginBottom:12}}>
          <label style={{display:"block",fontSize:12,color:"var(--tx2)",fontWeight:600,marginBottom:8}}>🏷️ Equipo</label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {myTeams.map(te=>(
              <button key={te.id} onClick={()=>setSelectedTeamId(te.id)}
                style={{padding:"7px 16px",borderRadius:20,border:`1px solid ${selectedTeamId===te.id?te.color:"var(--bd)"}`,background:selectedTeamId===te.id?`${te.color}18`:"transparent",color:selectedTeamId===te.id?te.color:"var(--tx3)",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"inherit"}}>
                {te.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {myTeams.length===0&&(
        <div style={{background:"rgba(248,113,113,.08)",border:"1px solid rgba(248,113,113,.2)",borderRadius:10,padding:"12px 16px",marginBottom:12,fontSize:12,color:"#f87171"}}>
          ⚠ No perteneces a ningún equipo de retro. Pide a un admin que te añada en Admin → Retro Teams.
        </div>
      )}
      {lastRetro&&lastRetro.actionables?.filter(a=>a.status==="open").length>0&&(
        <div style={{background:"rgba(248,113,113,.06)",border:"1px solid rgba(248,113,113,.2)",borderRadius:10,padding:"12px 16px",marginBottom:12}}>
          <div style={{fontSize:12,color:"#f87171",fontWeight:600,marginBottom:6}}>🎯 Accionables abiertos del retro anterior</div>
          {lastRetro.actionables.filter(a=>a.status==="open").slice(0,3).map((a,i)=>(
            <div key={i} style={{fontSize:11,color:"var(--tx3)",paddingLeft:8,borderLeft:"2px solid rgba(248,113,113,.3)",marginBottom:3}}>
              {a.text} — <span style={{color:"var(--tx2)"}}>{a.assignee}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:12,padding:"14px 18px",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
          <label style={{fontSize:12,color:"var(--tx2)",fontWeight:600}}>Nombre de la retrospectiva</label>
          <span style={{fontSize:11,color:remaining<=10?"var(--red)":remaining<=20?"#fbbf24":"var(--tx3)",fontWeight:600}}>{remaining} restantes</span>
        </div>
        <input value={retroName} onChange={e=>setRetroName(e.target.value.slice(0,MAX_TITLE))}
          placeholder="Ej: Retro Sprint 42"
          style={{width:"100%",background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,padding:"10px 13px",color:"var(--tx)",fontSize:14,fontFamily:"'Sora',sans-serif",fontWeight:600,outline:"none"}}/>
      </div>
      <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:12,padding:"12px 18px",marginBottom:12}}>
        <h3 style={{fontFamily:"'Sora',sans-serif",fontSize:12,color:"var(--tx)",margin:"0 0 12px"}}>Tiempo por fase (minutos)</h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {TIMED.map(ph=>(
            <div key={ph} style={{background:"var(--sf2)",borderRadius:8,padding:"9px 12px"}}>
              <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"var(--tx3)",marginBottom:7}}>{PM[ph].icon} {PM[ph].label}</label>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>upd(ph,phaseTimes[ph]-1)} style={{width:24,height:24,borderRadius:5,border:"1px solid var(--bd)",background:"transparent",color:"var(--tx2)",cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>−</button>
                <span style={{fontSize:18,fontWeight:700,color:"var(--tx)",fontFamily:"'Sora',sans-serif",minWidth:24,textAlign:"center"}}>{phaseTimes[ph]}</span>
                <button onClick={()=>upd(ph,phaseTimes[ph]+1)} style={{width:24,height:24,borderRadius:5,border:"1px solid var(--bd)",background:"transparent",color:"var(--tx2)",cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>+</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:12,padding:"12px 18px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <p style={{fontSize:12,color:"var(--tx2)",fontWeight:600}}>🗳 Votos por participante</p>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setVotesPerUser(v=>Math.max(1,v-1))} style={{width:28,height:28,borderRadius:7,border:"1px solid var(--bd)",background:"transparent",color:"var(--tx2)",cursor:"pointer",fontSize:15,fontFamily:"inherit"}}>−</button>
          <span style={{fontSize:22,fontWeight:700,color:"var(--tx)",fontFamily:"'Sora',sans-serif",minWidth:28,textAlign:"center"}}>{votesPerUser}</span>
          <button onClick={()=>setVotesPerUser(v=>Math.min(20,v+1))} style={{width:28,height:28,borderRadius:7,border:"1px solid var(--bd)",background:"transparent",color:"var(--tx2)",cursor:"pointer",fontSize:15,fontFamily:"inherit"}}>+</button>
        </div>
      </div>
      <Btn full onClick={()=>selectedTeamId&&retroName.trim()&&onStart()} disabled={!selectedTeamId||!retroName.trim()} style={{padding:"13px",fontSize:15}}>
        🚀 Comenzar Retrospectiva
      </Btn>
      {(!selectedTeamId||!retroName.trim())&&<p style={{textAlign:"center",fontSize:11,color:"var(--tx3)",marginTop:6}}>Selecciona un equipo y escribe un nombre para continuar</p>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// PHASE: CREATING
// ════════════════════════════════════════════════════════════════

function RetroCreating({isMod,myCards,setMyCards,timer,setTimer,running,setRunning,phaseMins,setPhaseMins,onFinish,currentUser}){
  const [text,setText]=useState("");
  const [cat,setCat]=useState("good");
  const add=()=>{
    if(!text.trim())return;
    setMyCards(p=>[...p,{id:genId(),text:text.trim(),category:cat,author:currentUser.name,authorId:currentUser.id,votes:0,actionable:"",assignee:"",dueDate:"",priority:"medium",merged:[]}]);
    setText("");
  };
  return(
    <div>
      <TimerBar timer={timer} setTimer={setTimer} running={running} setRunning={setRunning} isMod={isMod} phaseMins={phaseMins} setPhaseMins={setPhaseMins} onNext={onFinish} nextLabel="→ Organizar"
        extra={<span style={{fontSize:11,color:"var(--tx3)"}}>Las tarjetas son privadas hasta que el moderador cierre la fase</span>}/>
      <div style={{maxWidth:860,margin:"0 auto",padding:"24px 18px 60px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16}}>
          <div>
            <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:12,padding:"16px 20px",marginBottom:12}}>
              <h3 style={{fontFamily:"'Sora',sans-serif",fontSize:13,color:"var(--tx)",margin:"0 0 11px"}}>Nueva tarjeta</h3>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
                {RC.map((c)=>(
                  <button key={c.id} onClick={()=>setCat(c.id)} style={{padding:"7px 10px",borderRadius:7,border:`1px solid ${cat===c.id?c.color:"var(--bd)"}`,background:cat===c.id?c.dim:"transparent",color:cat===c.id?c.color:"var(--tx3)",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:4,fontFamily:"inherit"}}>
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
              <textarea value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();add();}}}
                placeholder="Escribe tu observación… (Enter para añadir)" rows={3}
                style={{width:"100%",background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,padding:"9px 11px",color:"var(--tx)",fontSize:13,resize:"none",fontFamily:"inherit",outline:"none"}}/>
              <Btn full onClick={add} style={{marginTop:8}}>+ Añadir tarjeta</Btn>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7}}>
              {RC.map(c=>{const n=myCards.filter(x=>x.category===c.id).length;return(
                <div key={c.id} style={{background:"var(--sf)",border:`1px solid ${c.border}`,borderRadius:8,padding:"8px",textAlign:"center"}}>
                  <div style={{fontSize:13}}>{c.emoji}</div>
                  <div style={{fontSize:18,fontWeight:700,color:c.color,fontFamily:"'Sora',sans-serif"}}>{n}</div>
                </div>
              );})}
            </div>
          </div>
          <div>
            <div style={{fontSize:11,color:"var(--tx3)",marginBottom:7,fontWeight:600}}>Mis tarjetas ({myCards.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {myCards.length===0&&<p style={{color:"var(--tx3)",fontSize:12,textAlign:"center",padding:"26px 0"}}>Aún no has añadido ninguna</p>}
              {myCards.map(card=>{const cc=RC_MAP[card.category];return(
                <div key={card.id} style={{background:"var(--sf)",border:`1px solid ${cc.border}`,borderLeft:`3px solid ${cc.color}`,borderRadius:8,padding:"8px 10px",display:"flex",gap:7}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:10,color:cc.color,marginBottom:2}}>{cc.emoji} {cc.label}</div>
                    <p style={{fontSize:12,color:"var(--tx)",margin:0,lineHeight:1.4}}>{card.text}</p>
                  </div>
                  <button onClick={()=>setMyCards(p=>p.filter(x=>x.id!==card.id))} style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>✕</button>
                </div>
              );})}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// PHASE: GROUPING
// ════════════════════════════════════════════════════════════════

function RetroGrouping({isMod,cards,setCards,timer,setTimer,running,setRunning,phaseMins,setPhaseMins,onFinish}){
  const [dragId,setDragId]=useState(null);
  const [overCol,setOverCol]=useState(null);
  const [expanded,setExpanded]=useState({});
  const dRef=useRef(null);
  const merged=useRef(false);

  const moveToCol=(id,nc)=>setCards((p)=>p.map(c=>c.id===id?{...c,category:nc}:c));
  const mergeInto=(sId,tId)=>{
    if(sId===tId)return;
    setCards((prev)=>{
      const s=prev.find(c=>c.id===sId);if(!s)return prev;
      return prev.filter(c=>c.id!==sId).map(c=>c.id===tId?{...c,merged:[...c.merged,{...s}]}:c);
    });
  };
  const unmerge=(pId,cId)=>{
    setCards((prev)=>{
      const par=prev.find(c=>c.id===pId);if(!par)return prev;
      const ch=par.merged.find(c=>c.id===cId);if(!ch)return prev;
      return[...prev.filter(c=>c.id!==pId),{...par,merged:par.merged.filter(c=>c.id!==cId)},{...ch,category:par.category}];
    });
  };

  return(
    <div>
      <TimerBar timer={timer} setTimer={setTimer} running={running} setRunning={setRunning} isMod={isMod} phaseMins={phaseMins} setPhaseMins={setPhaseMins} onNext={onFinish} nextLabel="→ Votación"
        extra={<span style={{fontSize:11,color:"var(--tx3)"}}>{cards.length} tarjetas — arrastra para mover · 📎 para apilar</span>}/>
      <div style={{maxWidth:1160,margin:"0 auto",padding:"24px 18px 50px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,alignItems:"start"}}>
          {RC.map(cat=>{
            const col=cards.filter(c=>c.category===cat.id);
            const isO=overCol===cat.id;
            return(
              <div key={cat.id}
                onDragOver={e=>{e.preventDefault();setOverCol(cat.id);}}
                onDrop={e=>{e.preventDefault();if(merged.current){merged.current=false;return;}if(dRef.current)moveToCol(dRef.current,cat.id);setOverCol(null);setDragId(null);dRef.current=null;}}
                style={{background:isO?cat.dim:"rgba(255,255,255,.015)",border:`1px solid ${isO?cat.color:"var(--bd)"}`,borderTop:`3px solid ${cat.color}`,borderRadius:11,padding:"11px 9px",minHeight:240,transition:"all .14s"}}>
                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:10}}>
                  <span>{cat.emoji}</span>
                  <span style={{fontFamily:"'Sora',sans-serif",fontSize:12,fontWeight:700,color:cat.color}}>{cat.label}</span>
                  <div style={{marginLeft:"auto",background:cat.dim,color:cat.color,borderRadius:20,padding:"1px 7px",fontSize:11,fontWeight:700}}>{col.length}</div>
                </div>
                {col.length===0&&<div style={{border:`2px dashed ${isO?"rgba(99,102,241,.5)":cat.border}`,borderRadius:8,padding:"16px 6px",textAlign:"center",fontSize:11,color:isO?"#818cf8":"var(--tx3)"}}>{isO?"⬇ Soltar":"Arrastra aquí"}</div>}
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {col.map(card=>{
                    const isDg=dragId===card.id,canSt=!!dragId&&dragId!==card.id,isExp=expanded[card.id];
                    return(
                      <div key={card.id}>
                        <div draggable onDragStart={e=>{dRef.current=card.id;merged.current=false;setDragId(card.id);e.dataTransfer.effectAllowed="move";}} onDragEnd={()=>{setDragId(null);setOverCol(null);dRef.current=null;merged.current=false;}}
                          style={{background:"var(--sf)",border:`1px solid ${cat.border}`,borderRadius:9,padding:"9px 10px",cursor:isDg?"grabbing":"grab",opacity:isDg?.25:1,userSelect:"none"}}>
                          <p style={{fontSize:12,color:"var(--tx)",lineHeight:1.4,margin:"0 0 7px"}}>{card.text}</p>
                          <div style={{display:"flex",alignItems:"center",gap:5}}>
                            <span style={{fontSize:11,color:"var(--tx3)",flex:1}}>{card.author}</span>
                            {canSt&&<div onDragOver={e=>{e.preventDefault();e.stopPropagation();}} onDrop={e=>{e.preventDefault();e.stopPropagation();merged.current=true;if(dRef.current)mergeInto(dRef.current,card.id);setOverCol(null);setDragId(null);dRef.current=null;}} style={{background:"rgba(99,102,241,.18)",border:"2px solid rgba(99,102,241,.6)",borderRadius:20,padding:"2px 8px",fontSize:11,color:"#818cf8",fontWeight:600,cursor:"copy"}}>📎 Apilar</div>}
                            {!canSt&&card.merged?.length>0&&<button onClick={()=>setExpanded((p)=>({...p,[card.id]:!p[card.id]}))} style={{background:"rgba(99,102,241,.14)",border:"1px solid rgba(99,102,241,.3)",borderRadius:20,padding:"2px 7px",fontSize:11,color:"#818cf8",cursor:"pointer",fontFamily:"inherit"}}>📎 {card.merged.length} {isExp?"▴":"▾"}</button>}
                          </div>
                        </div>
                        {card.merged?.length>0&&isExp&&!canSt&&(
                          <div style={{marginLeft:8,marginTop:3,display:"flex",flexDirection:"column",gap:4}}>
                            {card.merged.map(sub=>(
                              <div key={sub.id} style={{background:"rgba(99,102,241,.07)",border:"1px solid rgba(99,102,241,.2)",borderRadius:7,padding:"6px 9px",display:"flex",gap:6,alignItems:"flex-start"}}>
                                <p style={{fontSize:11,color:"var(--tx3)",lineHeight:1.4,flex:1,margin:0}}>{sub.text}</p>
                                <button onClick={()=>unmerge(card.id,sub.id)} style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>⤴</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// PHASE: VOTING
// ════════════════════════════════════════════════════════════════

function RetroVoting({isMod,allCards,myVotes,onVote,onRemove,votesPerUser,timer,setTimer,running,setRunning,phaseMins,setPhaseMins,onFinish}){
  const used=Object.values(myVotes).reduce((a,b)=>a+b,0),rem=votesPerUser-used;
  return(
    <div>
      <TimerBar timer={timer} setTimer={setTimer} running={running} setRunning={setRunning} isMod={isMod} phaseMins={phaseMins} setPhaseMins={setPhaseMins} onNext={onFinish} nextLabel="Cerrar →"/>
      <div style={{maxWidth:1060,margin:"0 auto",padding:"16px 18px 50px"}}>
        <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:14,justifyContent:"center"}}>
          <span style={{fontSize:12,color:"var(--tx3)"}}>Votos restantes:</span>
          {Array.from({length:votesPerUser}).map((_,i)=>(
            <div key={i} style={{width:10,height:10,borderRadius:"50%",background:i<rem?"#6366f1":"var(--sf2)",transition:"background .2s"}}/>
          ))}
          <span style={{fontSize:12,color:"var(--tx3)"}}>{rem}/{votesPerUser}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:16}}>
          {RC.map(cat=>{
            const catCards=allCards.filter(c=>c.category===cat.id);
            return(
              <div key={cat.id}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:9}}>
                  <span>{cat.emoji}</span>
                  <h3 style={{fontFamily:"'Sora',sans-serif",fontSize:12,color:cat.color,margin:0}}>{cat.label}</h3>
                  <span style={{background:cat.dim,color:cat.color,borderRadius:20,padding:"1px 7px",fontSize:11,fontWeight:700,marginLeft:3}}>{catCards.length}</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {catCards.map(card=>{
                    const mv=myVotes[card.id]||0;
                    return(
                      <div key={card.id} style={{background:"var(--sf)",border:`1px solid ${cat.border}`,borderLeft:`3px solid ${cat.color}`,borderRadius:9,padding:"10px 11px"}}>
                        <p style={{fontSize:12,color:"var(--tx)",lineHeight:1.45,margin:"0 0 5px"}}>{card.text}</p>
                        {card.merged?.length>0&&<p style={{fontSize:11,color:"var(--tx3)",margin:"0 0 5px"}}>📎 +{card.merged.length} apilada{card.merged.length>1?"s":""}</p>}
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:11,color:"var(--tx3)",flex:1}}>{card.author}</span>
                          <button onClick={()=>onRemove(card.id)} disabled={mv<=0} style={{width:20,height:20,borderRadius:"50%",border:"1px solid var(--bd)",background:"transparent",color:mv>0?"var(--tx2)":"var(--tx3)",cursor:mv>0?"pointer":"not-allowed",fontSize:13,fontFamily:"inherit"}}>−</button>
                          <div style={{display:"flex",gap:3}}>
                            {Array.from({length:Math.min(card.votes,10)}).map((_,i)=>(
                              <div key={i} style={{width:8,height:8,borderRadius:"50%",background:i<mv?"#6366f1":"rgba(255,255,255,.15)"}}/>
                            ))}
                            {card.votes===0&&<span style={{fontSize:11,color:"var(--tx3)"}}>0</span>}
                          </div>
                          <button onClick={()=>onVote(card.id)} disabled={rem<=0} style={{width:20,height:20,borderRadius:"50%",border:`1px solid rgba(99,102,241,${rem>0?.5:.1})`,background:rem>0?"rgba(99,102,241,.2)":"transparent",color:rem>0?"#818cf8":"var(--tx3)",cursor:rem>0?"pointer":"not-allowed",fontSize:13,fontFamily:"inherit"}}>+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// PHASE: DISCUSSION
// ════════════════════════════════════════════════════════════════

function RetroDiscussion({isMod,sortedCards,setSortedCards,discussIdx,setDiscussIdx,teamMembers,timer,setTimer,running,setRunning,phaseMins,setPhaseMins,onFinish}){
  const card=sortedCards[discussIdx];
  if(!card)return null;
  const cat=RC_MAP[card.category];
  const withAct=sortedCards.filter(c=>c.actionable).length;
  const upd=(f,v)=>setSortedCards((p)=>p.map((c,i)=>i===discussIdx?{...c,[f]:v}:c));
  const people=teamMembers?.length?teamMembers.map(m=>m.name||m.email||""):[];

  return(
    <div>
      <TimerBar timer={timer} setTimer={setTimer} running={running} setRunning={setRunning} isMod={isMod} phaseMins={phaseMins} setPhaseMins={setPhaseMins} onNext={onFinish} nextLabel="Ver Resumen →"/>
      <div style={{maxWidth:980,margin:"0 auto",padding:"14px 18px 50px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 240px",gap:16}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{fontSize:11,color:"var(--tx3)"}}>{discussIdx+1}/{sortedCards.length}</span>
              <div style={{flex:1,background:"var(--sf2)",borderRadius:4,height:4}}>
                <div style={{width:`${((discussIdx+1)/sortedCards.length)*100}%`,height:"100%",background:"var(--ac,#6366f1)",borderRadius:4,transition:"width .3s"}}/>
              </div>
              <span style={{fontSize:11,color:"var(--green)"}}>{withAct}/{sortedCards.length} ✓</span>
            </div>
            <div style={{background:"var(--sf)",border:`1px solid ${cat.border}`,borderLeft:`4px solid ${cat.color}`,borderRadius:13,padding:"16px 20px",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:9}}>
                <span>{cat.emoji}</span>
                <span style={{fontSize:11,color:cat.color,fontWeight:700}}>{cat.label}</span>
                <span style={{marginLeft:"auto",fontSize:11,color:"#818cf8"}}>🗳 {card.votes}</span>
              </div>
              <p style={{fontSize:16,lineHeight:1.65,color:"var(--tx)",margin:0}}>{card.text}</p>
            </div>
            <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:12,padding:"14px 16px"}}>
              <h4 style={{fontFamily:"'Sora',sans-serif",fontSize:12,color:"var(--tx)",margin:"0 0 10px"}}>🎯 Accionable</h4>
              <textarea value={card.actionable} onChange={e=>upd("actionable",e.target.value)} placeholder="¿Qué vamos a hacer? Siguiente paso concreto…" rows={3}
                style={{width:"100%",background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,padding:"8px 10px",color:"var(--tx)",fontSize:12,resize:"none",outline:"none",fontFamily:"inherit",marginBottom:10}}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div>
                  <label style={{display:"block",fontSize:10,color:"var(--tx3)",marginBottom:4}}>Responsable</label>
                  <select value={card.assignee} onChange={e=>upd("assignee",e.target.value)}
                    style={{width:"100%",background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:7,padding:"7px 10px",color:"var(--tx)",fontSize:12,fontFamily:"inherit"}}>
                    <option value="">Sin asignar</option>
                    {people.map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{display:"block",fontSize:10,color:"var(--tx3)",marginBottom:4}}>Fecha límite</label>
                  <input type="date" value={card.dueDate||""} onChange={e=>upd("dueDate",e.target.value)}
                    style={{width:"100%",background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:7,padding:"7px 10px",color:"var(--tx)",fontSize:12,fontFamily:"inherit"}}/>
                </div>
              </div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {RPRI.map((p)=>(
                  <button key={p.id} onClick={()=>upd("priority",p.id)}
                    style={{padding:"3px 10px",borderRadius:20,border:`1px solid ${(card.priority||"medium")===p.id?p.color:"var(--bd)"}`,background:(card.priority||"medium")===p.id?p.bg:"transparent",color:(card.priority||"medium")===p.id?p.color:"var(--tx3)",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>
                    {p.label}
                  </button>
                ))}
              </div>
              {card.actionable&&<div style={{marginTop:10,padding:"5px 10px",background:"rgba(74,222,128,.1)",border:"1px solid rgba(74,222,128,.2)",borderRadius:7,fontSize:11,color:"var(--green)"}}>✓ Accionable registrado</div>}
            </div>
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <Btn variant="ghost" onClick={()=>setDiscussIdx(i=>Math.max(0,i-1))} disabled={discussIdx===0}>← Anterior</Btn>
              <div style={{flex:1}}/>
              {discussIdx<sortedCards.length-1?<Btn onClick={()=>setDiscussIdx(i=>i+1)}>Siguiente →</Btn>:<Btn variant="success" onClick={onFinish}>🏁 Ver resumen</Btn>}
            </div>
          </div>
          <div>
            <div style={{fontSize:11,color:"var(--tx3)",marginBottom:8,fontWeight:600}}>Todas las tarjetas</div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {sortedCards.map((c,i)=>{
                const cc=RC_MAP[c.category],isA=i===discussIdx;
                return(
                  <button key={c.id} onClick={()=>setDiscussIdx(i)}
                    style={{background:isA?"var(--glow,rgba(79,110,247,.1))":"var(--sf2)",border:`1px solid ${isA?"rgba(99,102,241,.4)":"var(--bd)"}`,borderRadius:8,padding:"7px 9px",cursor:"pointer",textAlign:"left",display:"flex",gap:5,alignItems:"flex-start",fontFamily:"inherit"}}>
                    <span style={{fontSize:11}}>{cc.emoji}</span>
                    <span style={{fontSize:11,color:isA?"var(--tx)":"var(--tx3)",flex:1,lineHeight:1.35}}>{c.text.slice(0,44)}{c.text.length>44?"…":""}</span>
                    <div style={{flexShrink:0}}>
                      <span style={{fontSize:9,color:"#818cf8",display:"block"}}>🗳 {c.votes}</span>
                      {c.actionable&&<span style={{fontSize:9,color:"var(--green)",display:"block"}}>✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// PHASE: SUMMARY
// ════════════════════════════════════════════════════════════════

function RetroSummary({sortedCards,retroName,onExit,onAddToKanban}){
  const {t}=useTranslation();
  const [copied,setCopied]=useState(false);
  const [selected,setSelected]=useState({});
  const withAct=sortedCards.filter(c=>c.actionable);
  const without=sortedCards.filter(c=>!c.actionable);
  const doCopy=()=>{
    const text=withAct.map(c=>`• ${c.actionable}\n  ${c.assignee||t("retro.unassigned")} · ${c.dueDate||"—"}`).join("\n\n");
    navigator.clipboard?.writeText(text).catch(()=>{});
    setCopied(true);setTimeout(()=>setCopied(false),2000);
  };
  return(
    <div style={{maxWidth:720,margin:"0 auto",padding:"16px 18px 60px"}}>
      <div style={{textAlign:"center",marginBottom:22}}>
        <div style={{fontSize:36,marginBottom:8}}>🏁</div>
        <p style={{fontSize:11,color:"var(--green)",fontWeight:600,marginBottom:4}}>RETROSPECTIVA COMPLETADA</p>
        <h2 style={{fontFamily:"'Sora',sans-serif",fontSize:20,color:"var(--tx)",margin:0}}>{retroName||"Retrospectiva"}</h2>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:22}}>
        {[{l:t("retro.cardsLabel"),v:sortedCards.length,c:"#818cf8"},{l:t("retro.withActionable"),v:withAct.length,c:"var(--green)"},{l:t("retro.noActionables"),v:without.length,c:"var(--red)"},{l:t("retro.votes"),v:sortedCards.reduce((a,c)=>a+c.votes,0),c:"#fbbf24"}].map((s)=>(
          <div key={s.l} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:11,padding:"11px",textAlign:"center"}}>
            <div style={{fontSize:20,fontWeight:700,fontFamily:"'Sora',sans-serif",color:s.c}}>{s.v}</div>
            <div style={{fontSize:10,color:"var(--tx3)",marginTop:2}}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <Btn variant={copied?"success":"ghost"} full onClick={doCopy}>{copied?"✓ Copiado":t("retro.copyActionables")}</Btn>
      </div>
      {withAct.length>0&&(
        <div style={{background:"var(--sf)",border:"1px solid rgba(129,140,248,.25)",borderRadius:10,padding:"12px 14px",marginBottom:16}}>
          <p style={{fontSize:12,color:"#818cf8",fontWeight:600,marginBottom:10}}>🎯 Añadir al tablero de Accionables</p>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {withAct.map((card,i)=>(
              <label key={i} style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",padding:"7px 10px",borderRadius:8,background:selected[i]?"rgba(99,102,241,.12)":"transparent",border:`1px solid ${selected[i]?"rgba(99,102,241,.4)":"var(--bd)"}`}}>
                <input type="checkbox" checked={!!selected[i]} onChange={()=>setSelected((p)=>({...p,[i]:!p[i]}))} style={{marginTop:2,accentColor:"#6366f1"}}/>
                <div>
                  <p style={{fontSize:12,color:"var(--tx)",margin:"0 0 2px",fontWeight:500}}>{card.actionable}</p>
                  <span style={{fontSize:11,color:"var(--tx3)"}}>{card.assignee||t("retro.unassigned")} · {card.dueDate||"—"}</span>
                </div>
              </label>
            ))}
          </div>
          {Object.values(selected).some(Boolean)&&(
            <Btn full style={{marginTop:10}} onClick={()=>onAddToKanban(withAct.filter((_,i)=>selected[i]))}>
              ✓ Mover seleccionados al tablero
            </Btn>
          )}
        </div>
      )}
      <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:13,overflow:"hidden",marginBottom:14}}>
        <div style={{padding:"12px 20px",borderBottom:"1px solid var(--bd)",display:"flex",alignItems:"center",gap:8}}>
          <h3 style={{fontFamily:"'Sora',sans-serif",fontSize:13,color:"var(--tx)",margin:0}}>🎯 Accionables</h3>
          <span style={{background:"rgba(74,222,128,.1)",color:"var(--green)",borderRadius:20,padding:"2px 8px",fontSize:11,fontWeight:700}}>{withAct.length}</span>
        </div>
        {withAct.length===0&&<p style={{padding:18,color:"var(--tx3)",textAlign:"center",fontSize:13}}>No se definieron accionables</p>}
        {withAct.map((card,i)=>{const cat=RC_MAP[card.category];return(
          <div key={i} style={{padding:"12px 20px",borderBottom:i<withAct.length-1?"1px solid var(--bd)":"none",display:"flex",gap:11}}>
            <div style={{width:3,borderRadius:2,background:cat.color,flexShrink:0}}/>
            <div style={{flex:1}}>
              <p style={{fontSize:11,color:"var(--tx3)",margin:"0 0 3px"}}>{cat.emoji} {card.text}</p>
              <p style={{fontSize:13,color:"var(--tx)",margin:"0 0 6px",fontWeight:600}}>→ {card.actionable}</p>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {card.assignee&&<span style={{background:"var(--sf2)",color:"var(--tx3)",borderRadius:20,padding:"2px 8px",fontSize:11}}>👤 {card.assignee}</span>}
                {card.dueDate&&<span style={{background:"var(--sf2)",color:"var(--tx3)",borderRadius:20,padding:"2px 8px",fontSize:11}}>📅 {card.dueDate}</span>}
                <RPriBadge priority={card.priority||"medium"}/>
              </div>
            </div>
          </div>
        );})}
      </div>
      <div style={{textAlign:"center"}}><Btn variant="ghost" onClick={onExit}>← Volver al dashboard</Btn></div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// RETRO FLOW ORCHESTRATOR
// ════════════════════════════════════════════════════════════════

function RetroFlow({currentUser,wsUsers,teams,history,onFinish,onSaveSession,onAddToKanban}){
  const isMod=["admin","owner"].includes(currentUser.role)||teams.some(tm=>tm.members?.some(m=>m.user_id===currentUser.id&&(m.role==="owner"||m.role==="temporal")));
  const [retroName,setRetroName]=useState("");
  const [votesPerUser,setVotesPerUser]=useState(5);
  const [phaseTimes,setPhaseTimes]=useState({creating:5,grouping:5,voting:3,discussion:3});
  const [timers,setTimers]=useState({creating:300,grouping:300,voting:180,discussion:180});
  const [running,setRunning]=useState({creating:false,grouping:false,voting:false,discussion:false});
  const [phase,setPhase]=useState("lobby");
  const [myCards,setMyCards]=useState([]);
  const [boardCards,setBoardCards]=useState([]);
  const [allCards,setAllCards]=useState([]);
  const [myVotes,setMyVotes]=useState({});
  const [sortedCards,setSortedCards]=useState([]);
  const [discussIdx,setDiscussIdx]=useState(0);
  const [selectedTeamId,setSelectedTeamId]=useState(null);
  const myTeams=currentUser.role==="admin"?teams:teams.filter(tm=>tm.members?.some(m=>m.user_id===currentUser.id));
  const teamMembers=teams.find(tm=>tm.id===selectedTeamId)?.members?.map(m=>wsUsers.find(u=>u.id===m.user_id)).filter(Boolean)||[];

  useEffect(()=>{
    if(myTeams.length>0&&!selectedTeamId)setSelectedTeamId(myTeams[0]?.id);
  },[myTeams.length]);

  useEffect(()=>{
    const id=setInterval(()=>{
      TIMED.forEach(ph=>{
        if(running[ph])setTimers((p)=>({...p,[ph]:Math.max(0,p[ph]-1)}));
      });
    },1000);
    return()=>clearInterval(id);
  },[running]);

  const goTo=(p)=>{
    if(!isMod&&p!==phase)return;
    if(p==="grouping"&&!boardCards.length)setBoardCards([...myCards]);
    if(p==="voting"){const bc=boardCards.length?boardCards:[...myCards];setAllCards(bc.map((c)=>({...c,votes:0})));setMyVotes({});}
    if(p==="discussion"){const base=allCards.length?allCards:[...myCards];setSortedCards([...base].sort((a,b)=>b.votes-a.votes));setDiscussIdx(0);}
    setTimers(prev=>({...prev,[p]:phaseTimes[p]*60}));
    setRunning(prev=>({...prev,[p]:false}));
    setPhase(p);
  };

  const vote=(id)=>{if(Object.values(myVotes).reduce((a,b)=>a+b,0)>=votesPerUser)return;setMyVotes((p)=>({...p,[id]:(p[id]||0)+1}));setAllCards((p)=>p.map(c=>c.id===id?{...c,votes:c.votes+1}:c));};
  const removeVote=(id)=>{if(!myVotes[id])return;setMyVotes((p)=>({...p,[id]:p[id]-1}));setAllCards((p)=>p.map(c=>c.id===id?{...c,votes:c.votes-1}:c));};

  const handleFinish=()=>{
    onSaveSession?.({name:retroName,teamId:selectedTeamId,cards:sortedCards,stats:{cards:sortedCards.length,withAction:sortedCards.filter(c=>c.actionable).length,votes:sortedCards.reduce((a,c)=>a+c.votes,0)},actionables:sortedCards.filter(c=>c.actionable).map((c)=>({id:genId(),text:c.actionable,assignee:c.assignee,dueDate:c.dueDate,priority:c.priority||"medium",status:"open"}))});
    goTo("summary");
  };

  const pi=PHASES.indexOf(phase);
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"auto"}}>
      <div style={{background:"var(--sf)",borderBottom:"1px solid var(--bd)",padding:"0 16px",display:"flex",alignItems:"center",gap:10,height:44,flexShrink:0}}>
        <span style={{fontSize:13,fontWeight:700,color:"var(--tx)",flexShrink:0}}>🔁 {retroName||"Nueva Retro"}</span>
        <nav style={{flex:1,display:"flex",justifyContent:"center",alignItems:"center",gap:1,overflow:"hidden"}}>
          {PHASES.map((p,i)=>{const isA=p===phase,isDone=i<pi,m=PM[p];return(
            <div key={p} style={{display:"flex",alignItems:"center",flexShrink:1}}>
              <button onClick={isMod?()=>goTo(p):undefined} style={{display:"flex",alignItems:"center",gap:3,padding:"3px 7px",borderRadius:20,background:isA?`${m.color}22`:"transparent",border:`1px solid ${isA?m.color:"transparent"}`,cursor:isMod?"pointer":"default",outline:"none",fontFamily:"inherit"}}>
                <span style={{fontSize:10}}>{m.icon}</span>
                <span style={{fontSize:10,color:isA?m.color:isDone?"var(--green)":"var(--tx3)",fontWeight:isA?700:400,whiteSpace:"nowrap"}}>{m.label}</span>
              </button>
              {i<PHASES.length-1&&<span style={{color:"var(--tx3)",fontSize:10}}>›</span>}
            </div>
          );})}
        </nav>
        <button onClick={onFinish} style={{flexShrink:0,background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.3)",borderRadius:8,padding:"5px 12px",color:"var(--red)",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit"}}>
          ← Salir
        </button>
      </div>
      <div>
        {phase==="lobby"&&<RetroLobby user={currentUser} wsUsers={wsUsers} teams={myTeams} retroName={retroName} setRetroName={setRetroName} selectedTeamId={selectedTeamId} setSelectedTeamId={setSelectedTeamId} phaseTimes={phaseTimes} setPhaseTimes={setPhaseTimes} votesPerUser={votesPerUser} setVotesPerUser={setVotesPerUser} history={history} onStart={()=>goTo("creating")}/>}
        {phase==="creating"&&<RetroCreating isMod={isMod} myCards={myCards} setMyCards={setMyCards} timer={timers.creating} setTimer={v=>setTimers((p)=>({...p,creating:v}))} running={running.creating} setRunning={v=>setRunning((p)=>({...p,creating:v}))} phaseMins={phaseTimes.creating} setPhaseMins={v=>setPhaseTimes((p)=>({...p,creating:v}))} onFinish={()=>goTo("grouping")} currentUser={currentUser}/>}
        {phase==="grouping"&&<RetroGrouping isMod={isMod} cards={boardCards} setCards={setBoardCards} timer={timers.grouping} setTimer={v=>setTimers((p)=>({...p,grouping:v}))} running={running.grouping} setRunning={v=>setRunning((p)=>({...p,grouping:v}))} phaseMins={phaseTimes.grouping} setPhaseMins={v=>setPhaseTimes((p)=>({...p,grouping:v}))} onFinish={()=>goTo("voting")}/>}
        {phase==="voting"&&<RetroVoting isMod={isMod} allCards={allCards} myVotes={myVotes} onVote={vote} onRemove={removeVote} votesPerUser={votesPerUser} timer={timers.voting} setTimer={v=>setTimers((p)=>({...p,voting:v}))} running={running.voting} setRunning={v=>setRunning((p)=>({...p,voting:v}))} phaseMins={phaseTimes.voting} setPhaseMins={v=>setPhaseTimes((p)=>({...p,voting:v}))} onFinish={()=>goTo("discussion")}/>}
        {phase==="discussion"&&<RetroDiscussion isMod={isMod} sortedCards={sortedCards} setSortedCards={setSortedCards} discussIdx={discussIdx} setDiscussIdx={setDiscussIdx} teamMembers={teamMembers} timer={timers.discussion} setTimer={v=>setTimers((p)=>({...p,discussion:v}))} running={running.discussion} setRunning={v=>setRunning((p)=>({...p,discussion:v}))} phaseMins={phaseTimes.discussion} setPhaseMins={v=>setPhaseTimes((p)=>({...p,discussion:v}))} onFinish={handleFinish}/>}
        {phase==="summary"&&<RetroSummary sortedCards={sortedCards} retroName={retroName} onExit={onFinish} onAddToKanban={items=>{onAddToKanban(items,retroName,selectedTeamId);onFinish();}}/>}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// HISTORIAL VIEW
// ════════════════════════════════════════════════════════════════

function RetroHistorial({currentUser,history,teams}){
  const {t}=useTranslation();
  const myHistory=currentUser.role==="admin"?history:history.filter(r=>teams.some(tm=>tm.id===r.team_id&&tm.members?.some(m=>m.user_id===currentUser.id)));
  const [selId,setSelId]=useState(myHistory[myHistory.length-1]?.id||null);
  const retro=myHistory.find(r=>r.id===selId);
  const byTeam={};
  [...myHistory].reverse().forEach(r=>{
    const t=teams.find(x=>x.id===r.team_id);
    const key=t?.id||"none";
    if(!byTeam[key])byTeam[key]={team:t,retros:[]};
    byTeam[key].retros.push(r);
  });
  return(
    <div style={{display:"flex",height:"100%",overflow:"hidden"}}>
      <div style={{width:"clamp(180px,28%,240px)",flexShrink:0,borderRight:"1px solid var(--bd)",overflowY:"auto",padding:"12px 6px"}}>
        <p style={{fontSize:11,color:"var(--tx3)",fontWeight:600,marginBottom:10,padding:"0 8px"}}>RETROSPECTIVAS</p>
        {Object.values(byTeam).map(({team,retros})=>(
          <div key={team?.id||"none"} style={{marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px 6px",borderBottom:"1px solid var(--bd)",marginBottom:4}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:team?.color||"#64748b"}}/>
              <span style={{fontSize:11,color:team?.color||"#64748b",fontWeight:700}}>{team?.name||t("retro.noTeams")}</span>
              <span style={{fontSize:10,color:"var(--tx3)",marginLeft:"auto"}}>{retros.length}</span>
            </div>
            {retros.map(r=>{
              const active=selId===r.id;
              return(
                <button key={r.id} onClick={()=>setSelId(r.id)} style={{width:"100%",background:active?"rgba(99,102,241,.15)":"transparent",border:`1px solid ${active?"rgba(99,102,241,.4)":"transparent"}`,borderRadius:8,padding:"8px 10px",cursor:"pointer",textAlign:"left",marginBottom:3,fontFamily:"inherit"}}>
                  <div style={{fontSize:12,color:active?"var(--tx)":"var(--tx3)",fontWeight:active?600:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:2}}>{r.name}</div>
                  <div style={{display:"flex",gap:6}}>
                    <span style={{fontSize:10,color:"var(--tx3)"}}>{r.date?dateR(r.date):""}</span>
                    <span style={{fontSize:10,color:"var(--green)"}}>🎯{r.stats?.withAction||0}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
        {myHistory.length===0&&<p style={{color:"var(--tx3)",fontSize:12,padding:"12px 8px"}}>Sin retrospectivas</p>}
      </div>
      {retro?(
        <div style={{flex:1,overflowY:"auto",padding:24}}>
          <div style={{marginBottom:20}}>
            <h2 style={{fontFamily:"'Sora',sans-serif",fontSize:18,color:"var(--tx)",marginBottom:6}}>{retro.name}</h2>
            <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:12}}>
              <span style={{fontSize:12,color:"var(--tx3)"}}>{retro.date?dateR(retro.date):""}</span>
              {teams.find(tm=>tm.id===retro.team_id)&&<span style={{fontSize:12,color:teams.find(tm=>tm.id===retro.team_id)?.color,fontWeight:600}}>{teams.find(tm=>tm.id===retro.team_id)?.name}</span>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:10}}>
              {[{l:t("retro.cardsLabel"),v:retro.stats?.cards||0,c:"#818cf8"},{l:t("retro.withActionable"),v:retro.stats?.withAction||0,c:"var(--green)"},{l:t("retro.votes"),v:retro.stats?.votes||0,c:"#fbbf24"}].map((s)=>(
                <div key={s.l} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:11,padding:"10px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:700,fontFamily:"'Sora',sans-serif",color:s.c}}>{s.v}</div>
                  <div style={{fontSize:10,color:"var(--tx3)",marginTop:2}}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Cards by category */}
          {retro.cards&&retro.cards.length>0&&(
            <>
              <h3 style={{fontFamily:"'Sora',sans-serif",fontSize:13,color:"var(--tx3)",marginBottom:10}}>📋 Tarjetas</h3>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10,marginBottom:20}}>
                {[{id:"good",label:"Hacemos Bien",color:"#22c55e"},{id:"bad",label:"Hacemos Mal",color:"#ef4444"},{id:"change",label:"Deberíamos Cambiar",color:"#818cf8"},{id:"stop",label:"Dejar de Hacer",color:"#f59e0b"}].map(cat=>{
                  const catCards=(retro.cards||[]).filter(c=>c.category===cat.id);
                  if(!catCards.length)return null;
                  return(
                    <div key={cat.id} style={{background:"var(--sf)",border:`1px solid ${cat.color}33`,borderRadius:11,padding:12}}>
                      <div style={{fontSize:11,fontWeight:700,color:cat.color,marginBottom:8,textTransform:"uppercase",letterSpacing:".5px"}}>{cat.label} ({catCards.length})</div>
                      {catCards.map((c,i)=>(
                        <div key={c.id||i} style={{fontSize:12,color:"var(--tx2)",marginBottom:6,paddingBottom:6,borderBottom:i<catCards.length-1?"1px solid var(--bd)":"none"}}>
                          <p style={{margin:"0 0 2px"}}>{c.text}</p>
                          <div style={{display:"flex",gap:8,fontSize:10,color:"var(--tx3)"}}>
                            <span>👤 {c.author}</span>
                            {c.votes>0&&<span>👍 {c.votes}</span>}
                            {c.actionable&&<span style={{color:"var(--green)"}}>✓ Accionable</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <h3 style={{fontFamily:"'Sora',sans-serif",fontSize:13,color:"var(--tx3)",marginBottom:10}}>🎯 Accionables</h3>
          <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:12,overflow:"hidden"}}>
            {(!retro.actionables||retro.actionables.length===0)&&<p style={{padding:16,color:"var(--tx3)",fontSize:13,textAlign:"center"}}>Sin accionables</p>}
            {(retro.actionables||[]).map((a,i)=>(
              <div key={i} style={{padding:"10px 16px",borderBottom:i<retro.actionables.length-1?"1px solid var(--bd)":"none",display:"flex",gap:12,alignItems:"center"}}>
                <span style={{fontSize:16}}>{a.status==="done"?"✅":"⭕"}</span>
                <div style={{flex:1}}>
                  <p style={{fontSize:13,margin:"0 0 3px",color:a.status==="done"?"var(--tx3)":"var(--tx)",textDecoration:a.status==="done"?"line-through":"none"}}>{a.text}</p>
                  <div style={{display:"flex",gap:10}}>
                    {a.assignee&&<span style={{fontSize:11,color:"var(--tx3)"}}>👤 {a.assignee}</span>}
                    {a.dueDate&&<span style={{fontSize:11,color:"var(--tx3)"}}>📅 {a.dueDate}</span>}
                    {a.priority&&<RPriBadge priority={a.priority}/>}
                  </div>
                </div>
                <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:600,background:a.status==="done"?"rgba(74,222,128,.1)":"rgba(248,113,113,.1)",color:a.status==="done"?"var(--green)":"var(--red)"}}>{a.status==="done"?t("retro.closed"):t("retro.open")}</span>
              </div>
            ))}
          </div>
        </div>
      ):(
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--tx3)",fontSize:14}}>Selecciona una retrospectiva</div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ACCIONABLES KANBAN — con persistencia a Supabase (FIX Issue #2)
// ════════════════════════════════════════════════════════════════

function RetroAccionables({currentUser,items,setItems,history,teams}){
  const {t}=useTranslation();
  const [filterTeam,setFilterTeam]=useState("");
  const [filterPri,setFilterPri]=useState("");
  const [dragState,setDragState]=useState(null);

  // ── CARGA INICIAL desde Supabase ──────────────────────────────
  useEffect(()=>{
    actionableRepo.findAll()
      .then(data=>{
        if(data?.length){
          setItems(data.map(d=>({id:d.id,text:d.text,assignee:d.assignee,dueDate:d.due_date,priority:d.priority,status:d.status||"todo",sessionId:d.session_id,teamId:d.team_id})));
        }
      })
      .catch(e=>console.error("retro_actionables load error:",e.message));
  },[]);

  const baseItems=history.flatMap(r=>{
    const team=teams.find(tm=>tm.id===r.team_id);
    return(r.actionables||[]).map((a)=>({...a,retroName:r.name,teamId:r.team_id,teamName:team?.name||"—",id:a.id||genId()}));
  });

  // Merge: overlay DB status on history items + include DB-only items
  const baseIds=new Set(baseItems.map(b=>b.id));
  const merged=[
    ...baseItems.map(base=>{
      const edit=(items||[]).find(x=>x.id===base.id);
      return edit?{...base,...edit}:{...base,status:base.status||"todo"};
    }),
    ...(items||[]).filter(x=>!baseIds.has(x.id)).map(x=>({...x,status:x.status||"todo",retroName:"",teamName:"—"})),
  ];

  // ── MOVE con persistencia a Supabase ─────────────────────────
  const move=async(id,newStatus)=>{
    // Actualizar React state inmediatamente (optimista)
    setItems((prev)=>{
      const ex=prev.find(x=>x.id===id);
      if(ex)return prev.map(x=>x.id===id?{...x,status:newStatus}:x);
      return[...prev,{id,status:newStatus}];
    });
    // Persistir a Supabase
    try{ await actionableRepo.updateStatus(id,newStatus); }
    catch(e){ console.error("[RetroBoard] Move error:",e.message); }
  };

  const vis=merged.filter(item=>{
    if(filterTeam&&item.teamId!==filterTeam)return false;
    if(filterPri&&(item.priority||"medium")!==filterPri)return false;
    return true;
  });

  const colItems=colId=>vis.filter((x)=>(x.status||"todo")===colId);
  const handleDrop=(targetColId,draggedId)=>{move(draggedId,targetColId);setDragState(null);};

  return(
    <div style={{padding:"16px 20px",paddingBottom:60}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <h2 style={{fontFamily:"'Sora',sans-serif",fontSize:17,color:"var(--tx)",margin:0}}>🎯 Tablero de Accionables</h2>
        <div style={{marginLeft:"auto",display:"flex",gap:8,flexWrap:"wrap"}}>
          <select value={filterTeam} onChange={e=>setFilterTeam(e.target.value)} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:7,padding:"5px 10px",color:"var(--tx)",fontSize:12,fontFamily:"inherit"}}>
            <option value="">Todos los equipos</option>
            {teams.map(tm=><option key={tm.id} value={tm.id}>{tm.name}</option>)}
          </select>
          <select value={filterPri} onChange={e=>setFilterPri(e.target.value)} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:7,padding:"5px 10px",color:"var(--tx)",fontSize:12,fontFamily:"inherit"}}>
            <option value="">Todas las prioridades</option>
            {RPRI.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {(filterTeam||filterPri)&&<Btn size="sm" variant="ghost" onClick={()=>{setFilterTeam("");setFilterPri("");}}>✕ Limpiar</Btn>}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,alignItems:"start",marginTop:16}}>
        {KANBAN_COLS.map(col=>{
          const colItms=colItems(col.id);
          const isDragTarget=dragState&&dragState.fromCol!==col.id;
          return(
            <div key={col.id}
              onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";}}
              onDrop={e=>{e.preventDefault();if(dragState)handleDrop(col.id,dragState.id);}}
              style={{
                background:isDragTarget?`${col.bg}`:"var(--sf)",
                border:`1px solid ${isDragTarget?col.color:"var(--bd)"}`,
                borderTop:`3px solid ${col.color}`,
                borderRadius:11,
                padding:"10px 8px",
                minHeight:200,
                transition:"all .14s"
              }}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
                <span style={{fontSize:12,fontWeight:700,color:col.color,fontFamily:"'Sora',sans-serif"}}>{col.label}</span>
                <div style={{marginLeft:"auto",background:col.bg,color:col.color,borderRadius:20,padding:"1px 7px",fontSize:11,fontWeight:700,border:`1px solid ${col.color}44`}}>{colItms.length}</div>
              </div>
              {colItms.length===0&&(
                <div style={{border:`2px dashed ${isDragTarget?col.color:"var(--bd)"}`,borderRadius:8,padding:"16px 6px",textAlign:"center",fontSize:11,color:isDragTarget?col.color:"var(--tx3)"}}>
                  {isDragTarget?"⬇ Soltar aquí":t("retro.noActionables")}
                </div>
              )}
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {colItms.map(item=>{
                  const isDragging=dragState?.id===item.id;
                  return(
                    <div key={item.id}
                      draggable
                      onDragStart={()=>setDragState({id:item.id,fromCol:col.id})}
                      onDragEnd={()=>setDragState(null)}
                      style={{
                        background:"var(--sf2)",
                        border:"1px solid var(--bd)",
                        borderRadius:9,
                        padding:"10px 11px",
                        cursor:"grab",
                        opacity:isDragging?0.3:1,
                        userSelect:"none",
                        transition:"opacity .15s"
                      }}>
                      <div style={{display:"flex",alignItems:"flex-start",gap:7,marginBottom:6}}>
                        <RPriBadge priority={item.priority||"medium"}/>
                        <span style={{fontSize:10,color:"var(--tx3)",marginLeft:"auto",flexShrink:0}}>{item.teamName}</span>
                      </div>
                      <p style={{fontSize:12,color:"var(--tx)",margin:"0 0 5px",lineHeight:1.4,fontWeight:500}}>{item.actionable||item.text}</p>
                      {item.text&&item.actionable&&<p style={{fontSize:11,color:"var(--tx3)",margin:"0 0 5px",lineHeight:1.35}}>{item.text}</p>}
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                        {item.assignee&&<span style={{fontSize:10,color:"var(--tx3)"}}>👤 {item.assignee}</span>}
                        {item.dueDate&&<span style={{fontSize:10,color:"var(--tx3)"}}>📅 {item.dueDate}</span>}
                      </div>
                      {/* Botones de cambio de estado rápido */}
                      <div style={{display:"flex",gap:4,marginTop:8,flexWrap:"wrap"}}>
                        {KANBAN_COLS.filter(c=>c.id!==col.id).map(nc=>(
                          <button key={nc.id} onClick={()=>move(item.id,nc.id)}
                            style={{padding:"2px 7px",borderRadius:20,border:`1px solid ${nc.color}44`,background:nc.bg,color:nc.color,cursor:"pointer",fontSize:9,fontWeight:700,fontFamily:"inherit"}}>
                            → {nc.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {vis.length===0&&(
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--tx3)"}}>
          <div style={{fontSize:24,marginBottom:8}}>🎯</div>
          <div style={{fontSize:13}}>Sin accionables todavía</div>
          <div style={{fontSize:11,marginTop:4}}>Completa una retrospectiva para ver los accionables aquí</div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ADMIN: RETRO TEAMS
// ════════════════════════════════════════════════════════════════

export function AdminRetroTeams({wsUsers,teams,setTeams}){
  const dialog=useDialog();
  const [sel,setSel]=useState(null);
  const [form,setForm]=useState({name:"",color:"#6366f1"});
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");

  const selTeam=teams.find(tm=>tm.id===sel);

  const createTeam=async()=>{
    if(!form.name.trim())return;
    setSaving(true);
    try{
      const data=await teamRepo.createTeam(form.name.trim(),form.color);
      setTeams(prev=>[...prev,{...data,members:[]}]);setSel(data.id);setForm({name:"",color:"#6366f1"});
    }catch(e){setMsg(e.message||"Error");}
    setSaving(false);
  };

  const deleteTeam=async(id)=>{
    if(!(await dialog.confirm("¿Eliminar este equipo?",{danger:true})))return;
    await teamRepo.deleteTeam(id);
    setTeams(prev=>prev.filter(x=>x.id!==id));
    if(sel===id)setSel(null);
  };

  const addMember=async(userId,role="member")=>{
    if(!selTeam)return;
    const u=wsUsers.find(x=>x.id===userId);
    if(!u)return;
    try{
      const data=await teamRepo.addMember(selTeam.id,userId,role);
      setTeams(ts=>ts.map(tm=>tm.id===selTeam.id?{...tm,members:[...tm.members,{...data,name:u.name,email:u.email}]}:tm));
    }catch(e){console.error("addMember error:",e.message);}
  };

  const removeMember=async(userId)=>{
    if(!selTeam)return;
    await teamRepo.removeMember(selTeam.id,userId);
    setTeams(ts=>ts.map(tm=>tm.id===selTeam.id?{...tm,members:tm.members.filter(m=>m.user_id!==userId)}:tm));
  };

  const updateRole=async(userId,role)=>{
    if(!selTeam)return;
    await teamRepo.updateMemberRole(selTeam.id,userId,role);
    setTeams(ts=>ts.map(tm=>tm.id===selTeam.id?{...tm,members:tm.members.map(m=>m.user_id===userId?{...m,role}:m)}:tm));
  };

  const nonMembers=wsUsers.filter(u=>!selTeam?.members?.some(m=>m.user_id===u.id));

  return(
    <div style={{display:"flex",gap:0,height:"100%",flex:1,minHeight:0}}>
      {/* Sidebar */}
      <div style={{width:220,borderRight:"1px solid var(--bd)",display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:"10px 12px",borderBottom:"1px solid var(--bd)"}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>Equipos</div>
          <div style={{display:"flex",gap:6,marginBottom:6}}>
            <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
              onKeyDown={e=>{if(e.key==="Enter")createTeam();}}
              placeholder="Nombre del equipo"
              style={{flex:1,background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:6,padding:"5px 8px",color:"var(--tx)",fontSize:11,fontFamily:"inherit",outline:"none"}}/>
            <input type="color" value={form.color} onChange={e=>setForm(f=>({...f,color:e.target.value}))}
              style={{width:28,height:28,border:"none",background:"none",cursor:"pointer",padding:0,flexShrink:0}}/>
          </div>
          <button onClick={createTeam} disabled={saving||!form.name.trim()}
            style={{width:"100%",background:"var(--ac)",color:"#fff",border:"none",borderRadius:6,padding:"5px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:saving||!form.name.trim()?.5:1}}>
            {saving?"...":"+ Crear equipo"}
          </button>
          {msg&&<div style={{fontSize:10,color:"var(--red)",marginTop:4}}>{msg}</div>}
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {teams.map(team=>(
            <div key={team.id} style={{display:"flex",alignItems:"center",padding:"8px 12px",cursor:"pointer",background:sel===team.id?"var(--glow)":"transparent",borderLeft:`2px solid ${sel===team.id?team.color:"transparent"}`,borderBottom:"1px solid var(--bd)"}}
              onClick={()=>setSel(team.id)}>
              <div style={{width:8,height:8,borderRadius:"50%",background:team.color,flexShrink:0,marginRight:8}}/>
              <div style={{flex:1,fontSize:12,fontWeight:sel===team.id?600:400,color:sel===team.id?team.color:"var(--tx2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{team.name}</div>
              <span style={{fontSize:10,color:"var(--tx3)"}}>{team.members?.length||0}</span>
              <button onClick={e=>{e.stopPropagation();deleteTeam(team.id);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:"var(--tx3)",padding:"0 3px",marginLeft:4}}>×</button>
            </div>
          ))}
          {teams.length===0&&<div style={{padding:"14px 12px",fontSize:11,color:"var(--tx3)"}}>Sin equipos</div>}
        </div>
      </div>

      {/* Right panel */}
      {selTeam?(
        <div style={{flex:1,padding:20,overflowY:"auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
            <div style={{width:12,height:12,borderRadius:"50%",background:selTeam.color}}/>
            <h3 style={{fontFamily:"'Sora',sans-serif",fontSize:16,color:"var(--tx)",margin:0}}>{selTeam.name}</h3>
            <span style={{fontSize:11,color:"var(--tx3)"}}>{selTeam.members?.length||0} miembros</span>
          </div>

          {/* Members */}
          <div style={{marginBottom:20}}>
            <div style={{fontSize:10,fontWeight:700,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:10}}>Miembros</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {(selTeam.members||[]).map(m=>(
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:"var(--ac)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",flexShrink:0}}>
                    {(m.name||"?").slice(0,2).toUpperCase()}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600,color:"var(--tx)"}}>{m.name||m.email}</div>
                  </div>
                  <select value={m.role||"member"} onChange={e=>updateRole(m.user_id,e.target.value)}
                    style={{background:"var(--sf3)",border:"1px solid var(--bd)",borderRadius:5,padding:"3px 7px",fontSize:11,color:"var(--tx)",fontFamily:"inherit"}}>
                    <option value="member">Participante</option>
                    <option value="owner">Mod. Owner</option>
                    <option value="temporal">Mod. Temporal</option>
                  </select>
                  <button onClick={()=>removeMember(m.user_id)} style={{background:"none",border:"none",color:"var(--red)",cursor:"pointer",fontSize:14}}>×</button>
                </div>
              ))}
              {(!selTeam.members||selTeam.members.length===0)&&<div style={{fontSize:12,color:"var(--tx3)",textAlign:"center",padding:"12px 0"}}>Sin miembros</div>}
            </div>
          </div>

          {/* Add members */}
          {nonMembers.length>0&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:10}}>Añadir miembros</div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {nonMembers.map(u=>(
                  <div key={u.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:7}}>
                    <div style={{flex:1,fontSize:12,color:"var(--tx2)"}}>{u.name||u.email}</div>
                    <button onClick={()=>addMember(u.id,"member")}
                      style={{padding:"3px 10px",borderRadius:6,border:"1px solid var(--bd)",background:"var(--sf2)",color:"var(--tx2)",cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>
                      + Añadir
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ):(
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--tx3)",fontSize:13}}>
          ← Selecciona un equipo para gestionarlo
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MAIN EXPORT: RetroBoard
// ════════════════════════════════════════════════════════════════

export function RetroBoard({currentUser,wsUsers,lang}){
  const {t}=useTranslation();
  const [view,setView]=useState("board"); // "board" | "historial" | "accionables"
  const [retroActive,setRetroActive]=useState(false);
  const [history,setHistory]=useState([]);
  const [teams,setTeams]=useState([]);
  const [kanbanItems,setKanbanItems]=useState([]);

  useEffect(()=>{
    Promise.all([
      sessionRepo.findAll(),
      teamRepo.findAllTeams(),
      teamRepo.findAllMembers(),
      actionableRepo.findAll(),
    ]).then(([sessions,teamsData,members,actionables])=>{
      const actBySession={};
      (actionables||[]).forEach(a=>{
        if(!actBySession[a.session_id])actBySession[a.session_id]=[];
        actBySession[a.session_id].push({id:a.id,text:a.text,assignee:a.assignee,dueDate:a.due_date,priority:a.priority,status:a.status});
      });
      setHistory((sessions||[]).map(s=>({...s,date:s.created_at,cards:s.stats?.cards_data||[],actionables:actBySession[s.id]||[]})));
      setTeams((teamsData||[]).map(tm=>({...tm,members:(members||[]).filter(m=>m.team_id===tm.id).map(m=>{const u=wsUsers.find(x=>x.id===m.user_id);return{...m,name:u?.name,email:u?.email};})})));
    }).catch(e=>console.error("[RetroBoard] Load error:",e.message));
  },[wsUsers.length]);

  const saveSession=async(session)=>{
    try{
      const data=await sessionRepo.save({
        name:session.name,
        team_id:session.teamId,
        status:"closed",
        phase:"summary",
        votes_per_user:session.stats?.votesPerUser||5,
        phase_times:session.phaseTimes||{creating:5,grouping:5,voting:3,discussion:3},
        stats:{...session.stats,cards_data:session.cards},
      });
      const acts=(session.actionables||[]).filter(a=>a.id);
      if(acts.length){
        await actionableRepo.upsertMany(
          acts.map((a,i)=>({id:a.id,text:a.text,assignee:a.assignee||"",due_date:a.dueDate||null,priority:a.priority||"medium",status:a.status||"todo",sort_order:i,session_id:data.id,team_id:session.teamId,retro_name:session.name}))
        );
      }
      setHistory(h=>[{...data,date:data.created_at,cards:data.stats?.cards_data||[],actionables:acts},...h]);
    }catch(e){console.error("[RetroBoard] Save session error:",e.message);}
  };

  const addToKanban=async(items)=>{
    const newItems=items.map(i=>({...i,id:i.id||genId(),status:i.status||"todo"}));
    setKanbanItems(prev=>[...prev,...newItems.filter(ni=>!prev.some(p=>p.id===ni.id))]);
    const rows=newItems.map((a,i)=>({id:a.id,text:a.text||a.actionable||"",assignee:a.assignee||"",due_date:a.dueDate||null,priority:a.priority||"medium",status:a.status||"todo",sort_order:i,session_id:a.sessionId||null,team_id:a.teamId||null,retro_name:a.retroName||""}));
    if(rows.length){
      try{ await actionableRepo.upsertMany(rows); }
      catch(e){ console.error("[RetroBoard] addToKanban error:", e.message); }
    }
    setView("accionables");
  };

  if(retroActive){
    return<RetroFlow currentUser={currentUser} wsUsers={wsUsers} teams={teams} history={history} onFinish={()=>setRetroActive(false)} onSaveSession={saveSession} onAddToKanban={addToKanban}/>;
  }

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:"var(--bg)"}}>
      {/* Nav */}
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"10px 18px",background:"var(--sf)",borderBottom:"1px solid var(--bd)",flexShrink:0}}>
        <span style={{fontSize:14,fontWeight:700,color:"var(--tx)",marginRight:8}}>🔁 RetroBoard</span>
        {[{id:"board",label:"Tablero"},{id:"historial",label:"Historial"},{id:"accionables",label:"Accionables"+(kanbanItems.length>0?" ("+kanbanItems.length+")":""),}].map(v=>(
          <button key={v.id} onClick={()=>setView(v.id)}
            style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${view===v.id?"rgba(99,102,241,.4)":"var(--bd)"}`,background:view===v.id?"rgba(99,102,241,.15)":"transparent",color:view===v.id?"#818cf8":"var(--tx3)",cursor:"pointer",fontSize:12,fontWeight:view===v.id?600:400,fontFamily:"inherit"}}>
            {v.label}
          </button>
        ))}
        <div style={{marginLeft:"auto"}}>
          <Btn onClick={()=>setRetroActive(true)}>🚀 Nueva Retro</Btn>
        </div>
      </div>

      {/* Content */}
      <div style={{flex:1,overflow:"auto"}}>
        {view==="board"&&(
          <div style={{padding:24,textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:12}}>🔁</div>
            <h2 style={{fontFamily:"'Sora',sans-serif",fontSize:18,color:"var(--tx)",marginBottom:8}}>Retrospectivas del equipo</h2>
            <p style={{fontSize:13,color:"var(--tx3)",marginBottom:20}}>Organiza retrospectivas estructuradas: crear tarjetas, votar, definir accionables.</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,maxWidth:600,margin:"0 auto 24px"}}>
              {[{l:"Retros",v:history.length,c:"#818cf8"},{l:t("retro.teams"),v:teams.length,c:teams[0]?.color||"var(--ac)"},{l:"Accionables",v:history.reduce((a,r)=>a+(r.actionables?.length||0),0),c:"var(--green)"}].map(s=>(
                <div key={s.l} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:12,padding:14,textAlign:"center"}}>
                  <div style={{fontSize:24,fontWeight:700,color:s.c,fontFamily:"'Sora',sans-serif"}}>{s.v}</div>
                  <div style={{fontSize:11,color:"var(--tx3)",marginTop:4}}>{s.l}</div>
                </div>
              ))}
            </div>
            <Btn onClick={()=>setRetroActive(true)} style={{padding:"12px 28px",fontSize:14}}>🚀 Iniciar nueva retrospectiva</Btn>
          </div>
        )}
        {view==="historial"&&<RetroHistorial currentUser={currentUser} history={history} teams={teams}/>}
        {view==="accionables"&&<RetroAccionables currentUser={currentUser} items={kanbanItems} setItems={setKanbanItems} history={history} teams={teams}/>}
      </div>
    </div>
  );
}
