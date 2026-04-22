import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { WorklogService } from '../domain/services/WorklogService';
import { TimeParser } from '../domain/services/TimeParser';
import { TODAY, MONTHS_EN, MONTHS_ES, DAYS_EN, DAYS_ES } from '@/shared/lib/constants';
import { daysInMonth } from '@/shared/lib/utils';

/* ─── Types ────────────────────────────────────────────────────────────── */

type ViewMode = 'month' | 'week';

/* ─── Pure helpers (unchanged logic) ───────────────��───────────────────── */

function buildCalGrid(year: number, month: number) {
  const first = new Date(year, month, 1), last = new Date(year, month + 1, 0);
  const so = (first.getDay() + 6) % 7, eo = (7 - last.getDay()) % 7;
  const cells: any[] = [];
  for (let i = -so; i <= last.getDate() - 1 + eo; i++) {
    const d = new Date(year, month, 1 + i);
    cells.push({ date: d.toISOString().slice(0, 10), day: d.getDate(), isCurrentMonth: d.getMonth() === month, isToday: d.toISOString().slice(0, 10) === TODAY });
  }
  return cells;
}

function getMonday(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

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

/* ─── Icon helper ──────────────��───────────────────────────────────────── */

function Icon({ name, size = 20, weight = 300, style }: {
  name: string; size?: number; weight?: number; style?: React.CSSProperties;
}) {
  return (
    <span className="material-symbols-outlined" style={{
      fontSize: size, fontVariationSettings: `'wght' ${weight}`,
      lineHeight: 1, ...style,
    }}>{name}</span>
  );
}

/* ─── Scoped styles ─────────────��──────────────────────────────────────── */

const CAL_CSS = `
.cal-cell{transition:border-color .15s ease,background .15s ease}
.cal-cell:hover{background:var(--sf2)}
.cal-wk-col{transition:border-color .15s ease,background .15s ease}
.cal-wk-col:hover{background:var(--sf2)}
`;

/* ═══════════════════════════════════════════════════════════════════════ */
/*  CalendarView                                                          */
/* ═════════════════════��═════════════════════════════════════════════════ */

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

  // ── Month data ──────────────────────────────────────────────────────
  const mFrom = `${yr}-${String(mo + 1).padStart(2, '0')}-01`;
  const mTo = `${yr}-${String(mo + 1).padStart(2, '0')}-${daysInMonth(yr, mo)}`;
  const rWls = WorklogService.filterByRange(worklogs, mFrom, mTo, filters.authorId || null);
  const aWls = Object.values(rWls).flat();
  const totalH = TimeParser.toHours(aWls.reduce((s, w) => s + w.seconds, 0));
  const actD = Object.keys(rWls).length;
  const uniqueTasks = new Set(aWls.map(w => w.issue)).size;
  const cells = buildCalGrid(yr, mo);
  const DAYS = lang === 'es' ? DAYS_ES : DAYS_EN;
  const MONTHS = lang === 'es' ? MONTHS_ES : MONTHS_EN;

  // ── Week data ─────────────���─────────────────────��───────────────────
  const weekCells = buildWeekGrid(weekAnchor);
  const weekFrom = weekCells[0]?.date ?? '';
  const weekTo = weekCells[6]?.date ?? '';
  const wWls = WorklogService.filterByRange(worklogs, weekFrom, weekTo, filters.authorId || null);
  const wAWls = Object.values(wWls).flat();
  const weekTotalH = TimeParser.toHours(wAWls.reduce((s, w) => s + w.seconds, 0));
  const weekActD = Object.keys(wWls).length;
  const weekUniqueTasks = new Set(wAWls.map(w => w.issue)).size;

  const weekLabel = useMemo(() => {
    if (!weekCells.length) return '';
    const mon = weekCells[0];
    const sun = weekCells[6];
    const mName = MONTHS[mon.month];
    if (mon.month === sun.month) return `${mon.day}–${sun.day} ${mName} ${mon.year}`;
    const sName = MONTHS[sun.month];
    return `${mon.day} ${mName} – ${sun.day} ${sName} ${sun.year}`;
  }, [weekCells, MONTHS]);

  const DAYS_FULL = [
    t('jiraTracker.dayMonday'), t('jiraTracker.dayTuesday'), t('jiraTracker.dayWednesday'),
    t('jiraTracker.dayThursday'), t('jiraTracker.dayFriday'), t('jiraTracker.daySaturday'),
    t('jiraTracker.daySunday'),
  ];

  // ── Navigation ──────────────────────────────────────────────────────
  const prev = () => {
    if (viewMode === 'week') {
      const mon = getMonday(weekAnchor);
      mon.setDate(mon.getDate() - 7);
      setWeekAnchor(mon.toISOString().slice(0, 10));
    } else {
      mo === 0 ? (sMo(11), sYr(y => y - 1)) : sMo(m => m - 1);
    }
  };
  const next = () => {
    if (viewMode === 'week') {
      const mon = getMonday(weekAnchor);
      mon.setDate(mon.getDate() + 7);
      setWeekAnchor(mon.toISOString().slice(0, 10));
    } else {
      mo === 11 ? (sMo(0), sYr(y => y + 1)) : sMo(m => m + 1);
    }
  };
  const goToday = () => {
    sYr(new Date().getFullYear());
    sMo(new Date().getMonth());
    setWeekAnchor(TODAY);
  };

  // ── Drag-and-drop ──��────────────────────────────────��──────────────
  const [dragOver, setDragOver] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent, date: string) => {
    if (e.dataTransfer.types.includes('application/jira-issue')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDragOver(date);
    }
  }, []);
  const handleDragLeave = useCallback(() => { setDragOver(null); }, []);
  const handleDrop = useCallback((e: React.DragEvent, date: string) => {
    e.preventDefault();
    setDragOver(null);
    const raw = e.dataTransfer.getData('application/jira-issue');
    if (!raw) return;
    try {
      const { issueKey } = JSON.parse(raw);
      if (issueKey) onOpenLog({ date, issueKey });
    } catch {}
  }, [onOpenLog]);

  // ── Derived stats for current view ─────────────────────────────────
  const isWeek = viewMode === 'week';
  const sTotalH = isWeek ? weekTotalH : totalH;
  const sActD = isWeek ? weekActD : actD;
  const sUnique = isWeek ? weekUniqueTasks : uniqueTasks;
  const sAvg = sActD > 0 ? sTotalH / sActD : 0;

  /* ── Render ────────────────────────────────────────────────────���────── */

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <style>{CAL_CSS}</style>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Nav arrows */}
        <button onClick={prev} style={navBtnStyle}><Icon name="chevron_left" size={18} style={{ color: 'var(--tx2)' }} /></button>
        <button onClick={next} style={navBtnStyle}><Icon name="chevron_right" size={18} style={{ color: 'var(--tx2)' }} /></button>

        {/* Title */}
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)', letterSpacing: '-0.01em' }}>
          {isWeek ? weekLabel : `${MONTHS[mo]} ${yr}`}
        </span>

        {/* View toggle */}
        <div style={{
          display: 'flex', background: 'var(--sf)', border: '1px solid var(--bd)',
          borderRadius: 6, padding: 2, gap: 2,
        }}>
          {(['month', 'week'] as ViewMode[]).map(vm => (
            <button key={vm} onClick={() => { setViewMode(vm); if (vm === 'week') setWeekAnchor(sel || TODAY); }}
              style={{
                padding: '4px 14px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer',
                background: viewMode === vm ? 'var(--ac)' : 'transparent',
                color: viewMode === vm ? 'var(--ac-on)' : 'var(--tx3)',
                fontWeight: viewMode === vm ? 600 : 400, fontFamily: 'inherit',
                transition: 'all .15s ease',
              }}>
              {vm === 'month' ? t('jiraTracker.month') : t('jiraTracker.week')}
            </button>
          ))}
        </div>

        {/* Today button */}
        <button onClick={goToday} style={{
          padding: '5px 14px', borderRadius: 6, border: '1px solid var(--bd)',
          background: 'var(--sf2)', color: 'var(--tx2)', fontSize: 11, fontWeight: 500,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          {t('jiraTracker.today')}
        </button>

        {/* Log Hours button */}
        <button onClick={() => onOpenLog({})} style={{
          padding: '5px 14px', borderRadius: 6, border: 'none',
          background: 'var(--ac)', color: 'var(--ac-on)', fontSize: 11, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          {t('jiraTracker.logHours')}
        </button>
      </div>

      {/* ── Bento Stats ─────────────��─────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12 }}>
        <StatCard label={t('jiraTracker.totalHours', 'TOTAL HOURS')} value={`${sTotalH.toFixed(1)}h`} color="var(--ac)" icon="schedule" />
        <StatCard label={t('jiraTracker.activeDays', 'ACTIVE DAYS')} value={sActD} color="var(--green)" icon="event_available" />
        <StatCard label={t('jiraTracker.avgPerDay', 'AVG / DAY')} value={`${sAvg.toFixed(1)}h`} color="var(--amber)" icon="trending_up" />
        <StatCard label={t('jiraTracker.uniqueTasks', 'UNIQUE TASKS')} value={sUnique} color="var(--purple)" icon="task_alt" />
      </div>

      {/* ── Month Grid ────��───────────────────────────────────────── */}
      {viewMode === 'month' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minHeight: 0 }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
            {DAYS.map(d => (
              <div key={d} style={{
                textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--tx3)',
                letterSpacing: '0.05em', textTransform: 'uppercase', padding: '4px 0',
              }}>{d}</div>
            ))}
          </div>
          {/* Week rows */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '1fr',
            gap: 3, flex: 1, minHeight: 0,
          }}>
            {cells.map(c => {
              const dw = rWls[c.date] || [];
              const sec = dw.reduce((s: number, w: any) => s + w.seconds, 0);
              const hrs = TimeParser.toHours(sec);
              const top = [...new Set(dw.map((w: any) => w.issue))].slice(0, 2);
              const isToday = c.isToday;
              const isDragTarget = dragOver === c.date;

              return (
                <div
                  key={c.date}
                  className="cal-cell"
                  onClick={() => { sSel(c.date); onDayClick(c.date); }}
                  onDragOver={e => handleDragOver(e, c.date)}
                  onDragLeave={handleDragLeave}
                  onDrop={e => handleDrop(e, c.date)}
                  style={{
                    borderRadius: 5,
                    background: isDragTarget ? 'var(--sf2)' : (sec > 0 ? 'var(--sf2)' : 'var(--sf)'),
                    border: isToday
                      ? '1px solid var(--ac)'
                      : `1px solid ${isDragTarget ? 'var(--ac)' : 'var(--bd)'}`,
                    borderTopWidth: isToday ? 2 : 1,
                    padding: 6,
                    display: 'flex', flexDirection: 'column', gap: 2,
                    cursor: 'pointer', overflow: 'hidden',
                    opacity: c.isCurrentMonth ? 1 : 0.35,
                    boxShadow: isDragTarget ? '0 0 12px rgba(79,110,247,.15)' : 'none',
                  }}
                >
                  {/* Top: day number + add button */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: 11, fontWeight: isToday ? 700 : 500,
                      color: isToday ? 'var(--ac)' : 'var(--tx)',
                    }}>{c.day}</span>
                    <div
                      onClick={e => { e.stopPropagation(); onOpenLog({ date: c.date }); }}
                      style={{
                        width: 18, height: 18, borderRadius: 4, fontSize: 13,
                        color: 'var(--tx3)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', cursor: 'pointer', opacity: 0.5,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--ac)'; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--tx3)'; }}
                    >+</div>
                  </div>

                  {/* Hours */}
                  {hrs > 0 && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', lineHeight: 1 }}>
                      {hrs.toFixed(1)}<span style={{ fontSize: 9, fontWeight: 500 }}>h</span>
                    </div>
                  )}

                  {/* Issue pills */}
                  {top.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 'auto' }}>
                      {top.map(k => (
                        <div key={k} style={{
                          fontSize: 8, color: 'var(--ac2)', fontWeight: 600,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontFamily: 'var(--mono)',
                        }}>{k}</div>
                      ))}
                      {[...new Set(dw.map((w: any) => w.issue))].length > 2 && (
                        <span style={{ fontSize: 8, color: 'var(--tx3)' }}>
                          +{[...new Set(dw.map((w: any) => w.issue))].length - 2} {t('jiraTracker.more')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Week Grid ────���────────────────────────────────────────── */}
      {viewMode === 'week' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, flex: 1, minHeight: 0 }}>
          {weekCells.map((c, i) => {
            const dw = wWls[c.date] || [];
            const sec = dw.reduce((s: number, w: any) => s + w.seconds, 0);
            const hrs = TimeParser.toHours(sec);
            const byIssue = new Map<string, { key: string; summary: string; seconds: number }>();
            for (const w of dw) {
              const existing = byIssue.get(w.issue);
              if (existing) existing.seconds += w.seconds;
              else byIssue.set(w.issue, { key: w.issue, summary: w.issueSummary || w.summary || '', seconds: w.seconds });
            }
            const issues = [...byIssue.values()];
            const isDragTarget = dragOver === c.date;

            return (
              <div
                key={c.date}
                className="cal-wk-col"
                onClick={() => { sSel(c.date); onDayClick(c.date); }}
                onDragOver={e => handleDragOver(e, c.date)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, c.date)}
                style={{
                  background: isDragTarget ? 'var(--sf2)' : 'var(--sf)',
                  border: `1px solid ${isDragTarget || c.isToday ? 'var(--ac)' : 'var(--bd)'}`,
                  borderTopWidth: c.isToday ? 2 : 1,
                  borderRadius: 5, padding: 12, cursor: 'pointer',
                  minHeight: 220, display: 'flex', flexDirection: 'column', gap: 8,
                  boxShadow: isDragTarget ? '0 0 12px rgba(79,110,247,.15)' : 'none',
                }}
              >
                {/* Day header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--tx3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {DAYS_FULL[i]}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: c.isToday ? 'var(--ac)' : 'var(--tx)', lineHeight: 1.2 }}>
                      {c.day}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {hrs > 0 && (
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--mono)' }}>
                        {hrs.toFixed(1)}h
                      </span>
                    )}
                    <div
                      onClick={e => { e.stopPropagation(); onOpenLog({ date: c.date }); }}
                      style={{
                        width: 24, height: 24, borderRadius: 4,
                        background: 'var(--sf2)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 14, color: 'var(--tx3)', cursor: 'pointer',
                      }}
                    >+</div>
                  </div>
                </div>

                {/* Issue cards */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, overflow: 'auto' }}>
                  {issues.map(iss => (
                    <div key={iss.key} style={{
                      background: 'var(--bg)', borderLeft: '3px solid var(--ac)',
                      borderRadius: 4, padding: '6px 8px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: 'var(--ac2)', fontWeight: 700, fontSize: 10, fontFamily: 'var(--mono)' }}>{iss.key}</span>
                        <span style={{ color: 'var(--green)', fontSize: 10, fontWeight: 600, fontFamily: 'var(--mono)' }}>
                          {TimeParser.toHours(iss.seconds).toFixed(1)}h
                        </span>
                      </div>
                      <div style={{
                        color: 'var(--tx2)', fontSize: 10, marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{iss.summary}</div>
                    </div>
                  ))}
                  {issues.length === 0 && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 10, opacity: 0.5 }}>
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

/* ─── Stat card sub-component ──────────────────────────────────────────── */

function StatCard({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: string }) {
  return (
    <div style={{
      flex: 1, borderRadius: 8, background: 'var(--sf)',
      padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={14} weight={300} style={{ color, opacity: 0.7 }} />
        <span style={{
          fontSize: 9, fontWeight: 700, color: 'var(--tx3)',
          letterSpacing: '0.05em', textTransform: 'uppercase',
        }}>{label}</span>
      </div>
      <div style={{
        fontSize: 24, fontWeight: 600, color, letterSpacing: '-0.02em', lineHeight: 1,
      }}>{value}</div>
    </div>
  );
}

/* ─── Shared styles ────────────────────────────────────────────────────── */

const navBtnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6, border: '1px solid var(--bd)',
  background: 'var(--sf)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', padding: 0,
};
