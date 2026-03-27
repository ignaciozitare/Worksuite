// ─── Environments.jsx (EnvTracker.jsx) — Reservas de entornos de despliegue────
// Wrapper ligero que re-exporta las secciones de admin y monta EnvironmentsModule
import EnvironmentsModule from './EnvironmentsModule';
import { useState, useEffect } from 'react';

// ── helpers de estilo (css vars WorkSuite) ─────────────────────────────────
const SI = (extra={}) => ({
  background:"var(--sf2)", border:"1px solid var(--bd)",
  borderRadius:8, padding:"8px 12px", fontSize:13, color:"var(--tx)",
  width:"100%", outline:"none", fontFamily:"inherit", ...extra,
});
const SB = (variant="primary", extra={}) => ({
  background:variant==="primary"?"var(--ac)":variant==="danger"?"#dc2626":variant==="success"?"#16a34a":variant==="warning"?"#d97706":"transparent",
  color:variant==="ghost"?"var(--tx3)":variant==="outline"?"var(--ac)":"#fff",
  border:variant==="outline"?"1px solid var(--ac)":"none",
  borderRadius:8, cursor:"pointer", fontWeight:500, fontSize:13,
  padding:"6px 14px", transition:"all .15s", fontFamily:"inherit", ...extra,
});
const Lbl = ({c}) => <label style={{display:"block",fontSize:11,fontWeight:600,color:"var(--tx3)",marginBottom:5,textTransform:"uppercase",letterSpacing:".05em"}}>{c}</label>;
const Err = ({m}) => m?<p style={{color:"#ef4444",fontSize:11,marginTop:4}}>⚠ {m}</p>:null;

const ENV_PALETTE=[
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e","#10b981","#14b8a6",
  "#06b6d4","#0ea5e9","#3b82f6","#6366f1","#8b5cf6","#a855f7","#ec4899","#f43f5e",
  "#7c3aed","#9333ea","#db2777","#e11d48","#dc2626","#0891b2","#0284c7","#2563eb",
];
const uid=()=>Math.random().toString(36).slice(2,10);
const CC={ DEV:{badge:"rgba(124,58,237,.15)",btext:"#a78bfa"},PRE:{badge:"rgba(180,83,9,.15)",btext:"#fbbf24"},STAGING:{badge:"rgba(14,116,144,.15)",btext:"#22d3ee"} };

function Modal({children,onClose}){return(<div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.65)",padding:16}} onClick={onClose}><div onClick={e=>e.stopPropagation()} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:16,boxShadow:"0 24px 80px rgba(0,0,0,.6)",maxWidth:520,width:"100%",maxHeight:"90vh",overflowY:"auto"}}>{children}</div></div>);}
function MHead({title,onClose}){return(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid var(--bd)"}}><span style={{fontWeight:700,fontSize:15,color:"var(--tx)"}}>{title}</span><button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:20,lineHeight:1}}>×</button></div>);}
function Confirm({title,msg,label,variant,onOk,onClose}){return(<div style={{position:"fixed",inset:0,zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.72)"}} onClick={onClose}><div onClick={e=>e.stopPropagation()} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:14,maxWidth:400,width:"100%",overflow:"hidden"}}><div style={{padding:"18px 20px 14px",borderBottom:"1px solid var(--bd)"}}><span style={{fontWeight:700,fontSize:15,color:"var(--tx)"}}>{title}</span></div><div style={{padding:"16px 20px"}}><p style={{color:"var(--tx3)",fontSize:13,lineHeight:1.6,marginBottom:20}}>{msg}</p><div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button style={SB("ghost")} onClick={onClose}>Cancelar</button><button style={SB(variant)} onClick={()=>{onOk();onClose();}}>{label}</button></div></div></div></div>);}

function ColorPicker({value,onChange}){
  const [open,setOpen]=useState(false);
  return(<div style={{position:"relative",display:"inline-block"}}>
    <div onClick={()=>setOpen(o=>!o)} style={{width:34,height:34,borderRadius:7,background:value||"#6366f1",cursor:"pointer",border:"2px solid var(--bd)",boxShadow:`0 0 0 2px ${value||"#6366f1"}44`}}/>
    {open&&<div style={{position:"absolute",top:"calc(100%+8px)",left:0,zIndex:600,background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:12,padding:10,boxShadow:"0 12px 40px rgba(0,0,0,.5)",width:200}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:4}}>
        {ENV_PALETTE.map(c=><div key={c} onClick={()=>{onChange(c);setOpen(false);}} style={{width:20,height:20,borderRadius:4,background:c,cursor:"pointer",border:value===c?"2px solid #fff":"2px solid transparent"}}/>)}
      </div>
    </div>}
  </div>);
}

// ── Admin: Entornos ─────────────────────────────────────────────────────────
export function AdminEnvEnvironments({supabase}){
  const [envs,setEnvs]=useState([]);
  const [show,setShow]=useState(false);
  const [ed,setEd]=useState(null);
  const [confirm,setConfirm]=useState(null);

  useEffect(()=>{ supabase.from("syn_environments").select("*").order("name").then(({data})=>setEnvs(data||[])); },[supabase]);

  const save=async env=>{
    if(ed){ await supabase.from("syn_environments").update(env).eq("id",env.id); setEnvs(p=>p.map(e=>e.id===env.id?env:e)); }
    else { await supabase.from("syn_environments").insert(env); setEnvs(p=>[...p,env]); }
    setShow(false); setEd(null);
  };

  function EnvForm({env,onSave,onClose}){
    const [name,setName]=useState(env?.name||"");
    const [cat,setCat]=useState(env?.category||"DEV");
    const [max,setMax]=useState(env?.max_reservation_duration||8);
    const [url,setUrl]=useState(env?.url||"");
    const [color,setColor]=useState(env?.color||(CC[env?.category||"DEV"]?.bar)||"#6366f1");
    const [errs,setErrs]=useState({});
    const go=()=>{
      const e={};if(!name.trim())e.name="Requerido";if(!max||+max<=0)e.max="Debe ser > 0";
      if(url.trim()&&!/^https?:\/\/.+/.test(url.trim()))e.url="Debe empezar por http:// o https://";
      if(Object.keys(e).length){setErrs(e);return;}
      onSave({id:env?.id||uid(),name:name.trim(),category:cat,max_reservation_duration:+max,is_archived:env?.is_archived||false,is_locked:env?.is_locked||false,color,url:url.trim()});
    };
    return(<Modal onClose={onClose}><MHead title={env?"Editar Entorno":"Nuevo Entorno"} onClose={onClose}/>
      <div style={{padding:20}}>
        <div style={{marginBottom:14}}><Lbl c="Nombre"/><input style={SI()} value={name} onChange={e=>setName(e.target.value)} placeholder="DEV-03"/><Err m={errs.name}/></div>
        <div style={{marginBottom:14}}><Lbl c="Categoría"/><select style={SI()} value={cat} onChange={e=>setCat(e.target.value)}><option value="DEV">DEV</option><option value="PRE">PRE</option><option value="STAGING">STAGING</option></select></div>
        <div style={{marginBottom:14}}><Lbl c="Duración máxima (horas)"/><input style={SI()} type="number" min="1" value={max} onChange={e=>setMax(e.target.value)}/><Err m={errs.max}/></div>
        <div style={{marginBottom:14}}><Lbl c="URL del entorno"/><input style={SI()} value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://dev-01.empresa.com"/><Err m={errs.url}/></div>
        <div style={{marginBottom:20}}>
          <Lbl c="Color en el timeline"/>
          <div style={{display:"flex",alignItems:"center",gap:12}}><ColorPicker value={color} onChange={setColor}/><span style={{fontSize:11,color:"var(--tx3)"}}>Identifica visualmente el entorno</span></div>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button style={SB("ghost")} onClick={onClose}>Cancelar</button><button style={SB()} onClick={go}>Guardar</button></div>
      </div></Modal>);
  }

  return(<div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
      <h3 style={{fontWeight:700,fontSize:16,color:"var(--tx)"}}>Entornos</h3>
      <button style={SB()} onClick={()=>{setEd(null);setShow(true);}}>+ Nuevo</button>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {envs.map(env=>{
        const cat=CC[env.category]||CC.DEV;
        return(<div key={env.id} style={{background:"var(--sf2)",border:`1px solid ${env.is_locked?"rgba(251,191,36,.45)":"var(--bd)"}`,borderLeft:`4px solid ${env.color||"var(--ac)"}`,borderRadius:10,padding:"12px 14px",opacity:env.is_archived?.55:1}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:12,height:12,borderRadius:3,background:env.color||"var(--ac)",flexShrink:0}}/>
              <span style={{background:cat.badge,color:cat.btext,padding:"2px 7px",borderRadius:20,fontSize:10,fontWeight:600}}>{env.category}</span>
              <span style={{fontWeight:600,color:"var(--tx)"}}>{env.name}</span>
              {env.is_locked&&<span style={{background:"rgba(251,191,36,.18)",color:"#fbbf24",padding:"1px 7px",borderRadius:10,fontSize:10,fontWeight:700}}>🔒 Bloqueado</span>}
              {env.is_archived&&<span style={{fontSize:11,color:"var(--tx3)"}}>[Archivado]</span>}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button style={{...SB("ghost",{fontSize:12})}} onClick={()=>{setEd(env);setShow(true);}}>✏️</button>
              {!env.is_archived&&(env.is_locked
                ?<button style={SB("warning",{fontSize:12})} onClick={()=>{ supabase.from("syn_environments").update({is_locked:false}).eq("id",env.id); setEnvs(p=>p.map(e=>e.id===env.id?{...e,is_locked:false}:e)); }}>🔓 Unlock</button>
                :<button style={{...SB("ghost",{fontSize:12,color:"#fbbf24",border:"1px solid rgba(251,191,36,.4)"})} } onClick={()=>{ supabase.from("syn_environments").update({is_locked:true}).eq("id",env.id); setEnvs(p=>p.map(e=>e.id===env.id?{...e,is_locked:true}:e)); }}>🔒 Lock</button>
              )}
              {env.is_archived
                ?<button style={SB("success",{fontSize:12})} onClick={()=>{ supabase.from("syn_environments").update({is_archived:false}).eq("id",env.id); setEnvs(p=>p.map(e=>e.id===env.id?{...e,is_archived:false}:e)); }}>Restaurar</button>
                :<button style={SB("danger",{fontSize:12})} onClick={()=>setConfirm({title:"Archivar entorno",msg:`¿Archivar "${env.name}"?`,label:"Archivar",variant:"danger",action:()=>{ supabase.from("syn_environments").update({is_archived:true}).eq("id",env.id); setEnvs(p=>p.map(e=>e.id===env.id?{...e,is_archived:true}:e)); }})}>Archivar</button>
              }
            </div>
          </div>
          <div style={{fontSize:12,color:"var(--tx3)",marginTop:6,display:"flex",gap:12,flexWrap:"wrap"}}>
            Max: <strong style={{color:"var(--tx)"}}>{env.max_reservation_duration}h</strong>
            {env.url&&<a href={env.url} target="_blank" rel="noopener noreferrer" style={{color:"#818cf8",textDecoration:"none"}}>🔗 {env.url}</a>}
          </div>
        </div>);
      })}
      {envs.length===0&&<p style={{color:"var(--tx3)",fontSize:13}}>Sin entornos. Añade el primero.</p>}
    </div>
    {show&&<EnvForm env={ed} onSave={save} onClose={()=>{setShow(false);setEd(null);}}/>}
    {confirm&&<Confirm title={confirm.title} msg={confirm.msg} label={confirm.label} variant={confirm.variant} onOk={confirm.action} onClose={()=>setConfirm(null)}/>}
  </div>);
}

// ── Admin: Repositorios ─────────────────────────────────────────────────────
export function AdminEnvRepositories({supabase}){
  const [repos,setRepos]=useState([]);
  const [show,setShow]=useState(false);
  const [ed,setEd]=useState(null);
  const [ok,setOk]=useState("");
  const csvRef=React.useRef();

  useEffect(()=>{ supabase.from("syn_repositories").select("*").order("name").then(({data})=>setRepos(data||[])); },[supabase]);

  const save=async repo=>{
    if(ed){ await supabase.from("syn_repositories").update(repo).eq("id",repo.id); setRepos(p=>p.map(r=>r.id===repo.id?repo:r)); }
    else { await supabase.from("syn_repositories").insert(repo); setRepos(p=>[...p,repo]); }
    setShow(false); setEd(null);
  };

  const handleCsv=e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader();
    r.onload=async ev=>{ const lines=ev.target.result.trim().split(/\r?\n/).filter(Boolean); const hdr=lines[0].split(",").map(s=>s.trim().toLowerCase()); const ni=hdr.indexOf("name")>=0?hdr.indexOf("name"):0;
      const news=lines.slice(1).map(l=>{const c=l.split(",").map(s=>s.trim().replace(/^"|"$/g,""));return c[ni]?{id:uid(),name:c[ni],is_archived:false}:null;}).filter(Boolean);
      if(news.length){ await supabase.from("syn_repositories").insert(news); setRepos(p=>[...p,...news]); setOk(`✅ ${news.length} repos importados`); setTimeout(()=>setOk(""),3000); }
    }; r.readAsText(f); e.target.value=""; };

  function RepoForm({repo,onSave,onClose}){
    const [n,setN]=useState(repo?.name||""); const [e,setE]=useState({});
    return(<Modal onClose={onClose}><MHead title={repo?"Editar Repo":"Nuevo Repo"} onClose={onClose}/>
      <div style={{padding:20}}>
        <div style={{marginBottom:14}}><Lbl c="Nombre"/><input style={SI()} value={n} onChange={ev=>setN(ev.target.value)} placeholder="mi-repo"/>{e.name&&<Err m={e.name}/>}</div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button style={SB("ghost")} onClick={onClose}>Cancelar</button>
          <button style={SB()} onClick={()=>{if(!n.trim()){setE({name:"Requerido"});return;}onSave({id:repo?.id||uid(),name:n.trim(),is_archived:repo?.is_archived||false});}}>Guardar</button></div>
      </div></Modal>);
  }

  return(<div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
      <h3 style={{fontWeight:700,fontSize:16,color:"var(--tx)"}}>Repositorios</h3>
      <div style={{display:"flex",gap:8}}>
        <button style={SB("outline",{fontSize:12})} onClick={()=>csvRef.current?.click()}>⬆ CSV</button>
        <input ref={csvRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={handleCsv}/>
        <button style={SB()} onClick={()=>{setEd(null);setShow(true);}}>+ Nuevo</button>
      </div>
    </div>
    {ok&&<div style={{background:"rgba(34,197,94,.1)",border:"1px solid rgba(34,197,94,.3)",borderRadius:8,padding:"8px 12px",color:"#4ade80",fontSize:13,marginBottom:10}}>{ok}</div>}
    <div style={{background:"var(--sf2)",border:"1px dashed var(--bd)",borderRadius:8,padding:"6px 12px",marginBottom:12,fontSize:11,color:"var(--tx3)"}}>
      CSV: columna <code style={{fontFamily:"monospace",background:"var(--bd)",padding:"1px 4px",borderRadius:3}}>name</code>, un repo por fila
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {repos.map(r=>(
        <div key={r.id} style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:10,padding:"10px 14px",opacity:r.is_archived?.55:1,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><span>📦</span><span style={{fontWeight:600,color:"var(--tx)"}}>{r.name}</span>{r.is_archived&&<span style={{fontSize:11,color:"var(--tx3)"}}>[Archivado]</span>}</div>
          <div style={{display:"flex",gap:6}}>
            {!r.is_archived&&<button style={SB("ghost",{fontSize:12})} onClick={()=>{setEd(r);setShow(true);}}>✏️</button>}
            {r.is_archived
              ?<button style={SB("success",{fontSize:12})} onClick={()=>{ supabase.from("syn_repositories").update({is_archived:false}).eq("id",r.id); setRepos(p=>p.map(x=>x.id===r.id?{...x,is_archived:false}:x)); }}>Restaurar</button>
              :<button style={SB("danger",{fontSize:12})} onClick={()=>{ supabase.from("syn_repositories").update({is_archived:true}).eq("id",r.id); setRepos(p=>p.map(x=>x.id===r.id?{...x,is_archived:true}:x)); }}>Archivar</button>
            }
          </div>
        </div>
      ))}
      {repos.length===0&&<p style={{color:"var(--tx3)",fontSize:13}}>Sin repositorios.</p>}
    </div>
    {show&&<RepoForm repo={ed} onSave={save} onClose={()=>{setShow(false);setEd(null);}}/>}
  </div>);
}

// ── Admin: Política ────────────────────────────────────────────────────────
export function AdminEnvPolicy({supabase}){
  const [p,setP]=useState(null);
  const [saved,setSaved]=useState(false);
  useEffect(()=>{ supabase.from("syn_policy").select("*").eq("id",1).single().then(({data})=>{ if(data) setP(data); else setP({id:1,booking_window_days:30,min_duration_hours:0.5,allow_past_start:true,business_hours_only:false,business_hours_start:8,business_hours_end:20}); }); },[supabase]);
  const upd=(k,v)=>setP(prev=>({...prev,[k]:v}));
  const save=async()=>{ await supabase.from("syn_policy").upsert(p); setSaved(true); setTimeout(()=>setSaved(false),2500); };
  if(!p) return <div style={{color:"var(--tx3)"}}>Cargando…</div>;
  const Row=({label,note,children})=>(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0",borderBottom:"1px solid var(--bd)"}}>
      <div><div style={{fontWeight:500,color:"var(--tx)",fontSize:14}}>{label}</div>{note&&<div style={{fontSize:12,color:"var(--tx3)",marginTop:2}}>{note}</div>}</div>
      <div style={{flexShrink:0,marginLeft:20}}>{children}</div>
    </div>
  );
  const Toggle=({val,onChange})=>(
    <button onClick={()=>onChange(!val)} style={{background:val?"#22c55e":"#4b4b6b",color:"#fff",border:"none",borderRadius:20,width:46,height:26,cursor:"pointer",fontSize:12,fontWeight:600,transition:"background .2s"}}>
      {val?"ON":"OFF"}
    </button>
  );
  return(<div style={{maxWidth:620}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
      <div><h3 style={{fontWeight:700,fontSize:16,color:"var(--tx)"}}>Política de reservas</h3><p style={{fontSize:12,color:"var(--tx3)",marginTop:2}}>Reglas globales para todas las reservas.</p></div>
      {saved&&<span style={{background:"rgba(34,197,94,.15)",color:"#4ade80",padding:"4px 12px",borderRadius:8,fontSize:13}}>✅ Guardado</span>}
    </div>
    <div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:12,padding:"0 16px"}}>
      <Row label="Ventana máxima de reserva" note="Días por adelantado que un usuario puede reservar (0 = sin límite)">
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <input type="number" min="0" max="365" value={p.booking_window_days} onChange={e=>upd("booking_window_days",+e.target.value)} style={SI({width:70,textAlign:"center"})}/>
          <span style={{color:"var(--tx3)",fontSize:13}}>días</span>
        </div>
      </Row>
      <Row label="Duración mínima" note="Tiempo mínimo de una reserva">
        <select value={p.min_duration_hours} onChange={e=>upd("min_duration_hours",+e.target.value)} style={SI({width:130})}>
          <option value={0.5}>30 minutos</option><option value={1}>1 hora</option><option value={2}>2 horas</option><option value={4}>4 horas</option><option value={8}>8 horas</option>
        </select>
      </Row>
      <Row label="Permitir inicio en el pasado" note="Permite crear reservas con inicio anterior al momento actual">
        <Toggle val={p.allow_past_start} onChange={v=>upd("allow_past_start",v)}/>
      </Row>
      <Row label="Solo horario laboral" note="Limitar reservas al rango horario configurado">
        <Toggle val={p.business_hours_only} onChange={v=>upd("business_hours_only",v)}/>
      </Row>
      {p.business_hours_only&&<Row label="Rango horario" note="Hora de inicio y fin del horario laboral">
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <input type="number" min="0" max="23" value={p.business_hours_start} onChange={e=>upd("business_hours_start",+e.target.value)} style={SI({width:60,textAlign:"center"})}/>
          <span style={{color:"var(--tx3)"}}>—</span>
          <input type="number" min="0" max="23" value={p.business_hours_end} onChange={e=>upd("business_hours_end",+e.target.value)} style={SI({width:60,textAlign:"center"})}/>
          <span style={{color:"var(--tx3)",fontSize:13}}>h</span>
        </div>
      </Row>}
    </div>
    <div style={{marginTop:16,display:"flex",justifyContent:"flex-end"}}>
      <button style={SB()} onClick={save}>Guardar política</button>
    </div>
  </div>);
}

// ── Export default: el módulo completo ────────────────────────────────────
export default function EnvTracker({supabase, currentUser, wsUsers}) {
  return (
    <EnvironmentsModule
      supabase={supabase}
      currentUser={currentUser}
      wsUsers={wsUsers}
    />
  );
}
