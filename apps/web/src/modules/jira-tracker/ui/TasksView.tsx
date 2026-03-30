// @ts-nocheck
import React, { useState, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { TimeParser } from '../domain/services/TimeParser';
import { MOCK_ISSUES_FALLBACK, MOCK_PROJECTS_FALLBACK } from '@/shared/lib/fallbackData';

interface TasksViewProps {
  filters: any;
  onOpenLog: (opts: any) => void;
  worklogs: Record<string, any[]>;
  jiraIssues?: any[];
  jiraProjects?: any[];
}

export function TasksView({ filters, onOpenLog, worklogs, jiraIssues, jiraProjects }: TasksViewProps) {
  const { t } = useTranslation();
  const issues = jiraIssues || MOCK_ISSUES_FALLBACK;
  const projects = jiraProjects || MOCK_PROJECTS_FALLBACK;

  const hoursByIssue = useMemo(() => {
    const map: Record<string, number> = {};
    for (const dayWls of Object.values(worklogs || {})) {
      for (const wl of dayWls) {
        map[wl.issue] = (map[wl.issue] || 0) + wl.seconds;
      }
    }
    return map;
  }, [worklogs]);

  const [tf, stf] = useState<string[]>([]);
  const [sr, ssr] = useState("");
  const [so, sso] = useState({key:"key",dir:"asc"});

  const filteredIssues = useMemo(()=>{
    let l=issues;
    if(filters.spaceKeys.length)l=l.filter(i=>filters.spaceKeys.includes(i.project));
    if(tf.length)l=l.filter(i=>tf.includes(i.type));
    if(sr){const q=sr.toLowerCase();l=l.filter(i=>i.key.toLowerCase().includes(q)||i.summary.toLowerCase().includes(q)||(i.assignee||"").toLowerCase().includes(q));}
    return[...l].sort((a,b)=>{const d=so.dir==="asc"?1:-1;if(so.key==="hours")return((a.hours||0)-(b.hours||0))*d;return(a[so.key]??"").localeCompare(b[so.key]??"")*d;});
  },[issues,filters,tf,sr,so]);

  const ts=(k: string)=>sso(s=>s.key===k?{...s,dir:s.dir==="asc"?"desc":"asc"}:{key:k,dir:"asc"});
  const A=({k}: {k: string})=>so.key!==k?<span style={{fontSize:9,color:"var(--tx3)"}}>⇅</span>:<span style={{fontSize:9,color:"var(--ac2)"}}>{so.dir==="asc"?"↑":"↓"}</span>;
  const pc=(p: string)=>p==="Critical"?"p-crit":p==="High"?"p-high":p==="Medium"?"p-med":"p-low";
  const pt=[...new Set(issues.map(i=>i.type))];

  const sc = (s: string) => {
    const sl = (s||'').toLowerCase();
    if (sl.includes('done') || sl.includes('cerrad') || sl.includes('complet') || sl.includes('resuelto')) return 's-done';
    if (sl.includes('progress') || sl.includes('curso') || sl.includes('proceso') || sl.includes('review') || sl.includes('testing')) return 's-prog';
    return 's-todo';
  };

  return(
    <div>
      <div className="tk-h">
        <div className="tk-t">{t("nav.tasks")}</div>
        <div className="c-bdg">{filteredIssues.length}/{issues.length}</div>
        <button className="btn-log" style={{marginLeft:"auto"}} onClick={()=>onOpenLog({})}>{t("jiraTracker.logHours")}</button>
      </div>
      <div className="f-row">
        <input className="fi" style={{maxWidth:220}} type="search" placeholder={t("jiraTracker.searchPlaceholder")} value={sr} onChange={e=>ssr(e.target.value)}/>
        {pt.map(ty=><button key={ty} className={`pill ${tf.includes(ty)?"on":""}`} onClick={()=>stf(f=>f.includes(ty)?f.filter(x=>x!==ty):[...f,ty])}>{ty}</button>)}
        {tf.length>0&&<button className="btn-g" onClick={()=>stf([])}>{t("jiraTracker.clearFilter")}</button>}
      </div>
      {filteredIssues.length===0&&<div className="empty"><div className="empty-i">🔍</div><div>{t("common.noResults")}</div></div>}
      {filteredIssues.length>0&&<div style={{overflowX:"auto"}}><table><thead><tr>
        <th onClick={()=>ts("key")}>{t("jiraTracker.colKey")} <A k="key"/></th>
        <th onClick={()=>ts("summary")}>{t("jiraTracker.colSummary")} <A k="summary"/></th>
        <th>{t("jiraTracker.colType")}</th>
        <th onClick={()=>ts("status")}>{t("jiraTracker.colStatus")} <A k="status"/></th>
        <th onClick={()=>ts("priority")}>{t("jiraTracker.colPriority")} <A k="priority"/></th>
        <th>{t("jiraTracker.colProject")}</th>
        <th>{t("jiraTracker.colAssignee")}</th>
        <th>{t("jiraTracker.colEpic")}</th>
        <th title="Horas imputadas en WorkSuite">{t("jiraTracker.colTime")}</th>
        <th>{t("jiraTracker.colAction")}</th>
      </tr></thead><tbody>{filteredIssues.map((i,idx)=>{
        return <tr key={i.key||idx}>
          <td><span className="ik">{i.key}</span></td>
          <td><div className="ism">{i.summary}</div><div style={{marginTop:2}}>{(i.labels||[]).slice(0,3).map(l=><span key={l} className="tag">{l}</span>)}</div></td>
          <td><span className="t-pill">{i.type}</span></td>
          <td><span className={`s-b ${sc(i.status)}`}>{i.status}</span></td>
          <td><span className={pc(i.priority)}>{i.priority}</span></td>
          <td><span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--tx3)"}}>{i.project}</span></td>
          <td style={{fontSize:11}}>{i.assignee}</td>
          <td><span className="er">{i.epic}</span></td>
          <td className="hc">{hoursByIssue[i.key] ? TimeParser.format(hoursByIssue[i.key]) : "—"}</td>
          <td><button className="btn-log btn-log-sm" onClick={()=>onOpenLog({issueKey:i.key})}>{t("jiraTracker.btnHours")}</button></td>
        </tr>;
      })}</tbody></table></div>}
    </div>
  );
}
