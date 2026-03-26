// @ts-nocheck
import type { Deployment } from "../domain/entities/Deployment";

const STATUS_CFG = {
  "planned":     { icon:"○", color:"var(--tx3)",   bg:"var(--sf2)",               border:"var(--bd)",                  label:"Planificado"  },
  "in-progress": { icon:"▶", color:"#f59e0b",      bg:"rgba(245,158,11,.12)",     border:"rgba(245,158,11,.35)",        label:"En progreso"  },
  "deployed":    { icon:"✓", color:"var(--green)",  bg:"rgba(62,207,142,.12)",     border:"rgba(62,207,142,.35)",        label:"Desplegado"   },
  "rolled-back": { icon:"↩", color:"var(--red)",    bg:"rgba(224,82,82,.12)",      border:"rgba(224,82,82,.35)",         label:"Revertido"    },
  "cancelled":   { icon:"✕", color:"var(--tx3)",   bg:"var(--sf2)",               border:"var(--bd)",                  label:"Cancelado"    },
};

const ENV_LABELS = { development:"DEV", staging:"STG", production:"PROD" };

export function DeployTimeline({ deployments, onSelect }) {
  if (!deployments.length) {
    return (
      <div style={{textAlign:"center",padding:"40px 20px",color:"var(--tx3)",fontSize:14}}>
        No hay despliegues planificados aún.
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {deployments.map(d => {
        const st  = STATUS_CFG[d.status] ?? STATUS_CFG["planned"];
        const env = ENV_LABELS[d.environment] ?? d.environment;
        return (
          <div key={d.id}
            onClick={onSelect ? () => onSelect(d) : undefined}
            style={{
              background:   "var(--sf)",
              border:       `1px solid ${st.border}`,
              borderLeft:   `3px solid ${st.color}`,
              borderRadius: "var(--r2,8px)",
              padding:      "10px 14px",
              cursor:       onSelect ? "pointer" : "default",
              transition:   "all .15s",
            }}
          >
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
              <span style={{fontSize:12,color:st.color,fontWeight:700}}>{st.icon} {st.label}</span>
              <span style={{fontSize:11,fontWeight:700,padding:"1px 7px",borderRadius:20,background:st.bg,color:st.color,border:`1px solid ${st.border}`}}>
                {d.version} · {env}
              </span>
              <span style={{fontSize:11,color:"var(--tx3)",marginLeft:"auto"}}>
                {d.planned_at ? new Date(d.planned_at).toLocaleDateString("es-ES",{day:"numeric",month:"short",year:"numeric"}) : ""}
              </span>
            </div>
            <p style={{fontSize:13,fontWeight:600,color:"var(--tx)",marginBottom:2}}>{d.name}</p>
            {d.notes && <p style={{fontSize:11,color:"var(--tx3)",lineHeight:1.4,margin:0}}>{d.notes}</p>}
            {d.jira_issues?.length > 0 && (
              <p style={{fontSize:11,color:"var(--tx3)",marginTop:4,margin:0}}>🔗 {d.jira_issues.join(", ")}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
