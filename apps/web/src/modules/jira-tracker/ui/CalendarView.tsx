import React, { useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { WorklogService } from '../domain/services/WorklogService';
import { TimeParser } from '../domain/services/TimeParser';
import { TODAY, MONTHS_EN, MONTHS_ES, DAYS_EN, DAYS_ES } from '@/shared/lib/constants';
import { daysInMonth } from '@/shared/lib/utils';

type ViewMode = 'month' | 'week';

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

/** Returns the Monday of the week containing the given date. */
function getMonday(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Build 7 cells (Mon–Sun) for the week containing `anchor`. */
function buildWeekGrid(anchor: string) {
  const mon = getMonday(anchor);
  const cells: any[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    cells.push({ date: iso, day: d.getDate(), month: d.getMonth(), year: d.getFullYear(), isToday: iso === TODAY });
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
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [weekAnchor, setWeekAnchor] = useState(TODAY);

  const mFrom = `${yr}-${String(mo+1).padStart(2,"0")}-01`;
  const mTo   = `${yr}-${String(mo+1).padStart(2,"0")}-${daysInMonth(yr,mo)}`;
  const rWls  = WorklogService.filterByRange(worklogs, mFrom, mTo, filters.authorId||null);
  const aWls  = Object.values(rWls).flat();
  const totalH = TimeParser.toHours(aWls.reduce((s,w)=>s+w.seconds,0));
  const actD   = Object.keys(rWls).length;
  const cells  = buildCalGrid(yr, mo);
  const DAYS   = lang==="es" ? DAYS_ES : DAYS_EN;
  const MONTHS = lang==="es" ? MONTHS_ES : MONTHS_EN;

  const prev = () => {
    if (viewMode === 'week') {
      const mon = getMonday(weekAnchor);
      mon.setDate(mon.getDate() - 7);
      setWeekAnchor(mon.toISOString().slice(0, 10));
    } else {
      mo===0?(sMo(11),sYr(y=>y-1)):sMo(m=>m-1);
    }
  };
  const next = () => {
    if (viewMode === 'week') {
      const mon = getMonday(weekAnchor);
      mon.setDate(mon.getDate() + 7);
      setWeekAnchor(mon.toISOString().slice(0, 10));
    } else {
      mo===11?(sMo(0),sYr(y=>y+1)):sMo(m=>m+1);
    }
  };

  const goToday = () => {
    sYr(new Date().getFullYear());
    sMo(new Date().getMonth());
    setWeekAnchor(TODAY);
  };

  // Week view data
  const weekCells = buildWeekGrid(weekAnchor);
  const weekFrom = weekCells[0]?.date ?? '';
  const weekTo = weekCells[6]?.date ?? '';
  const wWls = WorklogService.filterByRange(worklogs, weekFrom, weekTo, filters.authorId || null);
  const wAWls = Object.values(wWls).flat();
  const weekTotalH = TimeParser.toHours(wAWls.reduce((s, w) => s + w.seconds, 0));
  const weekActD = Object.keys(wWls).length;

  // Week header label
  const weekLabel = (() => {
    if (!weekCells.length) return '';
    const mon = weekCells[0];
    const sun = weekCells[6];
    const mName = MONTHS[mon.month];
    if (mon.month === sun.month) {
      return `${mon.day}–${sun.day} ${mName} ${mon.year}`;
    }
    const sName = MONTHS[sun.month];
    return `${mon.day} ${mName} – ${sun.day} ${sName} ${sun.year}`;
  })();

  // Full day names for week view headers
  const DAYS_FULL_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const DAYS_FULL_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const DAYS_FULL = lang === 'es' ? DAYS_FULL_ES : DAYS_FULL_EN;

  return (
    <div>
      <div className="cal-h">
        <button className="n-arr" onClick={prev}>‹</button>
        <div className="cal-t">{viewMode === 'month' ? `${MONTHS[mo]} ${yr}` : weekLabel}</div>
        <button className="n-arr" onClick={next}>›</button>
        <button className="btn-g" onClick={goToday}>{t("jiraTracker.today")}</button>

        {/* View mode toggle */}
        <div style={{ display: 'flex', background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 6, padding: 2, gap: 2 }}>
          <button
            className={viewMode === 'month' ? 'btn-g active' : 'btn-g'}
            style={{
              padding: '4px 12px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer',
              background: viewMode === 'month' ? 'var(--ac)' : 'transparent',
              color: viewMode === 'month' ? '#000' : 'var(--tx3)',
              fontWeight: viewMode === 'month' ? 600 : 400,
              fontFamily: 'inherit',
            }}
            onClick={() => setViewMode('month')}
          >
            {t("jiraTracker.month")}
          </button>
          <button
            className={viewMode === 'week' ? 'btn-g active' : 'btn-g'}
            style={{
              padding: '4px 12px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer',
              background: viewMode === 'week' ? 'var(--ac)' : 'transparent',
              color: viewMode === 'week' ? '#000' : 'var(--tx3)',
              fontWeight: viewMode === 'week' ? 600 : 400,
              fontFamily: 'inherit',
            }}
            onClick={() => { setViewMode('week'); setWeekAnchor(sel || TODAY); }}
          >
            {t("jiraTracker.week")}
          </button>
        </div>

        <button className="btn-log" onClick={()=>onOpenLog({})}>{t("jiraTracker.logHours")}</button>
        <div className="cal-stats">
          <div className="chip">{t("jiraTracker.totalLabel")}: <strong>{(viewMode === 'week' ? weekTotalH : totalH).toFixed(1)}h</strong></div>
          <div className="chip">{t("jiraTracker.activeDays")}: <strong>{viewMode === 'week' ? weekActD : actD}</strong></div>
          {(viewMode === 'week' ? weekActD : actD)>0&&<div className="chip">{t("jiraTracker.avgLabel")}: <strong>{((viewMode === 'week' ? weekTotalH / weekActD : totalH / actD)).toFixed(1)}{t("jiraTracker.perDay")}</strong></div>}
        </div>
      </div>

      {/* ── Month view ──────────────────────────────────── */}
      {viewMode === 'month' && (
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
      )}

      {/* ── Week view ───────────────────────────────────── */}
      {viewMode === 'week' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {weekCells.map((c, i) => {
            const dw = wWls[c.date] || [];
            const sec = dw.reduce((s: number, w: any) => s + w.seconds, 0);
            const hrs = TimeParser.toHours(sec);
            // Group worklogs by issue
            const byIssue = new Map<string, { key: string; summary: string; seconds: number }>();
            for (const w of dw) {
              const existing = byIssue.get(w.issue);
              if (existing) {
                existing.seconds += w.seconds;
              } else {
                byIssue.set(w.issue, { key: w.issue, summary: w.issueSummary || w.summary || '', seconds: w.seconds });
              }
            }
            const issues = [...byIssue.values()];

            return (
              <div
                key={c.date}
                onClick={() => { sSel(c.date); onDayClick(c.date); }}
                style={{
                  background: 'var(--sf)',
                  border: `1px solid ${c.isToday ? 'var(--ac)' : 'var(--bd)'}`,
                  borderRadius: 'var(--r)',
                  padding: 12,
                  cursor: 'pointer',
                  minHeight: 220,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  transition: 'border-color .15s',
                }}
              >
                {/* Day header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      {DAYS_FULL[i]}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: c.isToday ? 'var(--ac)' : 'var(--tx)', lineHeight: 1.2 }}>
                      {c.day}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {hrs > 0 && (
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ac)', fontFamily: 'monospace' }}>
                        {hrs.toFixed(1)}h
                      </span>
                    )}
                    <div
                      onClick={e => { e.stopPropagation(); onOpenLog({ date: c.date }); }}
                      style={{
                        width: 24, height: 24, borderRadius: 4,
                        background: 'var(--bd)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 14, color: 'var(--tx3)',
                        cursor: 'pointer',
                      }}
                    >
                      +
                    </div>
                  </div>
                </div>

                {/* Task list */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {issues.map(iss => (
                    <div
                      key={iss.key}
                      style={{
                        background: 'var(--bg)',
                        border: '1px solid var(--bd)',
                        borderLeft: '3px solid var(--ac)',
                        borderRadius: 4,
                        padding: '6px 8px',
                        fontSize: 11,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: 'var(--ac)', fontWeight: 700, fontSize: 10, flexShrink: 0 }}>{iss.key}</span>
                        <span style={{ color: 'var(--tx3)', fontSize: 10, fontWeight: 600, fontFamily: 'monospace', flexShrink: 0 }}>
                          {TimeParser.toHours(iss.seconds).toFixed(1)}h
                        </span>
                      </div>
                      <div style={{ color: 'var(--tx2)', fontSize: 10, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {iss.summary}
                      </div>
                    </div>
                  ))}
                  {issues.length === 0 && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 10, opacity: .5 }}>
                      —
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
