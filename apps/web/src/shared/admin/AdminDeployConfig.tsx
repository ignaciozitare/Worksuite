// @ts-nocheck
import React from 'react';
import { useTranslation } from '@worksuite/i18n';
import { supabase } from '../lib/api';
import { SupabaseDeployConfigRepo } from '../../modules/deploy-planner/infra/supabase/SupabaseDeployConfigRepo';
import { JiraSyncAdapter } from '../../modules/jira-tracker/infra/JiraSyncAdapter';
import { GetJiraMetadata } from '../../modules/deploy-planner/domain/useCases/GetJiraMetadata';
import { JiraMetadataAdapter } from '../../modules/deploy-planner/infra/JiraMetadataAdapter';
import { SupabaseReleaseRepo } from '../../modules/deploy-planner/infra/supabase/SupabaseReleaseRepo';
import { SupabaseSubtaskConfigRepo } from '../../modules/deploy-planner/infra/supabase/SupabaseSubtaskConfigRepo';
import { DualPanelPicker, BugIcon } from '@worksuite/ui';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

const deployConfigRepo = new SupabaseDeployConfigRepo(supabase);
const jiraSyncAdapter = new JiraSyncAdapter(API_BASE, getAuthHeaders);
const jiraMetadataAdapter = new JiraMetadataAdapter(API_BASE, getAuthHeaders);
const getJiraMetadata = new GetJiraMetadata(jiraMetadataAdapter);
const releaseRepo = new SupabaseReleaseRepo(supabase);
const subtaskConfigRepo = new SupabaseSubtaskConfigRepo(supabase);

function JiraFieldMapping({verCfg,setVerCfg}){
  const {t}=useTranslation();
  const [issueTypes,setIssueTypes]=React.useState([]);
  const [fields,setFields]=React.useState([]);
  const [loading,setLoading]=React.useState(false);
  const [saving,setSaving]=React.useState(false);
  const [saved,setSaved]=React.useState(false);
  const [errMsg,setErrMsg]=React.useState("");
  const [selectedTypes,setSelectedTypes]=React.useState(verCfg?.issue_types||[]);
  const [selectedField,setSelectedField]=React.useState(verCfg?.repo_jira_field||"components");

  React.useEffect(()=>{
    if(verCfg?.issue_types)setSelectedTypes(verCfg.issue_types);
    if(verCfg?.repo_jira_field)setSelectedField(verCfg.repo_jira_field);
    // Auto-load Jira metadata if field is already configured
    if(verCfg?.id && !fields.length) fetchJiraMetadata();
  },[verCfg?.id]);

  const fetchJiraMetadata=async()=>{
    setLoading(true);
    try{
      const result=await getJiraMetadata.execute();
      setIssueTypes(result.issueTypes);
      setFields(result.fields);
    }catch(e){console.error("Fetch Jira metadata error:",e);setErrMsg(e.message||"Error loading Jira metadata. Make sure the API is deployed.");}
    setLoading(false);
  };

  const toggleType=(name)=>{
    setSelectedTypes(prev=>prev.includes(name)?prev.filter(x=>x!==name):[...prev,name]);
  };

  const save=async()=>{
    if(!verCfg?.id)return;
    setSaving(true);
    try{
      await releaseRepo.saveConfig({repoJiraField:selectedField,issueTypes:selectedTypes});
      setVerCfg(v=>({...v,repo_jira_field:selectedField,issue_types:selectedTypes}));
    }catch(e){console.error("Save config error:",e);}
    setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),2000);
  };

  return(
    <div className="a-card" style={{marginTop:16}}>
      <div className="a-ct">🔗 Jira Field Mapping</div>
      <div style={{fontSize:11,color:"var(--tx3)",marginBottom:14}}>
        Selecciona qué campo de Jira usar como "Repository & Components" para agrupar tickets por repositorio en las releases.
      </div>

      <button onClick={()=>{setErrMsg("");fetchJiraMetadata();}} disabled={loading}
        style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:6,padding:"7px 14px",fontSize:11,cursor:"pointer",color:"var(--tx2)",fontWeight:600,fontFamily:"inherit",marginBottom:14}}>
        {loading?t("common.loading"):"🔄 Cargar campos desde Jira"}
      </button>
      {errMsg&&<div style={{padding:"8px 12px",background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.25)",borderRadius:6,color:"var(--red)",fontSize:11,marginBottom:14}}>{errMsg}</div>}

      {issueTypes.length>0&&(
        <DualPanelPicker
          label="Issue Types"
          allItems={issueTypes.map(it=>({value:it.name,label:it.name,hint:it.subtask?'(subtarea)':''}))}
          selected={selectedTypes}
          onAdd={name=>setSelectedTypes(prev=>[...prev,name])}
          onRemove={name=>setSelectedTypes(prev=>prev.filter(x=>x!==name))}
        />
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

      <button onClick={save} disabled={saving}
        style={{background:"var(--ac)",color:"#fff",border:"none",borderRadius:6,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginTop:8}}>
        {saving?t("common.loading"):saved?t("common.success"):t("common.save")}
      </button>
    </div>
  );
}

function AdminDeployConfig() {
  const {t}=useTranslation();
  const [statuses, setStatuses]   = React.useState([]);
  const [editing, setEditing]     = React.useState(null); // {id, name, color, is_final}
  const [jiraList, setJiraList]   = React.useState([]); // [{name, id?}]
  const [fetchingJ, setFetchingJ] = React.useState(false);
  const [savingJ, setSavingJ]     = React.useState(false);
  const [savedJ, setSavedJ]       = React.useState(false);
  const [newStatus, setNewStatus] = React.useState({name:"",color:"#6b7280",status_category:"backlog"});
  const [dragging, setDragging]   = React.useState(null); // index being dragged
  const [dragOver, setDragOver]   = React.useState(null);

  // ── Load ─────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    deployConfigRepo.findAllStatuses()
      .then(data => { if(data) setStatuses(data); })
      .catch(e => console.error('[AdminDeployConfig] loadStatuses:', e));
    deployConfigRepo.getJiraDeployStatuses()
      .then(raw => {
        const str = raw || "Ready to Production";
        setJiraList(str.split(",").map(s=>s.trim()).filter(Boolean).map((n,i)=>({id:i, name:n})));
      })
      .catch(e => console.error('[AdminDeployConfig] loadJiraStatuses:', e));
  }, []);

  // ── Release statuses CRUD ─────────────────────────────────────────────────
  const addRelStatus = async () => {
    if(!newStatus.name.trim()) return;
    const hex = newStatus.color;
    const bg  = hex + "20";
    const brd = hex + "66";
    try {
      const data = await deployConfigRepo.createStatus({name:newStatus.name, color:hex, bg_color:bg, border:brd, status_category:newStatus.status_category||"backlog", ord:statuses.length});
      setStatuses(s=>[...s,data]); setNewStatus({name:"",color:"#6b7280",status_category:"backlog"});
    } catch(e) { console.error(e); }
  };

  const saveRelStatus = async (st) => {
    const hex = st.color;
    const patch = {name:st.name, color:hex, bg_color:hex+"20", border:hex+"66", status_category:st.status_category||"backlog"};
    await deployConfigRepo.updateStatus(st.id, patch);
    setStatuses(s=>s.map(x=>x.id===st.id?{...x,...patch}:x));
    setEditing(null);
  };

  const delRelStatus = async (id) => {
    await deployConfigRepo.deleteStatus(id);
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
    await deployConfigRepo.reorderStatuses(updated.map(s=>({id:s.id,ord:s.ord})));
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
    await deployConfigRepo.saveJiraDeployStatuses(str);
    setSavingJ(false); setSavedJ(true); setTimeout(()=>setSavedJ(false),2000);
  };

  const fetchAllJiraStatuses = async () => {
    setFetchingJ(true);
    try {
      const projects = await jiraSyncAdapter.loadProjects();
      const keys = projects.map(p=>p.key).slice(0,5);

      const statusSet = new Set();
      await Promise.all(keys.map(async proj => {
        try {
          const issues = await jiraSyncAdapter.loadIssues(proj);
          issues.forEach(i => {
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
    deployConfigRepo.getVersionConfig()
      .then(data => {
        if(data) setVerCfg(data);
        else setVerCfg({ prefix:"v", segments:[{name:"major",value:1},{name:"minor",value:0},{name:"patch",value:0}], separator:"." });
      })
      .catch(e => console.error('[AdminDeployConfig] loadVersionConfig:', e));
  }, []);

  const saveVerCfg = async () => {
    if(!verCfg) return;
    setVerCfgSaving(true);
    await deployConfigRepo.saveVersionConfig({prefix:verCfg.prefix,segments:verCfg.segments,separator:verCfg.separator});
    setVerCfgSaving(false); setVerCfgSaved(true); setTimeout(()=>setVerCfgSaved(false),2000);
  };

  // ── Repo groups ──────────────────────────────────────────────────────────
  const [repoGroups, setRepoGroups]       = React.useState([]);
  const [newGroupName, setNewGroupName]   = React.useState("");
  const [expandedGroup, setExpandedGroup] = React.useState(null); // group id
  const [newRepoName, setNewRepoName]     = React.useState("");
  const [availableRepos, setAvailableRepos] = React.useState([]);
  const [loadingRepos, setLoadingRepos]   = React.useState(false);

  // Load available repos from Jira tickets (reads configured repo field)
  const loadAvailableRepos = async () => {
    // Allow reload to get new repos
    setLoadingRepos(true);
    try {
      const repoField = verCfg?.repo_jira_field || "components";
      const projects = await jiraSyncAdapter.loadProjects();
      const allRepos = new Set();
      const extraFields = repoField !== "components" ? [repoField] : [];
      for (const p of projects.slice(0, 5)) {
        const issues = await jiraSyncAdapter.loadIssues(p.key, extraFields);
        issues.forEach(i => {
          const fields = i.fields || i;
          const val = fields[repoField] || i[repoField] || i.components || [];
          (Array.isArray(val) ? val : [val])
            .map(v => typeof v === "string" ? v : v?.name || v?.value || "")
            .filter(Boolean)
            .forEach(r => allRepos.add(r));
        });
      }
      setAvailableRepos([...allRepos].sort());
    } catch(e) { console.error("Load repos error:", e); }
    setLoadingRepos(false);
  };

  React.useEffect(() => {
    deployConfigRepo.findAllRepoGroups()
      .then(data => { if(data) setRepoGroups(data); })
      .catch(e => console.error('[AdminDeployConfig] loadRepoGroups:', e));
  }, []);

  const addGroup = async () => {
    if(!newGroupName.trim()) return;
    try {
      const data = await deployConfigRepo.createRepoGroup(newGroupName.trim());
      setRepoGroups(g=>[...g,data]); setNewGroupName(""); setExpandedGroup(data.id);
    } catch(e) { console.error(e); }
  };

  const deleteGroup = async (id) => {
    await deployConfigRepo.deleteRepoGroup(id);
    setRepoGroups(g=>g.filter(x=>x.id!==id));
  };

  const addRepoToGroup = async (groupId, repoName) => {
    if(!repoName.trim()) return;
    const group = repoGroups.find(g=>g.id===groupId);
    if(!group || group.repos.includes(repoName.trim())) return;
    const updated = [...group.repos, repoName.trim()];
    await deployConfigRepo.updateRepoGroupRepos(groupId,updated);
    setRepoGroups(gs=>gs.map(g=>g.id===groupId?{...g,repos:updated}:g));
    setNewRepoName("");
  };

  const removeRepoFromGroup = async (groupId, repoName) => {
    const group = repoGroups.find(g=>g.id===groupId);
    if(!group) return;
    const updated = group.repos.filter(r=>r!==repoName);
    await deployConfigRepo.updateRepoGroupRepos(groupId,updated);
    setRepoGroups(gs=>gs.map(g=>g.id===groupId?{...g,repos:updated}:g));
  };

  const renameGroup = async (groupId, name) => {
    await deployConfigRepo.renameRepoGroup(groupId,name);
    setRepoGroups(gs=>gs.map(g=>g.id===groupId?{...g,name}:g));
  };

  const [tab, setTab] = React.useState('statuses');
  const TABS = [
    { id: 'statuses', label: '🏷️ Estados', icon: '' },
    { id: 'jira',     label: '🔗 Jira',    icon: '' },
    { id: 'versions', label: '🔢 Versiones', icon: '' },
    { id: 'repos',    label: '📦 Repos',   icon: '' },
    { id: 'subtasks', label: 'Subtareas', icon: '' },
  ];

  return (
    <div style={{maxWidth:700}}>
      <div className="sec-t">🚀 Deploy Planner</div>
      <div className="sec-sub" style={{marginBottom:16}}>Configuración del módulo de despliegues.</div>

      {/* Tab bar */}
      <div style={{display:'flex',gap:4,marginBottom:20,background:'var(--sf2)',border:'1px solid var(--bd)',borderRadius:10,padding:4,alignSelf:'flex-start',width:'fit-content'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?'var(--ac)':'transparent',color:tab===t.id?'#fff':'var(--tx3)',border:'none',borderRadius:7,cursor:'pointer',fontWeight:tab===t.id?600:400,fontSize:12,padding:'5px 14px',transition:'all 0.15s',fontFamily:'inherit'}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==='statuses' && <>
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
            {savingJ?t("common.loading"):savedJ?t("common.success"):t("common.save")}
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
                  <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"var(--tx3)",flexShrink:0}}>
                    <select value={editing.status_category||"backlog"} onChange={e=>setEditing(v=>({...v,status_category:e.target.value}))}
                      style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:4,padding:"2px 6px",fontSize:10,color:"var(--tx)",fontFamily:"inherit"}}>
                      <option value="backlog">Backlog</option>
                      <option value="in_progress">In Progress</option>
                      <option value="approved">Approved</option>
                      <option value="done">Done</option>
                    </select>
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
                  <span style={{fontSize:9,color:"var(--tx3)",background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:10,padding:"1px 6px",flexShrink:0}}>{st.status_category||"backlog"}</span>
                  <button onClick={()=>setEditing({id:st.id,name:st.name,color:st.color,status_category:st.status_category||"backlog"})}
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
            <select value={newStatus.status_category||"backlog"} onChange={e=>setNewStatus(s=>({...s,status_category:e.target.value}))}
              style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:4,padding:"4px 8px",fontSize:10,color:"var(--tx)",fontFamily:"inherit"}}>
              <option value="backlog">Backlog</option>
              <option value="in_progress">In Progress</option>
              <option value="approved">Approved</option>
              <option value="done">Done</option>
            </select>
            <button onClick={addRelStatus}
              style={{background:"var(--ac)",color:"#fff",border:"none",borderRadius:5,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
              + Añadir
            </button>
          </div>
        </div>
      </div>

      </>}

      {tab==='jira' && <>
      {/* ── Jira Field Mapping ─────────────────────────────────── */}
      <JiraFieldMapping verCfg={verCfg} setVerCfg={setVerCfg}/>
      </>}

      {tab==='versions' && <>
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
              {verCfgSaving?t("common.loading"):verCfgSaved?t("common.success"):t("common.save")}
            </button>
          </div>
        )}
      </div>

      </>}

      {tab==='repos' && <>
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

              {/* Group repos (expanded) — show saved + available from Jira */}
              {expandedGroup===group.id&&(
                <div style={{padding:"12px 14px"}}>
                  {/* Always show saved repos as selected chips */}
                  <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>
                    {(group.repos||[]).map(repo=>(
                      <button key={repo} onClick={async()=>{
                        const next = group.repos.filter(r=>r!==repo);
                        setRepoGroups(gs=>gs.map(g=>g.id===group.id?{...g,repos:next}:g));
                        await deployConfigRepo.updateRepoGroupRepos(group.id, next);
                      }}
                        style={{padding:"4px 10px",borderRadius:20,border:"1px solid var(--ac)",background:"var(--glow)",color:"var(--ac2)",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>
                        ✓ {repo} ×
                      </button>
                    ))}
                    {group.repos.length===0&&<span style={{fontSize:11,color:"var(--tx3)"}}>Sin repositorios — carga desde Jira</span>}
                  </div>
                  {/* Button to load more repos from Jira */}
                  <button onClick={loadAvailableRepos} disabled={loadingRepos}
                    style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:5,padding:"6px 12px",fontSize:11,color:"var(--tx2)",cursor:"pointer",fontFamily:"inherit",marginBottom:8}}>
                    {loadingRepos?"Cargando…":"🔄 Cargar repositorios desde Jira"}
                  </button>
                  {/* Available repos from Jira (not yet in group) */}
                  <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>
                    {availableRepos.filter(repo=>!(group.repos||[]).includes(repo)).map(repo=>(
                      <button key={repo} onClick={async()=>{
                        const next = [...group.repos, repo];
                        setRepoGroups(gs=>gs.map(g=>g.id===group.id?{...g,repos:next}:g));
                        await deployConfigRepo.updateRepoGroupRepos(group.id, next);
                      }}
                        style={{padding:"4px 10px",borderRadius:20,border:"1px solid var(--bd)",background:"transparent",color:"var(--tx3)",cursor:"pointer",fontSize:11,fontFamily:"inherit",transition:"all .15s"}}>
                        + {repo}
                      </button>
                    ))}
                  </div>
                  {group.repos.length>0&&(
                    <div style={{fontSize:10,color:"var(--tx3)",marginTop:4}}>{group.repos.length} repositorios seleccionados</div>
                  )}
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

      </>}

      {tab==='subtasks' && <>
      {/* ── Subtask Config ──────────────────────────────────────── */}
      <SubtaskConfigSection />
      </>}

    </div>
  );
}

/* ─── Subtask Config Section ──────────────────────────────────────── */
function SubtaskConfigSection() {
  const {t}=useTranslation();
  const [configs, setConfigs]         = React.useState([]);
  const [jiraTypes, setJiraTypes]     = React.useState([]);
  const [jiraStatuses, setJiraStatuses] = React.useState([]);
  const [loading, setLoading]         = React.useState(false);

  React.useEffect(() => {
    subtaskConfigRepo.findAll()
      .then(data => setConfigs(data || []))
      .catch(e => console.error('[SubtaskConfig] load:', e));
  }, []);

  const loadJiraTypes = async () => {
    setLoading(true);
    try {
      const result = await getJiraMetadata.execute();
      setJiraTypes(result.issueTypes || []);
      // Also load statuses for the closed_statuses picker
      const projects = await jiraSyncAdapter.loadProjects();
      const statusSet = new Set();
      for (const p of projects.slice(0, 3)) {
        const issues = await jiraSyncAdapter.loadIssues(p.key);
        issues.forEach(i => { if (i.status) statusSet.add(i.status); });
      }
      setJiraStatuses([...statusSet].sort());
    } catch(e) { console.error('Load Jira types:', e); }
    setLoading(false);
  };

  const addType = async (typeName) => {
    try {
      const data = await subtaskConfigRepo.upsert({ jira_issue_type: typeName, category: 'other', closed_statuses: [] });
      setConfigs(prev => [...prev.filter(c => c.jira_issue_type !== typeName), data]);
    } catch(e) { console.error(e); }
  };

  const updateConfig = async (id, patch) => {
    const cfg = configs.find(c => c.id === id);
    if (!cfg) return;
    try {
      const data = await subtaskConfigRepo.upsert({ ...cfg, ...patch });
      setConfigs(prev => prev.map(c => c.id === id ? data : c));
    } catch(e) { console.error(e); }
  };

  const removeConfig = async (id) => {
    try {
      await subtaskConfigRepo.remove(id);
      setConfigs(prev => prev.filter(c => c.id !== id));
    } catch(e) { console.error(e); }
  };

  const toggleClosedStatus = async (id, status) => {
    const cfg = configs.find(c => c.id === id);
    if (!cfg) return;
    const next = cfg.closed_statuses.includes(status)
      ? cfg.closed_statuses.filter(s => s !== status)
      : [...cfg.closed_statuses, status];
    updateConfig(id, { closed_statuses: next });
  };

  const configuredTypes = new Set(configs.map(c => c.jira_issue_type.toLowerCase()));
  const CATEGORY_COLORS = { bug: '#ef4444', test: '#3b82f6', other: 'var(--tx3)' };

  return (
    <div className="a-card" style={{marginTop:16}}>
      <div className="a-ct"><BugIcon size={16} color="#ef4444"/> {t('deployPlanner.subtaskConfig')}</div>
      <div style={{fontSize:11,color:"var(--tx3)",marginBottom:14}}>{t('deployPlanner.subtaskDesc')}</div>

      {/* Load Jira types button */}
      <button onClick={loadJiraTypes} disabled={loading}
        style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:5,padding:"6px 12px",fontSize:11,color:"var(--tx2)",cursor:"pointer",fontFamily:"inherit",marginBottom:14}}>
        {loading ? t('common.loading') : `🔄 ${t('deployPlanner.loadIssueTypes')}`}
      </button>

      {/* Available types from Jira (not yet configured) */}
      {jiraTypes.length > 0 && (
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--tx3)",marginBottom:6,letterSpacing:".06em",textTransform:"uppercase"}}>
            Issue types disponibles
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {jiraTypes.filter(it => !configuredTypes.has(it.name.toLowerCase())).map(it => (
              <button key={it.id} onClick={() => addType(it.name)}
                style={{padding:"4px 10px",borderRadius:20,border:"1px solid var(--bd)",background:"transparent",color:"var(--tx3)",cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>
                + {it.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Configured subtask types */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {configs.map(cfg => (
          <div key={cfg.id} style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,padding:"12px 14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{fontSize:13,fontWeight:700,color:CATEGORY_COLORS[cfg.category] || "var(--tx)"}}>{cfg.jira_issue_type}</span>

              {/* Category selector */}
              <select value={cfg.category} onChange={e => updateConfig(cfg.id, { category: e.target.value })}
                style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:4,padding:"2px 8px",fontSize:10,color:"var(--tx)",fontFamily:"inherit"}}>
                <option value="bug">Bug</option>
                <option value="test">🧪 Test</option>
                <option value="other">📋 Otro</option>
              </select>

              {/* Test type (only if test) */}
              {cfg.category === 'test' && (
                <input value={cfg.test_type || ''} onChange={e => updateConfig(cfg.id, { test_type: e.target.value })}
                  placeholder="Tipo (Regresión, Smoke, UAT…)"
                  style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:4,padding:"4px 8px",fontSize:10,color:"var(--tx)",fontFamily:"inherit",flex:1}}/>
              )}

              <button onClick={() => removeConfig(cfg.id)}
                style={{background:"none",border:"none",color:"var(--red)",cursor:"pointer",fontSize:14,marginLeft:"auto"}}>×</button>
            </div>

            {/* Closed statuses picker */}
            <div style={{fontSize:10,color:"var(--tx3)",marginBottom:4}}>{t('deployPlanner.closedStatuses')}:</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
              {/* Show saved statuses + available from Jira */}
              {[...new Set([...cfg.closed_statuses, ...jiraStatuses])].sort().map(status => {
                const isOn = cfg.closed_statuses.includes(status);
                return (
                  <button key={status} onClick={() => toggleClosedStatus(cfg.id, status)}
                    style={{padding:"2px 8px",borderRadius:10,border:`1px solid ${isOn ? "var(--green)" : "var(--bd)"}`,background:isOn ? "rgba(62,207,142,.1)" : "transparent",color:isOn ? "var(--green)" : "var(--tx3)",cursor:"pointer",fontSize:9,fontFamily:"inherit"}}>
                    {isOn ? "✓ " : ""}{status}
                  </button>
                );
              })}
              {cfg.closed_statuses.length === 0 && jiraStatuses.length === 0 && (
                <span style={{fontSize:10,color:"var(--tx3)"}}>Carga tipos de Jira para ver los estados disponibles</span>
              )}
            </div>
          </div>
        ))}
        {configs.length === 0 && (
          <div style={{fontSize:11,color:"var(--tx3)",padding:"8px 0"}}>Sin tipos configurados — carga tipos desde Jira y añade los que necesites</div>
        )}
      </div>
    </div>
  );
}

export { AdminDeployConfig };
