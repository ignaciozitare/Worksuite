import React, { useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { MOCK_PROJECTS_FALLBACK } from '@/shared/lib/fallbackData';

interface JTFilterSidebarProps {
  filters: any;
  onApply: (filters: any) => void;
  onExport: (filters: any) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  users: any[];
  onProjectChange?: (projectKey: string) => void;
  jiraProjects?: any[];
  jiraUsers?: string[];
  jiraUserFilter?: string;
  onJiraUserFilter?: (email: string) => void;
}

export function JTFilterSidebar({ filters, onApply, onExport, mobileOpen, onMobileClose, users, onProjectChange, jiraProjects, jiraUsers=[], jiraUserFilter="", onJiraUserFilter }: JTFilterSidebarProps) {
  const { t } = useTranslation();
  const projects = jiraProjects || MOCK_PROJECTS_FALLBACK;
  const [l, sL] = useState(filters);
  const [spaceQ, setSpaceQ] = useState("");
  const filteredProjects = spaceQ.trim()
    ? projects.filter(p => p.key.toLowerCase().includes(spaceQ.toLowerCase()) || p.name.toLowerCase().includes(spaceQ.toLowerCase()))
    : projects;

  const ts = (k: string) => {
    const isAdding = !l.spaceKeys.includes(k);
    const newKeys = isAdding ? [...l.spaceKeys, k] : l.spaceKeys.filter((x: string) => x !== k);
    sL((f: any) => ({ ...f, spaceKeys: newKeys }));
    if (isAdding && onProjectChange) onProjectChange(k);
  };

  return (
    <aside className={`sb ${mobileOpen?"sb-open":""}`}>
      <div className="sb-s"><div className="sb-lbl">{t("jiraTracker.dateRange")}</div>
        <input className="fi" type="date" value={l.from} onChange={e=>sL({...l,from:e.target.value})}/>
        <input className="fi" type="date" value={l.to}   onChange={e=>sL({...l,to:e.target.value})}/>
      </div>
      <div className="sb-s"><div className="sb-lbl">{t("jiraTracker.filterByUser")} (Jira)</div>
        <select className="fi" value={jiraUserFilter} onChange={e=>onJiraUserFilter?.(e.target.value)}>
          <option value="">{t("jiraTracker.allUsers")}</option>
          {jiraUsers.map(u=><option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <div className="sb-s"><div className="sb-lbl">{t("jiraTracker.filterByUser")} (WorkSuite)</div>
        <select className="fi" value={l.authorId} onChange={e=>sL({...l,authorId:e.target.value})}>
          <option value="">{t("jiraTracker.allUsers")}</option>
          {(users||[]).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div className="sb-s">
        <div className="sb-lbl">{t("jiraTracker.spaces")}{l.spaceKeys.length>0&&<span className="sb-cnt">({l.spaceKeys.length})</span>}</div>
        <input className="fi" placeholder={t("jiraTracker.searchSpaces")} value={spaceQ} onChange={e=>setSpaceQ(e.target.value)} style={{fontSize:11}}/>
        <div className="pick-l" style={{maxHeight:200,overflowY:"auto"}}>
          {filteredProjects.map(p=>{const on=l.spaceKeys.includes(p.key);return(
            <div key={p.key} className={`pick-i ${on?"on":""}`} onClick={()=>ts(p.key)}>
              <div className="cb">{on&&"✓"}</div><span className="kb">{p.key}</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>
            </div>
          );})}
          {filteredProjects.length===0&&<div style={{fontSize:11,color:"var(--tx3)",padding:"6px 8px"}}>Sin resultados</div>}
        </div>
        {l.spaceKeys.length>0&&<button className="btn-g" onClick={()=>sL({...l,spaceKeys:[]})}>{t("jiraTracker.clearSelection")}</button>}
      </div>
      <button className="btn-p" onClick={()=>onApply(l)}>{t("jiraTracker.applyFilters")}</button>
      <button className="btn-exp" onClick={()=>onExport(l)}>{t("jiraTracker.exportCsv")}</button>
      <div style={{fontSize:10,color:"var(--tx3)",textAlign:"center",lineHeight:1.5,marginTop:-8}}>{t("jiraTracker.exportHint")}</div>
    </aside>
  );
}
