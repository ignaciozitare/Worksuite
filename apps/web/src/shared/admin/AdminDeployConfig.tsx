// @ts-nocheck
import React from 'react';
import { supabase } from '../lib/api';
import { GetJiraMetadata } from '../../modules/deploy-planner/domain/useCases/GetJiraMetadata';
import { JiraMetadataAdapter } from '../../modules/deploy-planner/infra/JiraMetadataAdapter';
import { SupabaseReleaseRepo } from '../../modules/deploy-planner/infra/supabase/SupabaseReleaseRepo';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}
const jiraMetadataAdapter = new JiraMetadataAdapter(API_BASE, getAuthHeaders);
const getJiraMetadata = new GetJiraMetadata(jiraMetadataAdapter);
const releaseRepo = new SupabaseReleaseRepo(supabase);

function JiraFieldMapping({verCfg,setVerCfg}){
  const [issueTypes,setIssueTypes]=React.useState([]);
  const [fields,setFields]=React.useState([]);
  const [loading,setLoading]=React.useState(false);
  const [saving,setSaving]=React.useState(false);
  const [saved,setSaved]=React.useState(false);
  const [selectedTypes,setSelectedTypes]=React.useState(verCfg?.issue_types||[]);
  const [selectedField,setSelectedField]=React.useState(verCfg?.repo_jira_field||"components");

  React.useEffect(()=>{
    if(verCfg?.issue_types)setSelectedTypes(verCfg.issue_types);
    if(verCfg?.repo_jira_field)setSelectedField(verCfg.repo_jira_field);
  },[verCfg?.id]);

  const fetchJiraMetadata=async()=>{
    setLoading(true);
    try{
      const result=await getJiraMetadata.execute();
      setIssueTypes(result.issueTypes);
      setFields(result.fields);
    }catch(e){console.error("Fetch Jira metadata error:",e);}
    setLoading(false);
  };

  const toggleType=(name)=>{
    setSelectedTypes(prev=>prev.includes(name)?prev.filter(x=>x!==name):[...prev,name]);
  };

  const save=async()=>{
    if(!verCfg?.id)return;
    setSaving(true);
    try{
      await releaseRepo.saveConfig({repoJiraField:selectedField});
      setVerCfg(v=>({...v,repo_jira_field:selectedField}));
    }catch(e){console.error("Save config error:",e);}
    setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),2000);
  };

  return(
    <div className="a-card" style={{marginTop:16}}>
      <div className="a-ct">🔗 Jira Field Mapping</div>
      <div style={{fontSize:11,color:"var(--tx3)",marginBottom:14}}>
        Selecciona qué campo de Jira usar como "Repository & Components" para agrupar tickets por repositorio en las releases.
      </div>

      <button onClick={fetchJiraMetadata} disabled={loading}
        style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:6,padding:"7px 14px",fontSize:11,cursor:"pointer",color:"var(--tx2)",fontWeight:600,fontFamily:"inherit",marginBottom:14}}>
        {loading?"Cargando campos de Jira…":"🔄 Cargar campos desde Jira"}
      </button>

      {issueTypes.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--tx3)",marginBottom:6,letterSpacing:".06em",textTransform:"uppercase"}}>Issue Types disponibles</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {issueTypes.filter(it=>!it.subtask).map(it=>{
              const on=selectedTypes.includes(it.name);
              return(
                <button key={it.id} onClick={()=>toggleType(it.name)}
                  style={{padding:"4px 10px",borderRadius:20,border:`1px solid ${on?"var(--ac)":"var(--bd)"}`,background:on?"var(--glow,rgba(79,110,247,.1))":"transparent",color:on?"var(--ac2)":"var(--tx3)",cursor:"pointer",fontSize:11,fontWeight:on?700:400,fontFamily:"inherit"}}>
                  {it.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {fields.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--tx3)",marginBottom:6,letterSpacing:".06em",textTransform:"uppercase"}}>Campo para Repository & Components</div>
          <select value={selectedField} onChange={e=>setSelectedField(e.target.value)}
            style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:6,padding:"7px 10px",color:"var(--tx)",fontSize:12,fontFamily:"inherit",width:"100%",maxWidth:400}}>
            <option value="components">components (estándar Jira)</option>
            {fields.map(f=>(
              <option key={f.id} value={f.id}>{f.name}{f.custom?" (custom)":""} — {f.id}</option>
            ))}
          </select>
          <div style={{fontSize:10,color:"var(--tx3)",marginTop:4}}>
            Campo actual: <strong style={{color:"var(--ac2)"}}>{selectedField||"components"}</strong>
          </div>
        </div>
      )}

      {(fields.length>0||selectedField!=="components")&&(
        <button onClick={save} disabled={saving}
          style={{background:"var(--ac)",color:"#fff",border:"none",borderRadius:6,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          {saving?"Guardando…":saved?"✓ Guardado":"Guardar campo seleccionado"}
        </button>
      )}
    </div>
  );
}

function AdminDeployConfig() {
  const [statuses, setStatuses]   = React.useState([]);
  const [editing, setEditing]     = React.useState(null); // {id, name, color, is_final}
  const [jiraList, setJiraList]   = React.useState([]); // [{name, id?}]
  const [fetchingJ, setFetchingJ] = React.useState(false);
  const [savingJ, setSavingJ]     = React.useState(false);
  const [savedJ, setSavedJ]       = React.useState(false);
  const [newStatus, setNewStatus] = React.useState({name:"",color:"#6b7280",is_final:false});
  const [dragging, setDragging]   = React.useState(null); // index being dragged
  const [dragOver, setDragOver]   = React.useState(null);

  // ── Load ─────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    supabase.from("dp_release_statuses").select("*").order("ord").then(({data}) => {
      if(data) setStatuses(data);
    });
    supabase.from("sso_config").select("deploy_jira_statuses").limit(1).single().then(({data}) => {
      const raw = data?.deploy_jira_statuses || "Ready to Production";
      setJiraList(raw.split(",").map(s=>s.trim()).filter(Boolean).map((n,i)=>({id:i, name:n})));
    });
  }, []);

  // ── Release statuses CRUD ─────────────────────────────────────────────────
  const addRelStatus = async () => {
    if(!newStatus.name.trim()) return;
    const hex = newStatus.color;
    const bg  = hex + "20";
    const brd = hex + "66";
    const {data} = await supabase.from("dp_release_statuses")
      .insert({name:newStatus.name, color:hex, bg_color:bg, border:brd, is_final:newStatus.is_final, ord:statuses.length})
      .select().single();
    if(data) { setStatuses(s=>[...s,data]); setNewStatus({name:"",color:"#6b7280",is_final:false}); }
  };

  const saveRelStatus = async (st) => {
    const hex = st.color;
    const patch = {name:st.name, color:hex, bg_color:hex+"20", border:hex+"66", is_final:st.is_final};
    await supabase.from("dp_release_statuses").update(patch).eq("id",st.id);
    setStatuses(s=>s.map(x=>x.id===st.id?{...x,...patch}:x));
    setEditing(null);
  };

  const delRelStatus = async (id) => {
    await supabase.from("dp_release_statuses").delete().eq("id",id);
    setStatuses(s=>s.filter(x=>x.id!==id));
  };

  // Drag-to-reorder
  const onDragEnd = async () => {
    if(dragging===null||dragOver===null||dragging===dragOver) { setDragging(null);setDragOver(null);return; }
    const reordered = [...statuses];
    const [moved] = reordered.splice(dragging, 1);
    reordered.splice(dragOver, 0, moved);
    const updated = reordered.map((s,i)=>({...s, ord:i}));
    setStatuses(updated);
    setDragging(null); setDragOver(null);
    // Persist new ord values
    await Promise.all(updated.map(s => supabase.from("dp_release_statuses").update({ord:s.ord}).eq("id",s.id)));
  };

  // ── Jira statuses list ────────────────────────────────────────────────────
  const addJiraStatus = (name) => {
    if(!name.trim() || jiraList.some(j=>j.name===name.trim())) return;
    setJiraList(l=>[...l, {id:Date.now(), name:name.trim()}]);
  };
  const delJiraStatus = (id) => setJiraList(l=>l.filter(j=>j.id!==id));
  const editJiraStatus = (id, name) => setJiraList(l=>l.map(j=>j.id===id?{...j,name}:j));

  const saveJiraStatuses = async () => {
    setSavingJ(true);
    const str = jiraList.map(j=>j.name).join(",");
    const {data:cfg} = await supabase.from("sso_config").select("id").limit(1).single();
    if(cfg) await supabase.from("sso_config").update({deploy_jira_statuses:str}).eq("id",cfg.id);
    setSavingJ(false); setSavedJ(true); setTimeout(()=>setSavedJ(false),2000);
  };

  const fetchAllJiraStatuses = async () => {
    setFetchingJ(true);
    try {
      const {data:{session}} = await supabase.auth.getSession();
      const API = (import.meta.env.VITE_API_URL||"http://localhost:3001").replace(/\/$/,"");
      const hdrs = {"Authorization":`Bearer ${session?.access_token}`};

      // Obtener proyectos (mismo endpoint que JiraTracker)
      const projRes = await fetch(`${API}/jira/projects`, { headers: hdrs });
      if(!projRes.ok) throw new Error(`Proyectos: HTTP ${projRes.status}`);
      const projData = await projRes.json();
      const projects = (projData.data||[]).map(p=>p.key||p.id).filter(Boolean).slice(0,5);

      // Recoger estados únicos de issues de los primeros proyectos
      const statusSet = new Set();
      await Promise.all(projects.map(async proj => {
        try {
          const r = await fetch(`${API}/jira/issues?project=${proj}`, { headers: hdrs });
          if(!r.ok) return;
          const d = await r.json();
          (d.data||[]).forEach(i => {
            const st = i.status || i.fields?.status?.name;
            if(st) statusSet.add(st);
          });
        } catch {}
      }));

      const names = [...statusSet].filter(Boolean);
      const existing = new Set(jiraList.map(j=>j.name));
      const toAdd = names.filter(n=>!existing.has(n)).map((n,i)=>({id:Date.now()+i,name:n}));
      if(toAdd.length > 0) setJiraList(l=>[...l,...toAdd]);
      else alert("No se encontraron estados nuevos. Revisa que tienes proyectos Jira configurados.");
    } catch(e) { alert(`Error al obtener estados de Jira: ${e.message}`); }
    setFetchingJ(false);
  };

  const [newJiraName, setNewJiraName] = React.useState("");

  // ── Version config ───────────────────────────────────────────────────────
  const [verCfg, setVerCfg]           = React.useState(null);
  const [verCfgSaving, setVerCfgSaving] = React.useState(false);
  const [verCfgSaved, setVerCfgSaved]   = React.useState(false);

  React.useEffect(() => {
    supabase.from("dp_version_config").select("*").limit(1).single().then(({data}) => {
      if(data) setVerCfg(data);
      else setVerCfg({ prefix:"v", segments:[{name:"major",value:1},{name:"minor",value:0},{name:"patch",value:0}], separator:"." });
    });
  }, []);

  const saveVerCfg = async () => {
    if(!verCfg) return;
    setVerCfgSaving(true);
    const {data:existing} = await supabase.from("dp_version_config").select("id").limit(1).single();
    if(existing?.id) {
      await supabase.from("dp_version_config").update({prefix:verCfg.prefix,segments:verCfg.segments,separator:verCfg.separator}).eq("id",existing.id);
    } else {
      await supabase.from("dp_version_config").insert({prefix:verCfg.prefix,segments:verCfg.segments,separator:verCfg.separator});
    }
    setVerCfgSaving(false); setVerCfgSaved(true); setTimeout(()=>setVerCfgSaved(false),2000);
  };

  // ── Repo groups ──────────────────────────────────────────────────────────
  const [repoGroups, setRepoGroups]       = React.useState([]);
  const [newGroupName, setNewGroupName]   = React.useState("");
  const [expandedGroup, setExpandedGroup] = React.useState(null); // group id
  const [newRepoName, setNewRepoName]     = React.useState("");

  React.useEffect(() => {
    supabase.from("dp_repo_groups").select("*").order("name").then(({data}) => {
      if(data) setRepoGroups(data);
    });
  }, []);

  const addGroup = async () => {
    if(!newGroupName.trim()) return;
    const {data} = await supabase.from("dp_repo_groups").insert({name:newGroupName.trim(), repos:[]}).select().single();
    if(data) { setRepoGroups(g=>[...g,data]); setNewGroupName(""); setExpandedGroup(data.id); }
  };

  const deleteGroup = async (id) => {
    await supabase.from("dp_repo_groups").delete().eq("id",id);
    setRepoGroups(g=>g.filter(x=>x.id!==id));
  };

  const addRepoToGroup = async (groupId, repoName) => {
    if(!repoName.trim()) return;
    const group = repoGroups.find(g=>g.id===groupId);
    if(!group || group.repos.includes(repoName.trim())) return;
    const updated = [...group.repos, repoName.trim()];
    await supabase.from("dp_repo_groups").update({repos:updated}).eq("id",groupId);
    setRepoGroups(gs=>gs.map(g=>g.id===groupId?{...g,repos:updated}:g));
    setNewRepoName("");
  };

  const removeRepoFromGroup = async (groupId, repoName) => {
    const group = repoGroups.find(g=>g.id===groupId);
    if(!group) return;
    const updated = group.repos.filter(r=>r!==repoName);
    await supabase.from("dp_repo_groups").update({repos:updated}).eq("id",groupId);
    setRepoGroups(gs=>gs.map(g=>g.id===groupId?{...g,repos:updated}:g));
  };

  const renameGroup = async (groupId, name) => {
    await supabase.from("dp_repo_groups").update({name}).eq("id",groupId);
    setRepoGroups(gs=>gs.map(g=>g.id===groupId?{...g,name}:g));
  };

  return (
    <div style={{maxWidth:700}}>
      <div className="sec-t">🚀 Deploy Planner</div>
      <div className="sec-sub">Configura los estados de releases y los estados de Jira que se importan.</div>

      {/* ── Jira statuses ─────────────────────────────────────── */}
      <div className="a-card" style={{marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
          <div className="a-ct" style={{margin:0,flex:1}}>Estados de Jira que se importan</div>
          <button onClick={fetchAllJiraStatuses} disabled={fetchingJ}
            style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:5,padding:"5px 12px",fontSize:11,color:"var(--tx2)",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>
            {fetchingJ?"⟳ Obteniendo…":"↓ Traer todos de Jira"}
          </button>
          <button onClick={saveJiraStatuses} disabled={savingJ}
            style={{background:"var(--ac)",color:"#fff",border:"none",borderRadius:5,padding:"5px 12px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
            {savingJ?"Guardando…":savedJ?"✓ Guardado":"Guardar"}
          </button>
        </div>
        <div style={{fontSize:11,color:"var(--tx3)",marginBottom:12}}>
          Los tickets con estos estados aparecerán en el Deploy Planner al conectar Jira.
        </div>

        {/* List */}
        <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}>
          {jiraList.map(j=>(
            <div key={j.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"var(--sf2)",borderRadius:6,border:"1px solid var(--bd)"}}>
              <span style={{fontSize:11,color:"var(--tx3)"}}>●</span>
              <input value={j.name} onChange={e=>editJiraStatus(j.id,e.target.value)}
                style={{flex:1,background:"none",border:"none",outline:"none",fontSize:12,color:"var(--tx)",fontFamily:"inherit"}}/>
              <button onClick={()=>delJiraStatus(j.id)}
                style={{background:"none",border:"none",color:"var(--red)",cursor:"pointer",fontSize:14,lineHeight:1}}>×</button>
            </div>
          ))}
          {jiraList.length===0&&<div style={{fontSize:11,color:"var(--tx3)",padding:"8px 0"}}>Sin estados configurados</div>}
        </div>

        {/* Add */}
        <div style={{display:"flex",gap:6}}>
          <input value={newJiraName} onChange={e=>setNewJiraName(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"){addJiraStatus(newJiraName);setNewJiraName("");}}}
            placeholder="Nombre del estado en Jira…"
            style={{flex:1,background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:5,padding:"6px 10px",color:"var(--tx)",fontSize:12,fontFamily:"inherit",outline:"none"}}/>
          <button onClick={()=>{addJiraStatus(newJiraName);setNewJiraName("");}}
            style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:5,padding:"6px 12px",fontSize:12,color:"var(--tx2)",cursor:"pointer",fontFamily:"inherit"}}>+ Añadir</button>
        </div>
      </div>

      {/* ── Release statuses ──────────────────────────────────── */}
      <div className="a-card">
        <div className="a-ct">Estados de Release</div>
        <div style={{fontSize:11,color:"var(--tx3)",marginBottom:14}}>
          Arrastra para reordenar. Los estados "final" van a History.
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>
          {statuses.map((st,i)=>(
            <div key={st.id}
              draggable
              onDragStart={()=>setDragging(i)}
              onDragOver={e=>{e.preventDefault();setDragOver(i);}}
              onDragEnd={onDragEnd}
              style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:dragOver===i?"var(--glow)":"var(--sf2)",borderRadius:8,border:`1px solid ${dragOver===i?"var(--ac)":"var(--bd)"}`,cursor:"grab",transition:"background .1s"}}>
              <span style={{color:"var(--tx3)",fontSize:12,cursor:"grab"}}>⠿</span>
              <div style={{width:14,height:14,borderRadius:3,background:st.color,flexShrink:0,border:`1px solid ${st.color}66`}}/>

              {editing?.id===st.id ? (
                <>
                  <input value={editing.name} onChange={e=>setEditing(v=>({...v,name:e.target.value}))}
                    style={{flex:1,background:"var(--sf)",border:"1px solid var(--ac)",borderRadius:4,padding:"3px 7px",fontSize:12,color:"var(--tx)",fontFamily:"inherit",outline:"none"}}/>
                  <input type="color" value={editing.color} onChange={e=>setEditing(v=>({...v,color:e.target.value}))}
                    style={{width:28,height:24,border:"none",background:"none",cursor:"pointer",padding:0}}/>
                  <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"var(--tx3)",cursor:"pointer",flexShrink:0}}>
                    <input type="checkbox" checked={editing.is_final} onChange={e=>setEditing(v=>({...v,is_final:e.target.checked}))}/>
                    Final
                  </label>
                  <button onClick={()=>saveRelStatus(editing)}
                    style={{background:"var(--ac)",color:"#fff",border:"none",borderRadius:4,padding:"3px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✓</button>
                  <button onClick={()=>setEditing(null)}
                    style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",fontSize:13}}>×</button>
                </>
              ) : (
                <>
                  <span style={{flex:1,fontSize:13,fontWeight:600,color:"var(--tx)"}}>{st.name}</span>
                  <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:st.bg_color,color:st.color,border:`1px solid ${st.border}`,flexShrink:0}}>{st.name}</span>
                  {st.is_final&&<span style={{fontSize:9,color:"var(--tx3)",background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:10,padding:"1px 6px",flexShrink:0}}>Final</span>}
                  <button onClick={()=>setEditing({id:st.id,name:st.name,color:st.color,is_final:st.is_final})}
                    style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",fontSize:13}}>✎</button>
                  <button onClick={()=>delRelStatus(st.id)}
                    style={{background:"none",border:"none",color:"var(--red)",cursor:"pointer",fontSize:14}}>×</button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add new release status */}
        <div style={{padding:"12px 14px",background:"var(--sf2)",borderRadius:8,border:"1px dashed var(--bd)"}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--tx3)",marginBottom:8,textTransform:"uppercase",letterSpacing:".08em"}}>Nuevo estado</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <input value={newStatus.name} onChange={e=>setNewStatus(s=>({...s,name:e.target.value}))}
              placeholder="Nombre del estado"
              style={{flex:2,minWidth:130,background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:5,padding:"6px 10px",color:"var(--tx)",fontSize:12,fontFamily:"inherit",outline:"none"}}/>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <label style={{fontSize:11,color:"var(--tx3)"}}>Color</label>
              <input type="color" value={newStatus.color}
                onChange={e=>setNewStatus(s=>({...s,color:e.target.value}))}
                style={{width:32,height:28,border:"none",background:"none",cursor:"pointer",padding:0}}/>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"var(--tx3)",cursor:"pointer"}}>
              <input type="checkbox" checked={newStatus.is_final} onChange={e=>setNewStatus(s=>({...s,is_final:e.target.checked}))}/>
              Estado final
            </label>
            <button onClick={addRelStatus}
              style={{background:"var(--ac)",color:"#fff",border:"none",borderRadius:5,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
              + Añadir
            </button>
          </div>
        </div>
      </div>

      {/* ── Version config ─────────────────────────────────────── */}
      <div className="a-card" style={{marginTop:16}}>
        <div className="a-ct">Generador de versiones</div>
        <div style={{fontSize:11,color:"var(--tx3)",marginBottom:14}}>
          Define el prefijo, separador y los segmentos (major/minor/patch o los que necesites).
          Los valores son el punto de partida cuando no hay releases. Después el picker
          lee el último número real y calcula el siguiente correctamente.
        </div>
        {verCfg && (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {/* Prefix + Separator */}
            <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:"var(--tx3)",marginBottom:4,letterSpacing:".06em",textTransform:"uppercase"}}>Prefijo</div>
                <input value={verCfg.prefix||""} onChange={e=>setVerCfg(v=>({...v,prefix:e.target.value}))}
                  placeholder="v" maxLength={8}
                  style={{width:72,background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:5,padding:"6px 10px",color:"var(--tx)",fontSize:14,fontFamily:"monospace",outline:"none",textAlign:"center"}}/>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:"var(--tx3)",marginBottom:4,letterSpacing:".06em",textTransform:"uppercase"}}>Separador</div>
                <input value={verCfg.separator||"."} onChange={e=>setVerCfg(v=>({...v,separator:e.target.value}))}
                  placeholder="." maxLength={2}
                  style={{width:44,background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:5,padding:"6px 10px",color:"var(--tx)",fontSize:14,fontFamily:"monospace",outline:"none",textAlign:"center"}}/>
              </div>
              <div style={{padding:"0 4px",fontSize:11,color:"var(--tx3)",marginBottom:4}}>
                Formato: <strong style={{color:"var(--tx)",fontFamily:"monospace"}}>
                  {(verCfg.prefix||"v")}{(verCfg.segments||[]).map(s=>s.value??0).join(verCfg.separator||".")}
                </strong>
                <div style={{fontSize:10,color:"var(--tx3)",marginTop:2}}>
                  Cuando hagas la primera release desde el picker verás major{verCfg.separator||"."}minor{verCfg.separator||"."}patch como opciones de bump.
                </div>
              </div>
            </div>

            {/* Segments */}
            <div>
              <div style={{fontSize:10,fontWeight:700,color:"var(--tx3)",marginBottom:8,letterSpacing:".06em",textTransform:"uppercase"}}>Segmentos (valores iniciales)</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {(verCfg.segments||[]).map((seg,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"var(--sf2)",borderRadius:7,border:"1px solid var(--bd)"}}>
                    <input value={seg.name}
                      onChange={e=>{const segs=[...(verCfg.segments||[])];segs[i]={...segs[i],name:e.target.value};setVerCfg(v=>({...v,segments:segs}));}}
                      style={{flex:1,background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:4,padding:"4px 8px",color:"var(--tx)",fontSize:12,fontFamily:"inherit",outline:"none"}}
                      placeholder="nombre (ej: major)"/>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      <span style={{fontSize:11,color:"var(--tx3)"}}>Inicio:</span>
                      <input type="number" min="0" value={seg.value??0}
                        onChange={e=>{const segs=[...(verCfg.segments||[])];segs[i]={...segs[i],value:parseInt(e.target.value)||0};setVerCfg(v=>({...v,segments:segs}));}}
                        style={{width:64,background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:4,padding:"4px 8px",color:"var(--tx)",fontSize:12,fontFamily:"monospace",outline:"none",textAlign:"center"}}/>
                    </div>
                    <button onClick={()=>{const segs=(verCfg.segments||[]).filter((_,j)=>j!==i);setVerCfg(v=>({...v,segments:segs}));}}
                      style={{background:"none",border:"none",color:"var(--red)",cursor:"pointer",fontSize:14,lineHeight:1}}>×</button>
                  </div>
                ))}
              </div>
              <button onClick={()=>setVerCfg(v=>({...v,segments:[...(v.segments||[]),{name:"nuevo",value:0}]}))}
                style={{marginTop:8,background:"var(--sf2)",border:"1px dashed var(--bd)",borderRadius:5,padding:"6px 14px",fontSize:11,color:"var(--tx3)",cursor:"pointer",fontFamily:"inherit"}}>
                + Añadir segmento
              </button>
            </div>

            <button onClick={saveVerCfg} disabled={verCfgSaving}
              style={{background:"var(--ac)",color:"#fff",border:"none",borderRadius:6,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",alignSelf:"flex-start"}}>
              {verCfgSaving?"Guardando…":verCfgSaved?"✓ Guardado":"Guardar configuración"}
            </button>
          </div>
        )}
      </div>

      {/* ── Jira Field Mapping ─────────────────────────────────── */}
      <JiraFieldMapping verCfg={verCfg} setVerCfg={setVerCfg}/>

      {/* ── Repo groups ───────────────────────────────────────── */}
      <div className="a-card" style={{marginTop:16}}>
        <div className="a-ct">Grupos de repositorios con dependencias</div>
        <div style={{fontSize:11,color:"var(--tx3)",marginBottom:14}}>
          Define grupos de repos que comparten pipeline. Si dos releases activas tienen repos del mismo grupo,
          el merge a master quedará bloqueado hasta que ambas estén cerradas.
        </div>

        {/* Existing groups */}
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
          {repoGroups.map(group=>(
            <div key={group.id} style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,overflow:"hidden"}}>
              {/* Group header */}
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderBottom:expandedGroup===group.id?"1px solid var(--bd)":"none"}}>
                <button onClick={()=>setExpandedGroup(expandedGroup===group.id?null:group.id)}
                  style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",fontSize:11,flexShrink:0,padding:0}}>
                  {expandedGroup===group.id?"▼":"▶"}
                </button>
                <input
                  value={group.name}
                  onChange={e=>renameGroup(group.id,e.target.value)}
                  style={{flex:1,background:"none",border:"none",outline:"none",fontSize:13,fontWeight:600,color:"var(--tx)",fontFamily:"inherit"}}
                />
                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                  {group.repos.slice(0,3).map(r=>(
                    <span key={r} style={{fontSize:9,padding:"2px 7px",borderRadius:10,background:"var(--glow)",border:"1px solid var(--bd)",color:"var(--tx3)"}}>{r}</span>
                  ))}
                  {group.repos.length>3&&<span style={{fontSize:9,color:"var(--tx3)"}}>+{group.repos.length-3}</span>}
                  <span style={{fontSize:10,color:"var(--tx3)",marginLeft:4}}>{group.repos.length} repos</span>
                  <button onClick={()=>deleteGroup(group.id)}
                    style={{background:"none",border:"none",color:"var(--red)",cursor:"pointer",fontSize:14,marginLeft:4}}>×</button>
                </div>
              </div>

              {/* Group repos (expanded) */}
              {expandedGroup===group.id&&(
                <div style={{padding:"12px 14px"}}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                    {group.repos.length===0&&(
                      <span style={{fontSize:11,color:"var(--tx3)"}}>Sin repositorios — añade el primero abajo</span>
                    )}
                    {group.repos.map(repo=>(
                      <div key={repo} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:20,fontSize:11,color:"var(--tx2)"}}>
                        <span>⬡</span>
                        <span>{repo}</span>
                        <button onClick={()=>removeRepoFromGroup(group.id,repo)}
                          style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",fontSize:12,lineHeight:1,padding:0}}>×</button>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <input
                      placeholder="Nombre del repo (ej: backend-api)…"
                      value={expandedGroup===group.id?newRepoName:""}
                      onChange={e=>setNewRepoName(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter"){addRepoToGroup(group.id,newRepoName);}}}
                      style={{flex:1,background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:5,padding:"6px 10px",color:"var(--tx)",fontSize:11,fontFamily:"inherit",outline:"none"}}
                    />
                    <button onClick={()=>addRepoToGroup(group.id,newRepoName)}
                      style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:5,padding:"6px 12px",fontSize:11,color:"var(--tx2)",cursor:"pointer",fontFamily:"inherit"}}>
                      + Añadir repo
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {repoGroups.length===0&&(
            <div style={{fontSize:11,color:"var(--tx3)",padding:"8px 0"}}>Sin grupos configurados</div>
          )}
        </div>

        {/* Add new group */}
        <div style={{display:"flex",gap:8}}>
          <input
            value={newGroupName}
            onChange={e=>setNewGroupName(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")addGroup();}}
            placeholder="Nombre del grupo (ej: Backend monorepo)…"
            style={{flex:1,background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:5,padding:"8px 12px",color:"var(--tx)",fontSize:12,fontFamily:"inherit",outline:"none"}}
          />
          <button onClick={addGroup}
            style={{background:"var(--ac)",color:"#fff",border:"none",borderRadius:5,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
            + Nuevo grupo
          </button>
        </div>
      </div>

    </div>
  );
}

export { AdminDeployConfig };
