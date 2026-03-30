// @ts-nocheck
import React, { useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { WorklogService } from '../domain/services/WorklogService';
import { TimeParser } from '../domain/services/TimeParser';
import { TODAY, MONTHS_EN, MONTHS_ES, DAYS_EN, DAYS_ES } from '@/shared/lib/constants';
import { daysInMonth } from '@/shared/lib/utils';

function buildCalGrid(year: number, month: number) {
  const first = new Date(year,month,1), last = new Date(year,month+1,0);
  const so = (first.getDay()+6)%7, eo = (7-last.getDay())%7;
  const cells: any[] = [];
  for (let i = -so; i <= last.getDate()-1+eo; i++) {
    const d = new Date(year,month,1+i);
    cells.push({ date:d.toISOString().slice(0,10), day:d.getDate(), isCurrentMonth:d.getMonth()===month, isToday:d.toISOString().slice(0,10)===TODAY });
  }
  return cells;
}

interface CalendarViewProps {
  filters: any;
  worklogs: Record<string, any[]>;
  onDayClick: (date: string) => void;
  onOpenLog: (opts: any) => void;
}

export function CalendarView({ filters, worklogs, onDayClick, onOpenLog }: CalendarViewProps) {
  const { t, locale } = useTranslation();
  const lang = locale;
  const [yr, sYr] = useState(new Date().getFullYear());
  const [mo, sMo] = useState(new Date().getMonth());
  const [sel, sSel] = useState(TODAY);

  const mFrom = `${yr}-${String(mo+1).padStart(2,"0")}-01`;
  const mTo   = `${yr}-${String(mo+1).padStart(2,"0")}-${daysInMonth(yr,mo)}`;
  const rWls  = WorklogService.filterByRange(worklogs, mFrom, mTo, filters.authorId||null);
  const aWls  = Object.values(rWls).flat();
  const totalH = TimeParser.toHours(aWls.reduce((s,w)=>s+w.seconds,0));
  const actD   = Object.keys(rWls).length;
  const cells  = buildCalGrid(yr, mo);
  const DAYS   = lang==="es" ? DAYS_ES : DAYS_EN;
  const MONTHS = lang==="es" ? MONTHS_ES : MONTHS_EN;

  const prev = ()=>mo===0?(sMo(11),sYr(y=>y-1)):sMo(m=>m-1);
  const next = ()=>mo===11?(sMo(0),sYr(y=>y+1)):sMo(m=>m+1);

  return (
    <div>
      <div className="cal-h">
        <button className="n-arr" onClick={prev}>‹</button>
        <div className="cal-t">{MONTHS[mo]} {yr}</div>
        <button className="n-arr" onClick={next}>›</button>
        <button className="btn-g" onClick={()=>{sYr(new Date().getFullYear());sMo(new Date().getMonth());}}>{t("jiraTracker.today")}</button>
        <button className="btn-log" onClick={()=>onOpenLog({})}>{t("jiraTracker.logHours")}</button>
        <div className="cal-stats">
          <div className="chip">{t("jiraTracker.totalLabel")}: <strong>{totalH.toFixed(1)}h</strong></div>
          <div className="chip">{t("jiraTracker.activeDays")}: <strong>{actD}</strong></div>
          {actD>0&&<div className="chip">{t("jiraTracker.avgLabel")}: <strong>{(totalH/actD).toFixed(1)}{t("jiraTracker.perDay")}</strong></div>}
        </div>
      </div>
      <div className="cgrid">
        {DAYS.map(d=><div key={d} className="cdh">{d}</div>)}
        {cells.map(c=>{
          const dw=rWls[c.date]||[], sec=dw.reduce((s,w)=>s+w.seconds,0), hrs=TimeParser.toHours(sec);
          const top=[...new Set(dw.map(w=>w.issue))].slice(0,2);
          return (
            <div key={c.date} className={["cc",!c.isCurrentMonth?"other":"",c.isToday?"today":"",sec>0?"has-d":"",sel===c.date?"active":""].filter(Boolean).join(" ")}
              onClick={()=>{sSel(c.date);onDayClick(c.date);}}>
              <div className="ctop">
                <div className="cday">{c.day}</div>
                <div className="cadd" onClick={e=>{e.stopPropagation();onOpenLog({date:c.date});}}>+</div>
              </div>
              {hrs>0&&<div className="chrs">{hrs.toFixed(1)}<span>h</span></div>}
              {top.length>0&&<div className="cdots">{top.map(k=><div key={k} className="cdot">{k}</div>)}{[...new Set(dw.map(w=>w.issue))].length>2&&<div style={{fontSize:9,color:"var(--tx3)"}}>+{[...new Set(dw.map(w=>w.issue))].length-2} {t("jiraTracker.more")}</div>}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
