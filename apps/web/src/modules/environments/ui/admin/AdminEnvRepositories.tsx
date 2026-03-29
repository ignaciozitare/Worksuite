// @ts-nocheck
// apps/web/src/modules/environments/ui/admin/AdminEnvRepositories.tsx
// Admin section — uses SupabaseEnvironmentRepository / RepositoryRepository / PolicyRepository
// via the infra layer so no direct supabase.from() calls in this file.
import { useState, useEffect } from "react";
import { SI, SB, Lbl, ColorPicker, ENV_PALETTE } from "../_shared";
import { SupabaseEnvironmentRepository } from "../../infra/supabase";
import { SupabaseRepositoryRepository }  from "../../infra/supabase";
import { SupabasePolicyRepository }      from "../../infra/supabase";

export function AdminEnvRepositories({supabase}){
  const supabaseRepositoryRepository = new SupabaseRepositoryRepository(supabase);
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
