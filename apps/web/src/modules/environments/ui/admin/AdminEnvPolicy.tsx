// @ts-nocheck
// apps/web/src/modules/environments/ui/admin/AdminEnvPolicy.tsx
// Admin section — uses SupabaseEnvironmentRepository / RepositoryRepository / PolicyRepository
// via the infra layer so no direct supabase.from() calls in this file.
import { useState, useEffect } from "react";
import { SI, SB, Lbl, ColorPicker, ENV_PALETTE } from "../_shared";
import { SupabaseEnvironmentRepository } from "../../infra/supabase";
import { SupabaseRepositoryRepository }  from "../../infra/supabase";
import { SupabasePolicyRepository }      from "../../infra/supabase";

export function AdminEnvPolicy({supabase}){
  const supabasePolicyRepository = new SupabasePolicyRepository(supabase);
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
