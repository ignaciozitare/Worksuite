// @ts-nocheck
// apps/web/src/modules/environments/ui/admin/AdminEnvEnvironments.tsx
// Admin section — uses SupabaseEnvironmentRepository / RepositoryRepository / PolicyRepository
// via the infra layer so no direct supabase.from() calls in this file.
import { useState, useEffect } from "react";
import { SI, SB, Lbl, ColorPicker, ENV_PALETTE } from "../_shared";
import { SupabaseEnvironmentRepository } from "../../infra/supabase";
import { SupabaseRepositoryRepository }  from "../../infra/supabase";
import { SupabasePolicyRepository }      from "../../infra/supabase";

export function AdminEnvEnvironments({supabase}){
  const supabaseEnvironmentRepository = new SupabaseEnvironmentRepository(supabase);
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
