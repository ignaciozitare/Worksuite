// @ts-nocheck
// Deploy Planner — root view. Routes between Planning / Timeline / History /
// Metrics and delegates heavy rendering to small components under ./internal/.
import { useState, useEffect } from "react";
import { supabase } from "../../../shared/lib/supabaseClient";
import { extractReposFromTickets } from '@worksuite/jira-service';
import { RepoGroupService } from '../domain/services/RepoGroupService';
import { SubtaskService } from '../domain/services/SubtaskService';
import { JiraSubtaskAdapter } from '../infra/JiraSubtaskAdapter';
import { SupabaseSubtaskConfigRepo } from '../infra/supabase/SupabaseSubtaskConfigRepo';
import { SupabaseDeployConfigRepo } from '../infra/supabase/SupabaseDeployConfigRepo';
import { SupabaseDeployReleaseRawRepo } from '../infra/supabase/SupabaseDeployReleaseRawRepo';
import { HttpJiraApiAdapter } from '@/shared/infra/HttpJiraApiAdapter';
import { today, fmt, addD } from './internal/helpers';
import { Metrics } from './internal/Metrics';
import { History } from './internal/History';
import { Timeline } from './internal/Timeline';
import { ReleaseCard } from './internal/ReleaseCard';
import { ReleaseDetail } from './internal/ReleaseDetail';

/* ─── CSS ────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
.dp *{box-sizing:border-box;margin:0;padding:0;}
.dp{font-family:'JetBrains Mono',monospace;background:var(--dp-bg,#07090f);color:var(--dp-tx,#c9d1d9);height:100%;overflow:auto;}
.dp button,.dp select,.dp input,.dp textarea{font-family:'JetBrains Mono',monospace;}
.dp input[type=date]::-webkit-calendar-picker-indicator{filter:var(--dp-date-filter,invert(.4) sepia(1) hue-rotate(180deg));}
.dp ::-webkit-scrollbar{width:4px;height:4px;}
.dp ::-webkit-scrollbar-track{background:var(--dp-bg,#07090f);}
.dp ::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px;}
.dp select option{background:var(--dp-sf,#0b0f18);}
/* Dark (default) */
.dp{
  --dp-bg:#07090f; --dp-sf:#0b0f18; --dp-sf2:#07090f;
  --dp-tx:#c9d1d9; --dp-tx2:#94a3b8; --dp-tx3:#64748b;
  --dp-bd:#1e293b; --dp-date-filter:invert(.4) sepia(1) hue-rotate(180deg);
}
/* Light mode — activated by data-theme="light" or .light class */
[data-theme="light"] .dp, .light .dp, .dp.light{
  --dp-bg:#f1f5f9; --dp-sf:#ffffff; --dp-sf2:#f8fafc;
  --dp-tx:#0f172a; --dp-tx2:#475569; --dp-tx3:#64748b;
  --dp-bd:#e2e8f0; --dp-date-filter:none;
}
[data-theme="light"] .dp ::-webkit-scrollbar-thumb, .light .dp ::-webkit-scrollbar-thumb, .dp.light ::-webkit-scrollbar-thumb{background:#cbd5e1;}
[data-theme="light"] .dp select option, .light .dp select option, .dp.light select option{background:#ffffff;}
@keyframes slideIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.anim-in{animation:slideIn .2s ease forwards;}
.fade-in{animation:fadeIn .15s ease;}
@keyframes spin{to{transform:rotate(360deg)}}
.spin{display:inline-block;animation:spin .8s linear infinite;}
`;

/* ─── Infra wiring ────────────────────────────────────────────── */
const API_BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL || "http://localhost:3001").replace(/\/$/,"");

async function authHeaders() {
  const { data:{ session } } = await supabase.auth.getSession();
  return session?.access_token ? { "Authorization":`Bearer ${session.access_token}`, "Content-Type":"application/json" } : { "Content-Type":"application/json" };
}

const subtaskAdapter = new JiraSubtaskAdapter(API_BASE, authHeaders);
const subtaskConfigRepo = new SupabaseSubtaskConfigRepo(supabase);
const deployConfigRepo = new SupabaseDeployConfigRepo(supabase);
const releaseRawRepo = new SupabaseDeployReleaseRawRepo(supabase);
const jiraApi = new HttpJiraApiAdapter(API_BASE, authHeaders);

/* ─── JIRA SYNC ──────────────────────────────────────────────── */
async function jiraTransition(issueKey, appStatus) {
  // Map app status → Jira status name
  const statusMap = { in_progress:"In Progress", in_review:"In Review", done:"Done", merged:"Merged" };
  const targetName = statusMap[appStatus];
  if (!targetName) return { ok:false, error:"Unknown status" };
  return jiraApi.transitionIssue(issueKey, targetName);
}

/* ─── ROOT ───────────────────────────────────────────────────── */
export function DeployPlanner({ currentUser }) {
  const [tab, setTab]           = useState("planning");
  const [detail, setDetail]       = useState(null);
  const [releases, setReleases]   = useState([]);
  const [tickets, setTickets]     = useState([]);
  const [statusCfg, setStatusCfg] = useState({});
  const [repoGroups, setRepoGroups]   = useState([]);
  const [versionCfg, setVersionCfg]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [fetchingJira, setFetchingJira] = useState(false);
  const [drag, setDrag]           = useState(null);
  const [jiraBaseUrl, setJiraBaseUrl] = useState("");
  const [subtaskConfigs, setSubtaskConfigs] = useState([]);
  const [allSubtasks, setAllSubtasks]       = useState([]);
  const [classifiedSubs, setClassifiedSubs] = useState([]);

  // Light mode — read from html element class, watch for changes
  const [isLight, setIsLight] = useState(document.documentElement.classList.contains("light"));
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsLight(document.documentElement.classList.contains("light"));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [rels, statuses, deployJiraStatuses, groups, verCfg] = await Promise.all([
      releaseRawRepo.listRaw(),
      deployConfigRepo.findAllStatuses(),
      deployConfigRepo.getJiraDeployStatuses(),
      deployConfigRepo.findAllRepoGroups(),
      deployConfigRepo.getVersionConfig(),
    ]);
    setRepoGroups(groups||[]);
    setVersionCfg(verCfg || { prefix:"v", segments:[{name:"major",value:1},{name:"minor",value:0},{name:"patch",value:0}], separator:"." });
    setReleases(rels||[]);
    const cfg = {};
    (statuses||[]).forEach(s=>{ cfg[s.name]={ color:s.color, bg_color:s.bg_color, border:s.border, is_final:s.is_final, status_category:s.status_category||'backlog', ord:s.ord }; });
    if(Object.keys(cfg).length===0) {
      cfg["Planned"]          = { color:"#6b7280", bg_color:"rgba(107,114,128,.12)", border:"#1f2937", is_final:false, status_category:"backlog" };
      cfg["Staging"]          = { color:"#f59e0b", bg_color:"rgba(245,158,11,.12)",  border:"#78350f", is_final:false, status_category:"in_progress" };
      cfg["Merged to master"] = { color:"#a78bfa", bg_color:"rgba(167,139,250,.12)", border:"#4c1d95", is_final:false, status_category:"done" };
      cfg["Deployed"]         = { color:"#34d399", bg_color:"rgba(52,211,153,.12)",  border:"#064e3b", is_final:true, status_category:"approved"  };
      cfg["Rollback"]         = { color:"#f87171", bg_color:"rgba(248,113,113,.12)", border:"#7f1d1d", is_final:true, status_category:"done"  };
    }
    setStatusCfg(cfg);
    setLoading(false);
    // Load Jira connection + tickets in parallel
    fetchJiraTickets(deployJiraStatuses, verCfg);
  }

  async function fetchJiraTickets(rawStatuses, cfgOverride) {
    const cfg = cfgOverride || versionCfg;
    setFetchingJira(true);
    try {
      // Si no hay args (refresh manual), leer de DB
      if(rawStatuses === undefined) {
        rawStatuses = await deployConfigRepo.getJiraDeployStatuses();
      }
      const targetStatuses = (rawStatuses || "Ready to Production")
        .split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);

      // Paso 1: obtener proyectos + conexión Jira en paralelo
      const [projectRows, connection] = await Promise.all([
        jiraApi.listProjects(),
        jiraApi.getConnection(),
      ]);
      const projects = projectRows.map(p => p.key || (p as any).id).filter(Boolean);
      // Set Jira base URL from connection
      if(connection?.base_url) setJiraBaseUrl(connection.base_url.replace(/\/$/,""));

      if(projects.length === 0) throw new Error("No hay proyectos Jira configurados");

      // Paso 2: cargar issues de cada proyecto con el campo repo configurado
      const repoFieldName = cfg?.repo_jira_field || "components";
      const extraFields = repoFieldName !== "components" ? repoFieldName : undefined;
      const allIssues = [];
      await Promise.all(projects.map(async (project) => {
        try {
          const issues = await jiraApi.listIssues(project, extraFields);
          allIssues.push(...issues);
        } catch { /* proyecto sin acceso, ignorar */ }
      }));

      // Paso 3: filtrar por los estados configurados en Admin → Deploy Planner
      const filtered = allIssues.filter(i => {
        const issueStatus = (i.status || i.fields?.status?.name || "").toLowerCase();
        return targetStatuses.some(s => issueStatus.includes(s) || s.includes(issueStatus));
      });

      if(filtered.length>0) console.log("[DeployPlanner] repoField:", repoFieldName, "sample:", filtered[0].key, "fields:", Object.keys(filtered[0].fields||{}), "value:", (filtered[0].fields||{})[repoFieldName]);

      const newTickets = filtered.map(i => {
        const fields = i.fields || i;
        // Use shared extraction util (handles array/string/object shapes + comma-split).
        // `extractReposFromTickets` accepts raw issues; we also fall back to `components`
        // to preserve the legacy behaviour of this view.
        let repos = extractReposFromTickets([i], repoFieldName);
        if (repos.length === 0 && repoFieldName !== "components") {
          repos = extractReposFromTickets([i], "components");
        }
        return {
          key:      i.key || i.id,
          summary:  i.summary || fields.summary || "",
          assignee: i.assignee || fields.assignee?.displayName || "—",
          priority: i.priority || fields.priority?.name || "Medium",
          type:     i.type || fields.issuetype?.name || "Task",
          status:   i.status || fields.status?.name || "",
          repos,
        };
      });

      setTickets(newTickets);

      if(newTickets.length === 0) {
        console.warn(`Jira: ${allIssues.length} issues cargados de ${projects.length} proyectos, ninguno coincide con estados: "${rawStatuses}"`);
      }

      // Load subtask config + subtasks for all tickets
      try {
        const stConfigs = await subtaskConfigRepo.findAll();
        setSubtaskConfigs(stConfigs);
        console.log("[DeployPlanner] subtask configs:", stConfigs.length, "tickets:", newTickets.length);
        if (stConfigs.length > 0 && newTickets.length > 0) {
          const parentKeys = newTickets.map(t => t.key);
          console.log("[DeployPlanner] fetching subtasks for:", parentKeys.join(","));
          const rawSubs = await subtaskAdapter.getSubtasks(parentKeys);
          console.log("[DeployPlanner] raw subtasks:", rawSubs.length);
          const classified = SubtaskService.classify(rawSubs, stConfigs);
          console.log("[DeployPlanner] classified:", classified.length, classified.map(s=>s.key+":"+s.type+":"+s.category));
          setAllSubtasks(rawSubs);
          setClassifiedSubs(classified);
        }
      } catch(e) { console.warn("Subtask load error:", e.message); }
    } catch(e) {
      console.warn("Jira fetch error:", e.message);
    }
    setFetchingJira(false);
  }

  const upd = async (id, patch) => {
    setReleases(rs=>rs.map(r=>r.id===id?{...r,...patch}:r));
    await releaseRawRepo.updateRaw(id, patch);
  };

  const addRelease = async () => {
    const last=releases[releases.length-1];
    const firstStatus=Object.keys(statusCfg)[0]||"Planned";
    const newRel={ release_number:"", description:"", status:firstStatus, start_date:last?addD(last.end_date||fmt(today),2):fmt(today), end_date:last?addD(last.end_date||fmt(today),7):addD(fmt(today),5), ticket_ids:[], ticket_statuses:{}, created_by:currentUser.id };
    const data = await releaseRawRepo.insertRaw(newRel);
    if(data) setReleases(rs=>[...rs,data]);
  };

  const delRelease = async (id) => {
    if(!confirm("¿Eliminar esta release?")) return;
    setReleases(rs=>rs.filter(r=>r.id!==id));
    await releaseRawRepo.deleteRaw(id);
  };

  const handleDrop = (targetId) => {
    if(!drag||drag.fromId===targetId) return;
    const fromRel = releases.find(r=>r.id===drag.fromId);
    if(!fromRel) return;
    upd(drag.fromId,{ticket_ids:(fromRel.ticket_ids||[]).filter(x=>x!==drag.key)});
    const toRel = releases.find(r=>r.id===targetId);
    if(toRel&&!(toRel.ticket_ids||[]).includes(drag.key))
      upd(targetId,{ticket_ids:[...(toRel.ticket_ids||[]),drag.key]});
    setDrag(null);
  };

  const [filterStatus, setFilterStatus] = useState([]);
  const activeF = filterStatus.length===0;
  const filteredRels  = releases.filter(r=>activeF||filterStatus.includes(r.status));
  const hidden   = releases.filter(r=>!activeF&&!filterStatus.includes(r.status)).length;

  // Compute linked groups for visual grouping + is_final blocking
  const tMap = Object.fromEntries(tickets.map(t=>[t.key,t]));
  const getCat = (status) => statusCfg[status]?.status_category || 'backlog';
  const linkedGroups = RepoGroupService.findLinkedGroups(
    repoGroups,
    releases.map(r=>({id:r.id,ticketIds:r.ticket_ids||[],status:r.status||"Planned",statusCategory:getCat(r.status||"Planned")})),
    tickets.map(t=>({key:t.key,repos:t.repos||[]})),
  );

  // Order visible: group members together
  const visible = (() => {
    if(!linkedGroups.length) return filteredRels;
    const ordered = [];
    const used = new Set();
    linkedGroups.forEach(lg => {
      const members = filteredRels.filter(r=>lg.releaseIds.includes(r.id));
      members.forEach(r=>{ if(!used.has(r.id)){ ordered.push(r); used.add(r.id); }});
    });
    filteredRels.forEach(r=>{ if(!used.has(r.id)) ordered.push(r); });
    return ordered;
  })();

  const TABS=[
    {id:"planning", label:"Planning", badge:releases.filter(r=>!statusCfg[r.status]?.is_final).length||undefined},
    {id:"timeline", label:"Timeline"},
    {id:"history",  label:"History",  badge:releases.filter(r=>statusCfg[r.status]?.is_final).length||undefined},
    {id:"metrics",  label:"Metrics"},
  ];

  const detailRel = detail ? releases.find(r=>r.id===detail) : null;

  return (
    <div className={`dp${isLight?" light":""}`}>
      <style>{CSS}</style>

      {/* Nav */}
      <nav style={{borderBottom:"1px solid var(--dp-bd,#0e1520)",padding:"0 20px",display:"flex",alignItems:"center",height:52,background:"var(--dp-sf,#07090f)",gap:10,position:"sticky",top:0,zIndex:20}}>
        {detail ? (
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button onClick={()=>setDetail(null)} style={{background:"none",border:"none",color:"var(--dp-tx3,#64748b)",cursor:"pointer",fontSize:18,lineHeight:1}}>←</button>
            <div style={{width:26,height:26,background:"linear-gradient(135deg,#1d4ed8,#0ea5e9)",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🚀</div>
            <span style={{fontWeight:700,fontSize:13,color:"var(--dp-tx,#e6edf3)",letterSpacing:".04em"}}>Deploy Planner</span>
            <span style={{color:"var(--dp-tx3,#334155)",fontSize:11}}>→</span>
            <span style={{fontSize:12,color:"#38bdf8",fontWeight:600}}>{detailRel?.release_number}</span>
          </div>
        ) : (
          <>
            <div style={{display:"flex",gap:2,background:"var(--dp-sf2,#07090f)",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:8,padding:3}}>
              {TABS.map(t=>(
                <button key={t.id} onClick={()=>setTab(t.id)}
                  style={{padding:"4px 12px",fontSize:12,fontWeight:tab===t.id?600:400,borderRadius:6,
                    border:"none",cursor:"pointer",fontFamily:"inherit",
                    background:tab===t.id?"#38bdf8":"transparent",
                    color:tab===t.id?"#000":"var(--dp-tx3,#64748b)",
                    boxShadow:tab===t.id?"0 1px 3px rgba(0,0,0,.15)":"none",
                    transition:"all .15s",display:"flex",alignItems:"center",gap:5}}>
                  {t.label}
                  {t.badge>0&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:10,
                    background:tab===t.id?"rgba(0,0,0,.2)":"rgba(56,189,248,.08)",
                    color:tab===t.id?"rgba(0,0,0,.7)":"var(--dp-tx3,#475569)"}}>{t.badge}</span>}
                </button>
              ))}
            </div>
          </>
        )}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:10,color:"var(--dp-tx3,#334155)"}}>
            {fetchingJira ? <><span className="spin" style={{marginRight:4}}>⟳</span>Sincronizando Jira…</> : `${tickets.length} tickets`}
          </span>
          <button onClick={()=>fetchJiraTickets()} disabled={fetchingJira} title="Recargar tickets de Jira"
            style={{background:"transparent",border:"1px solid var(--dp-bd,#1e293b)",borderRadius:5,width:28,height:28,color:"var(--dp-tx2,#64748b)",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            ↻
          </button>
        </div>
      </nav>

      {/* Content */}
      <div style={{padding:28}}>
        {loading ? (
          <div style={{textAlign:"center",padding:60,color:"var(--dp-tx3,#334155)",fontSize:13}}>Cargando…</div>
        ) : detailRel ? (
          <ReleaseDetail
            rel={detailRel}
            tickets={tickets}
            statusCfg={statusCfg}
            repoGroups={repoGroups}
            allReleases={releases}
            isLight={isLight}
            onBack={()=>setDetail(null)}
            onUpdRelease={patch=>upd(detail,patch)}
            classifiedSubs={classifiedSubs}
            jiraBaseUrl={jiraBaseUrl}
            onPersistTicketStatuses={(id, ticketStatuses) => releaseRawRepo.updateRaw(id, { ticket_statuses: ticketStatuses })}
            jiraTransition={jiraTransition}
            onRefreshSubtasks={async()=>{
              try {
                const stConfigs = await subtaskConfigRepo.findAll();
                const parentKeys = tickets.map(t=>t.key);
                const rawSubs = await subtaskAdapter.getSubtasks(parentKeys);
                setAllSubtasks(rawSubs);
                setClassifiedSubs(SubtaskService.classify(rawSubs, stConfigs));
              } catch(e) { console.warn("Refresh subtasks error:", e.message); }
            }}
          />
        ) : (
          <>
            {tab==="planning"&&(
              <div style={{position:"relative"}}>
                {/* Loading overlay */}
                {fetchingJira&&tickets.length===0&&(
                  <div style={{position:"absolute",inset:0,zIndex:10,background:"var(--dp-bg,rgba(7,9,15,.85))",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,borderRadius:8,minHeight:200}}>
                    <div className="spin" style={{fontSize:24,color:"#38bdf8"}}>⟳</div>
                    <div style={{fontSize:12,color:"var(--dp-tx2,#94a3b8)",fontWeight:600}}>Cargando tickets de Jira…</div>
                    <div style={{fontSize:10,color:"var(--dp-tx3,#64748b)"}}>Conectando con proyectos y sincronizando issues</div>
                  </div>
                )}
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:20,flexWrap:"wrap"}}>
                  <h2 style={{fontSize:14,color:"var(--dp-tx,#e6edf3)",fontWeight:700,marginRight:8}}>Planificación</h2>
                  <span style={{fontSize:10,color:"var(--dp-tx3,#64748b)",marginRight:8}}>
                    {releases.length} releases · {tickets.length} tickets
                    {fetchingJira&&tickets.length>0&&<span className="spin" style={{marginLeft:6,display:"inline-block"}}>⟳</span>}
                  </span>
                  {Object.entries(statusCfg).map(([name,cfg])=>{
                    const on=filterStatus.includes(name);
                    return <button key={name} onClick={()=>setFilterStatus(f=>f.includes(name)?f.filter(x=>x!==name):[...f,name])}
                      style={{fontSize:10,padding:"3px 10px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",fontWeight:600,background:on?cfg.bg_color:"transparent",color:on?cfg.color:"var(--dp-tx3,#334155)",border:`1px solid ${on?cfg.border:"var(--dp-bd,#1e293b)"}`,transition:"all .12s"}}>{name}</button>;
                  })}
                </div>
                {hidden>0&&<div style={{fontSize:10,color:"var(--dp-tx3,#334155)",marginBottom:14}}>↓ {hidden} release{hidden>1?"s":""} oculta{hidden>1?"s":""} por filtros — actívalas arriba o ve a History.</div>}
                <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"flex-start"}}>
                  {/* Render cards with group frames */}
                  {(() => {
                    const rendered = new Set();
                    const elements = [];
                    // First render grouped cards with frames
                    linkedGroups.forEach(lg => {
                      const groupCards = visible.filter(r=>lg.releaseIds.includes(r.id)&&!rendered.has(r.id));
                      if(groupCards.length<2) return;
                      groupCards.forEach(r=>rendered.add(r.id));
                      elements.push(
                        <div key={`group-${lg.group.id}`} style={{display:"flex",gap:14,flexWrap:"wrap",padding:10,border:`2px solid ${lg.allDeployed?"#22c55e":"#f59e0b"}`,borderRadius:10,background:lg.allDeployed?"rgba(34,197,94,.04)":"rgba(245,158,11,.04)",position:"relative"}}>
                          <span style={{position:"absolute",top:-9,left:14,fontSize:8,fontWeight:700,color:lg.allDeployed?"#22c55e":"#f59e0b",background:"var(--dp-bg,var(--bg,#07090f))",padding:"0 6px",letterSpacing:".05em",textTransform:"uppercase"}}>{lg.group.name}</span>
                          {groupCards.map(rel=>(
                            <ReleaseCard key={rel.id} rel={rel} statusCfg={statusCfg} tickets={tickets}
                              onOpen={setDetail} onUpd={upd} onDelete={delRelease}
                              onDrop={handleDrop} setDrag={setDrag} drag={drag}
                              allReleases={releases} repoGroups={repoGroups}
                              versionCfg={versionCfg}
                              allReleaseNumbers={(releases||[]).map(r=>r.release_number).filter(Boolean)}
                              jiraBaseUrl={jiraBaseUrl}
                              linkedGroups={linkedGroups} classifiedSubs={classifiedSubs}/>
                          ))}
                        </div>
                      );
                    });
                    // Then render ungrouped cards
                    visible.filter(r=>!rendered.has(r.id)).forEach(rel=>{
                      elements.push(
                        <ReleaseCard key={rel.id} rel={rel} statusCfg={statusCfg} tickets={tickets}
                          onOpen={setDetail} onUpd={upd} onDelete={delRelease}
                          onDrop={handleDrop} setDrag={setDrag} drag={drag}
                          allReleases={releases} repoGroups={repoGroups}
                          versionCfg={versionCfg}
                          allReleaseNumbers={(releases||[]).map(r=>r.release_number).filter(Boolean)}
                          jiraBaseUrl={jiraBaseUrl}
                          linkedGroups={linkedGroups} classifiedSubs={classifiedSubs}/>
                      );
                    });
                    return elements;
                  })()}
                  <div onClick={addRelease}
                    style={{width:290,minHeight:140,background:"transparent",border:"2px dashed var(--dp-bd,#1e293b)",borderRadius:8,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",color:"var(--dp-tx3,#334155)",fontSize:12,transition:"border-color .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#38bdf8"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="var(--dp-bd,#1e293b)"}>
                    <span style={{fontSize:24}}>+</span>
                    <span style={{fontSize:10}}>Nueva release</span>
                  </div>
                </div>
              </div>
            )}
            {tab==="timeline"&&<Timeline releases={releases} tickets={tickets} upd={upd} setDetail={setDetail} statusCfg={statusCfg} repoGroups={repoGroups}/>}
            {tab==="history" &&<History  releases={releases} tickets={tickets} setDetail={setDetail} statusCfg={statusCfg} classifiedSubs={classifiedSubs}/>}
            {tab==="metrics" &&<Metrics  releases={releases} tickets={tickets} statusCfg={statusCfg} classifiedSubs={classifiedSubs}/>}
          </>
        )}
      </div>
    </div>
  );
}
