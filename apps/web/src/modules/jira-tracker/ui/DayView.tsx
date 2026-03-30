// @ts-nocheck
import React from 'react';
import { useTranslation } from '@worksuite/i18n';
import { WorklogService } from '../domain/services/WorklogService';
import { TimeParser } from '../domain/services/TimeParser';
import { TODAY, MONTHS_EN, MONTHS_ES } from '@/shared/lib/constants';
import { MOCK_USERS } from '@/shared/lib/fallbackData';

function formatFullDate(iso: string, lang: string) {
  const d = new Date(iso+"T00:00:00");
  const ms = lang==="es" ? MONTHS_ES : MONTHS_EN;
  if (lang==="es") {
    const dn = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
    return `${dn[d.getDay()]}, ${d.getDate()} de ${ms[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`;
  }
  const dn = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  return `${dn[d.getDay()]}, ${ms[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

interface DayViewProps {
  date: string;
  filters: any;
  worklogs: Record<string, any[]>;
  onDateChange: (date: string) => void;
  onOpenLog: (opts: any) => void;
  onDeleteWorklog: (date: string, id: string) => void;
}

export function DayView({ date, filters, worklogs, onDateChange, onOpenLog, onDeleteWorklog }: DayViewProps) {
  const { t, locale } = useTranslation();
  const lang = locale;
  const af  = worklogs[date]||[];
  const fl  = filters.authorId ? af.filter(w=>w.authorId===filters.authorId) : af;
  const ts  = fl.reduce((s,w)=>s+w.seconds,0);
  const eps = WorklogService.groupByEpic(fl);
  const su  = MOCK_USERS.find(u=>u.id===filters.authorId);

  function addDays(iso: string,n: number){const d=new Date(iso+"T00:00:00");d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);}

  return (
    <div>
      <div className="dh">
        <div>
          <div className="dd">{formatFullDate(date, lang)}</div>
          <div className="dsub">{t("jiraTracker.totalLabel")}: <strong>{TimeParser.toHours(ts).toFixed(2)}h</strong>{" · "}{fl.length} {t("jiraTracker.worklogs")}{" · "}{[...new Set(fl.map(w=>w.issue))].length} {t("jiraTracker.tasksCount")}{su&&<span style={{color:"var(--ac2)",marginLeft:8}}>· {su.name}</span>}</div>
        </div>
        <div className="dn">
          <button className="n-arr" onClick={()=>onDateChange(addDays(date,-1))}>‹</button>
          <button className="btn-g" onClick={()=>onDateChange(TODAY)}>{t("jiraTracker.today")}</button>
          <button className="n-arr" onClick={()=>onDateChange(addDays(date,1))}>›</button>
          <button className="btn-log" onClick={()=>onOpenLog({date})}>{t("jiraTracker.logHours")}</button>
        </div>
      </div>
      {fl.length===0&&<div className="empty"><div className="empty-i">📭</div><div>{t("jiraTracker.noWorklogs")}</div><div style={{fontSize:11}}>{t("jiraTracker.noWorklogsSub")}</div><button className="btn-log" style={{marginTop:10}} onClick={()=>onOpenLog({date})}>{t("jiraTracker.logThisDay")}</button></div>}
      {eps.map(ep=>{
        const es=ep.items.reduce((s,w)=>s+w.seconds,0);
        return(<div key={ep.key} className="eb"><div className="eh"><span className="ek">{ep.key}</span><span className="en">{ep.name}</span><span className="ehrs">{TimeParser.toHours(es).toFixed(1)}h</span></div>
          {ep.items.map(w=><div key={w.id} className={`wlc ${w.isNew?"new":""}`}><div className="wlk">{w.issue}</div><div style={{flex:1,minWidth:0}}><div className="wls">{w.summary}</div></div><div className="wlr"><div className="wlt">{w.time}</div><div className="wlm">{w.started} · {w.author}</div></div><span className="t-pill">{w.type}</span><button className="del-wl" onClick={()=>onDeleteWorklog(date,w.id)}>×</button></div>)}
        </div>);
      })}
      {fl.length>0&&<div style={{marginTop:20}}><div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:"var(--tx3)",paddingBottom:8,borderBottom:"1px solid var(--bd)",marginBottom:10}}>{t("jiraTracker.summaryByTask")}</div><table><thead><tr><th>{t("jiraTracker.colKey")}</th><th>{t("jiraTracker.colSummary")}</th><th>{t("jiraTracker.colType")}</th><th>{t("jiraTracker.colTime")}</th></tr></thead><tbody>{[...new Set(fl.map(w=>w.issue))].map(k=>{const ws=fl.filter(w=>w.issue===k),sc=ws.reduce((s,w)=>s+w.seconds,0);return <tr key={k}><td><span className="ik">{k}</span></td><td><div className="ism">{ws[0].summary}</div></td><td><span className="t-pill">{ws[0].type}</span></td><td className="hc">{TimeParser.toHours(sc).toFixed(2)}h</td></tr>;})}</tbody></table></div>}
    </div>
  );
}
