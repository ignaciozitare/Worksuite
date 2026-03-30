// @ts-nocheck
import React from 'react';
import { AdminEnvEnvironments, AdminEnvRepositories, AdminEnvPolicy } from '../../modules/environments';

function AdminEnvTrackerSection() {
  const [sub, setSub] = React.useState("environments");
  const SUB = [
    { id:"environments", label:"Entornos",    icon:"🖥️" },
    { id:"repositories", label:"Repositorios",icon:"📦" },
    { id:"policy",       label:"Política",    icon:"📋" },
  ];
  return (
    <div>
      <div className="sec-t">🖥️ Environments</div>
      <div className="sec-sub" style={{marginBottom:16}}>Gestiona entornos de despliegue, repositorios y política de reservas.</div>
      <div style={{display:"flex",gap:4,marginBottom:20,background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:10,padding:4,alignSelf:"flex-start",width:"fit-content"}}>
        {SUB.map(s=>(
          <button key={s.id} onClick={()=>setSub(s.id)} style={{background:sub===s.id?"var(--ac)":"transparent",color:sub===s.id?"#fff":"var(--tx3)",border:"none",borderRadius:7,cursor:"pointer",fontWeight:sub===s.id?600:400,fontSize:12,padding:"5px 14px",transition:"all 0.15s",fontFamily:"inherit"}}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>
      <div className="a-card">
        {sub==="environments" && <AdminEnvEnvironments supabase={supabase}/>}
        {sub==="repositories" && <AdminEnvRepositories supabase={supabase}/>}
        {sub==="policy"       && <AdminEnvPolicy       supabase={supabase}/>}
      </div>
    </div>
  );
}

export { AdminEnvTrackerSection };
