// @ts-nocheck
import { useState, useEffect } from "react";
import { supabase } from "../../../shared/lib/supabaseClient";
import { DeployTimeline } from "./DeployTimeline";

export function DeployPlanner({ currentUser }) {
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("deployments")
        .select("*")
        .order("planned_at", { ascending: false });
      setDeployments(data || []);
    } finally { setLoading(false); }
  }

  const planned    = deployments.filter(d => d.status === "planned").length;
  const inProgress = deployments.filter(d => d.status === "in-progress").length;
  const deployed   = deployments.filter(d => d.status === "deployed").length;

  return (
    <div style={{padding:"24px",maxWidth:900}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
        <div>
          <h1 style={{fontFamily:"'Sora',sans-serif",fontSize:20,color:"var(--tx)",marginBottom:4,fontWeight:700}}>
            🚀 Deploy Planner
          </h1>
          <p style={{fontSize:13,color:"var(--tx3)"}}>
            Planifica y gestiona despliegues vinculados a issues de Jira
          </p>
        </div>
        <div style={{marginLeft:"auto"}}>
          <button style={{background:"var(--ac)",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
            + Nuevo despliegue
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:14,marginBottom:28}}>
        {[
          {label:"Planificados",  value:planned,             color:"var(--tx3)",  icon:"📋"},
          {label:"En progreso",   value:inProgress,          color:"#f59e0b",     icon:"⚙️"},
          {label:"Desplegados",   value:deployed,            color:"var(--green)", icon:"✓"},
          {label:"Total",         value:deployments.length,  color:"var(--ac)",   icon:"🔢"},
        ].map(s => (
          <div key={s.label} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:12,padding:14,textAlign:"center"}}>
            <div style={{fontSize:18,marginBottom:6}}>{s.icon}</div>
            <div style={{fontSize:26,fontWeight:700,fontFamily:"'Sora',sans-serif",color:s.color}}>{s.value}</div>
            <div style={{fontSize:11,color:"var(--tx3)",marginTop:3}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:12,padding:"18px 20px"}}>
        <h2 style={{fontFamily:"'Sora',sans-serif",fontSize:14,color:"var(--tx)",marginBottom:16,fontWeight:600}}>
          📅 Línea de tiempo
        </h2>
        {loading
          ? <div style={{textAlign:"center",padding:"30px 0",color:"var(--tx3)",fontSize:13}}>Cargando…</div>
          : <DeployTimeline deployments={deployments} onSelect={setSelected}/>
        }
      </div>

      {/* Coming soon notice */}
      <div style={{marginTop:20,padding:"16px 20px",background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.25)",borderRadius:12,fontSize:13,color:"#f59e0b"}}>
        🔗 La integración con Jira (vincular issues, ver estado, crear releases) está en desarrollo.
        Usará el mismo token configurado en Jira Tracker — no necesitas configurar nada adicional.
      </div>
    </div>
  );
}
