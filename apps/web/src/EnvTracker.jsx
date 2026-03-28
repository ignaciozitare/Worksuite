// ─── EnvTracker.jsx — Wrapper de Environments para WorkSuite ────────────────
// Exporta componentes de admin y monta EnvironmentsModule (Gantt completo)
import { useState, useEffect } from "react";
import { supabase } from './shared/lib/api';
import EnvironmentsModule from './EnvironmentsModule';

const uid = () => Math.random().toString(36).slice(2, 10);

const SI = (extra={}) => ({
  background:"var(--sf2)", border:"1px solid var(--bd)",
  borderRadius:8, padding:"8px 12px", fontSize:13, color:"var(--tx)",
  width:"100%", outline:"none", fontFamily:"inherit", ...extra,
});
const SB = (variant="primary", extra={}) => ({
  background: variant==="primary"?"var(--ac)":variant==="danger"?"#dc2626":"transparent",
  color: variant==="ghost"?"var(--tx3)":variant==="outline"?"var(--ac)":"#fff",
  border: variant==="outline"?"1px solid var(--ac)":"none",
  borderRadius:8, cursor:"pointer", fontWeight:500, fontSize:13,
  padding:"6px 14px", transition:"all .15s", fontFamily:"inherit", ...extra,
});

const ENV_PALETTE = [
  "#ef4444","#f97316","#f59e0b","#84cc16","#22c55e","#14b8a6",
  "#0ea5e9","#3b82f6","#6366f1","#8b5cf6","#a855f7","#ec4899",
  "#7c3aed","#9333ea","#0891b2","#0284c7","#2563eb","#dc2626",
];

const CC = {
  DEV:     { badge:"rgba(124,58,237,.15)", btext:"#a78bfa" },
  PRE:     { badge:"rgba(180,83,9,.15)",   btext:"#fbbf24" },
  STAGING: { badge:"rgba(14,116,144,.15)", btext:"#22d3ee" },
};

function Lbl({c}) {
  return <label style={{display:"block",fontSize:11,fontWeight:600,color:"var(--tx3)",marginBottom:5,textTransform:"uppercase",letterSpacing:".05em"}}>{c}</label>;
}
function Err({m}) {
  return m ? <p style={{color:"#ef4444",fontSize:11,marginTop:4}}>⚠ {m}</p> : null;
}

function ColorPicker({value, onChange}) {
  const [open,setOpen] = useState(false);
  return(
    <div style={{position:"relative",display:"inline-block"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{width:34,height:34,borderRadius:7,background:value||"var(--ac)",cursor:"pointer",border:"2px solid var(--bd2)"}}/>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 8px)",left:0,zIndex:600,background:"var(--sf)",border:"1px solid var(--bd2)",borderRadius:12,padding:10,boxShadow:"var(--shadow)",width:200}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:5}}>
            {ENV_PALETTE.map(c=>(
              <div key={c} onClick={()=>{onChange(c);setOpen(false);}}
                style={{width:24,height:24,borderRadius:5,background:c,cursor:"pointer",border:value===c?"2px solid #fff":"2px solid transparent"}}/>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin: Entornos (syn_environments) ───────────────────────────────────────
export function AdminEnvEnvironments() {
  const [envs,setEnvs]   = useState([]);
  const [show,setShow]   = useState(false);
  const [ed,setEd]       = useState(null);
  const [confirm,setConfirm] = useState(null);

  useEffect(()=>{ supabase.from("syn_environments").select("*").order("name").then(({data})=>setEnvs(data||[])); },[]);

  const save = async env => {
    if(ed){
      await supabase.from("syn_environments").update(env).eq("id",env.id);
      setEnvs(p=>p.map(e=>e.id===env.id?env:e));
    } else {
      const {data}=await supabase.from("syn_environments").insert(env).select().single();
      if(data) setEnvs(p=>[...p,data]);
    }
    setShow(false); setEd(null);
  };

  const archive = async id => {
    await supabase.from("syn_environments").update({is_archived:true}).eq("id",id);
    setEnvs(p=>p.map(e=>e.id===id?{...e,is_archived:true}:e));
  };

  const toggleLock = async (id, locked) => {
    await supabase.from("syn_environments").update({is_locked:!locked}).eq("id",id);
    setEnvs(p=>p.map(e=>e.id===id?{...e,is_locked:!locked}:e));
  };

  function EnvForm({env, onSave, onClose}) {
    const [name, setName]   = useState(env?.name||"");
    const [cat,  setCat]    = useState(env?.category||"DEV");
    const [max,  setMax]    = useState(env?.max_reservation_duration||8);
    const [url,  setUrl]    = useState(env?.url||"");
    const [color,setColor]  = useState(env?.color||"#6366f1");
    const [errs, setErrs]   = useState({});

    const submit = () => {
      if(!name.trim()){setErrs({name:"Nombre requerido"});return;}
      onSave({ id:env?.id||uid(), name:name.trim(), category:cat,
        max_reservation_duration:Number(max)||8, url:url.trim()||null,
        color:color||null, is_archived:env?.is_archived||false, is_locked:env?.is_locked||false });
    };

    return(
      <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.65)",padding:16}}
        onClick={onClose}>
        <div onClick={e=>e.stopPropagation()} style={{background:"var(--sf)",border:"1px solid var(--bd2)",borderRadius:16,maxWidth:480,width:"100%",overflow:"hidden",boxShadow:"var(--shadow)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid var(--bd)"}}>
            <span style={{fontWeight:700,fontSize:15,color:"var(--tx)"}}>{env?"Editar entorno":"Nuevo entorno"}</span>
            <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:20}}>×</button>
          </div>
          <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <Lbl c="Nombre"/>
              <input style={SI({borderColor:errs.name?"var(--red)":"var(--bd)"})} value={name} onChange={e=>{setName(e.target.value);setErrs({});}} placeholder="DEV-03"/>
              <Err m={errs.name}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <Lbl c="Categoría"/>
                <select style={SI()} value={cat} onChange={e=>setCat(e.target.value)}>
                  <option value="DEV">DEV</option>
                  <option value="PRE">PRE</option>
                  <option value="STAGING">STAGING</option>
                </select>
              </div>
              <div>
                <Lbl c="Max duración (h)"/>
                <input type="number" style={SI()} value={max} onChange={e=>setMax(e.target.value)} min={1} max={720}/>
              </div>
            </div>
            <div>
              <Lbl c="URL del entorno (opcional)"/>
              <input style={SI()} value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://dev.example.com"/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div>
                <Lbl c="Color"/>
                <ColorPicker value={color} onChange={setColor}/>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
              <button style={SB("ghost")} onClick={onClose}>Cancelar</button>
              <button style={SB()} onClick={submit}>{env?"Actualizar":"Crear"}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <span style={{fontWeight:700,fontSize:14,color:"var(--tx)"}}>Entornos ({envs.filter(e=>!e.is_archived).length} activos)</span>
        <button style={SB("primary",{padding:"6px 14px",fontSize:12})} onClick={()=>{setEd(null);setShow(true);}}>+ Nuevo entorno</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {envs.map(env=>{
          const bc=(CC[env.category]||CC.DEV);
          return(
            <div key={env.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"var(--sf2)",borderRadius:10,border:"1px solid var(--bd)",opacity:env.is_archived?.5:1}}>
              <div style={{width:4,height:32,borderRadius:2,background:env.color||(CC[env.category]||CC.DEV).btext,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                  <span style={{fontWeight:600,fontSize:13,color:"var(--tx)"}}>{env.name}</span>
                  <span style={{background:bc.badge,color:bc.btext,padding:"1px 7px",borderRadius:20,fontSize:10,fontWeight:600}}>{env.category}</span>
                  {env.is_locked&&<span style={{background:"rgba(245,166,35,.15)",color:"var(--amber)",padding:"1px 6px",borderRadius:10,fontSize:9,fontWeight:700}}>🔒 BLOQUEADO</span>}
                  {env.is_archived&&<span style={{background:"var(--sf3)",color:"var(--tx3)",padding:"1px 6px",borderRadius:10,fontSize:9}}>Archivado</span>}
                </div>
                <span style={{fontSize:11,color:"var(--tx3)"}}>Max {env.max_reservation_duration}h{env.url?" · "+env.url:""}</span>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={()=>toggleLock(env.id,env.is_locked)} style={{...SB("ghost",{fontSize:11,padding:"3px 8px"}),border:"1px solid var(--bd)"}}>{env.is_locked?"🔓 Desbloquear":"🔒 Bloquear"}</button>
                <button onClick={()=>{setEd(env);setShow(true);}} style={{...SB("ghost",{fontSize:11,padding:"3px 8px"}),border:"1px solid var(--bd)"}}>✏️ Editar</button>
                {!env.is_archived&&<button onClick={()=>archive(env.id)} style={{...SB("ghost",{fontSize:11,padding:"3px 8px",color:"var(--red)"}),border:"1px solid rgba(224,82,82,.3)"}}>Archivar</button>}
              </div>
            </div>
          );
        })}
        {envs.length===0&&<div style={{fontSize:12,color:"var(--tx3)",padding:"20px 0",textAlign:"center"}}>Sin entornos configurados</div>}
      </div>
      {show&&<EnvForm env={ed} onSave={save} onClose={()=>{setShow(false);setEd(null);}}/>}
    </div>
  );
}

// ── Admin: Repositorios (syn_repositories) ────────────────────────────────────
export function AdminEnvRepositories() {
  const [repos,setRepos] = useState([]);
  const [show,setShow]   = useState(false);
  const [ed,setEd]       = useState(null);
  const [name,setName]   = useState("");
  const [errs,setErrs]   = useState({});

  useEffect(()=>{ supabase.from("syn_repositories").select("*").order("name").then(({data})=>setRepos(data||[])); },[]);

  const save = async () => {
    if(!name.trim()){setErrs({name:"Nombre requerido"});return;}
    const obj = {id:ed?.id||uid(), name:name.trim(), is_archived:ed?.is_archived||false};
    if(ed){
      await supabase.from("syn_repositories").update(obj).eq("id",ed.id);
      setRepos(p=>p.map(r=>r.id===ed.id?obj:r));
    } else {
      const {data}=await supabase.from("syn_repositories").insert(obj).select().single();
      if(data) setRepos(p=>[...p,data]);
    }
    setShow(false); setEd(null); setName("");
  };

  const archive = async id => {
    await supabase.from("syn_repositories").update({is_archived:true}).eq("id",id);
    setRepos(p=>p.map(r=>r.id===id?{...r,is_archived:true}:r));
  };

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <span style={{fontWeight:700,fontSize:14,color:"var(--tx)"}}>Repositorios ({repos.filter(r=>!r.is_archived).length} activos)</span>
        <button style={SB("primary",{padding:"6px 14px",fontSize:12})} onClick={()=>{setEd(null);setName("");setShow(true);}}>+ Nuevo repositorio</button>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
        {repos.map(repo=>(
          <div key={repo.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"var(--sf2)",borderRadius:8,border:"1px solid var(--bd)",opacity:repo.is_archived?.5:1}}>
            <span style={{fontSize:13,color:"var(--tx)"}}>📦 {repo.name}</span>
            {repo.is_archived&&<span style={{fontSize:9,color:"var(--tx3)"}}>[archivado]</span>}
            <button onClick={()=>{setEd(repo);setName(repo.name);setShow(true);}} style={{...SB("ghost",{fontSize:11,padding:"1px 6px"}),border:"1px solid var(--bd)"}}>✏️</button>
            {!repo.is_archived&&<button onClick={()=>archive(repo.id)} style={{...SB("ghost",{fontSize:11,padding:"1px 6px",color:"var(--red)"}),border:"1px solid rgba(224,82,82,.2)"}}>×</button>}
          </div>
        ))}
        {repos.length===0&&<div style={{fontSize:12,color:"var(--tx3)"}}>Sin repositorios configurados</div>}
      </div>
      {show&&(
        <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.65)",padding:16}}
          onClick={()=>{setShow(false);setEd(null);}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--sf)",border:"1px solid var(--bd2)",borderRadius:14,maxWidth:380,width:"100%",overflow:"hidden",boxShadow:"var(--shadow)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",borderBottom:"1px solid var(--bd)"}}>
              <span style={{fontWeight:700,color:"var(--tx)"}}>{ed?"Editar repositorio":"Nuevo repositorio"}</span>
              <button onClick={()=>setShow(false)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:18}}>×</button>
            </div>
            <div style={{padding:18}}>
              <Lbl c="Nombre del repositorio"/>
              <input style={SI({borderColor:errs.name?"var(--red)":"var(--bd)",marginBottom:6})} value={name} onChange={e=>{setName(e.target.value);setErrs({});}} placeholder="frontend-app" autoFocus/>
              <Err m={errs.name}/>
              <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:14}}>
                <button style={SB("ghost")} onClick={()=>setShow(false)}>Cancelar</button>
                <button style={SB()} onClick={save}>{ed?"Actualizar":"Crear"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin: Política (syn_policy) ──────────────────────────────────────────────
export function AdminEnvPolicy() {
  const [pol, setPol] = useState({booking_window_days:30,min_duration_hours:0.5,allow_past_start:true,business_hours_only:false,business_hours_start:8,business_hours_end:20});
  const [saved,setSaved] = useState(false);

  useEffect(()=>{ supabase.from("syn_policy").select("*").eq("id",1).single().then(({data})=>{ if(data) setPol(data); }); },[]);

  const save = async () => {
    await supabase.from("syn_policy").upsert({id:1,...pol});
    setSaved(true); setTimeout(()=>setSaved(false),2500);
  };

  const Field = ({label, children}) => (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid var(--bd)"}}>
      <span style={{fontSize:13,color:"var(--tx2)"}}>{label}</span>
      {children}
    </div>
  );

  return(
    <div style={{maxWidth:540}}>
      <Field label="Ventana de reserva (días)">
        <input type="number" style={SI({width:80,textAlign:"center"})} value={pol.booking_window_days} onChange={e=>setPol(p=>({...p,booking_window_days:Number(e.target.value)}))} min={1} max={365}/>
      </Field>
      <Field label="Duración mínima (horas)">
        <input type="number" style={SI({width:80,textAlign:"center"})} value={pol.min_duration_hours} onChange={e=>setPol(p=>({...p,min_duration_hours:Number(e.target.value)}))} step={0.5} min={0}/>
      </Field>
      <Field label="Permitir inicio en el pasado">
        <input type="checkbox" checked={pol.allow_past_start} onChange={e=>setPol(p=>({...p,allow_past_start:e.target.checked}))} style={{width:18,height:18,cursor:"pointer"}}/>
      </Field>
      <Field label="Solo horario laboral">
        <input type="checkbox" checked={pol.business_hours_only} onChange={e=>setPol(p=>({...p,business_hours_only:e.target.checked}))} style={{width:18,height:18,cursor:"pointer"}}/>
      </Field>
      {pol.business_hours_only&&<>
        <Field label="Hora inicio laboral">
          <input type="number" style={SI({width:80,textAlign:"center"})} value={pol.business_hours_start} onChange={e=>setPol(p=>({...p,business_hours_start:Number(e.target.value)}))} min={0} max={23}/>
        </Field>
        <Field label="Hora fin laboral">
          <input type="number" style={SI({width:80,textAlign:"center"})} value={pol.business_hours_end} onChange={e=>setPol(p=>({...p,business_hours_end:Number(e.target.value)}))} min={0} max={23}/>
        </Field>
      </>}
      <div style={{marginTop:16,display:"flex",alignItems:"center",gap:10}}>
        <button style={SB("primary",{padding:"8px 18px"})} onClick={save}>Guardar política</button>
        {saved&&<span style={{fontSize:12,color:"var(--green)"}}>✓ Guardado</span>}
      </div>
    </div>
  );
}

// ── Default export: monta el EnvironmentsModule completo ─────────────────────
export default function EnvTracker({ supabase: _sup, currentUser, wsUsers }) {
  return <EnvironmentsModule currentUser={currentUser} wsUsers={wsUsers}/>;
}
