import { useState, useEffect, useRef, useCallback, type CSSProperties, type ReactNode } from 'react';

// ─── Date helpers ─────────────────────────────────────────────────────────────

const today = new Date();
const fmt = (d: Date | string): string =>
  (d instanceof Date ? d : new Date(d + 'T00:00:00')).toISOString().slice(0, 10);
const addD = (iso: string, n: number): string => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return fmt(d);
};
const diffD = (a: string, b: string): number =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 864e5);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GanttBar {
  id: string;
  label: string;
  startDate: string;      // ISO date
  endDate: string;        // ISO date
  color: string;          // bar border/text color
  bgColor: string;        // bar background
  status?: string;
  meta?: string;          // secondary text (e.g. "3d · 5 tickets")
  groupId?: string;       // for visual grouping
}

export interface GanttGroup {
  id: string;
  label: string;
  color: string;          // group frame color
  barIds: string[];       // bars in this group
}

export type GanttZoom = 'days' | 'weeks' | 'months';

export interface GanttTimelineProps {
  bars: GanttBar[];
  groups?: GanttGroup[];
  zoom?: GanttZoom;
  onZoomChange?: (z: GanttZoom) => void;
  onBarMove?: (id: string, startDate: string, endDate: string) => void;
  onBarClick?: (id: string) => void;
  labelWidth?: number;
  style?: CSSProperties;
  zoomLabels?: [string, string, string]; // [days, weeks, months]
}

// ─── Mark generator ───────────────────────────────────────────────────────────

interface Mark { date: string; label: string; sub?: string; isWeekend?: boolean }

const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function generateMarks(startDate: string, totalDays: number, zoom: GanttZoom): Mark[] {
  const marks: Mark[] = [];
  if (zoom === 'days') {
    const d = new Date(startDate + 'T00:00:00');
    for (let i = 0; i < totalDays; i++) {
      const iso = fmt(d);
      const dow = d.getDay();
      marks.push({ date: iso, label: DAYS_SHORT[dow]!, sub: String(d.getDate()), isWeekend: dow === 0 || dow === 6 });
      d.setDate(d.getDate() + 1);
    }
  } else if (zoom === 'weeks') {
    const d = new Date(startDate + 'T00:00:00');
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    const end = addD(startDate, totalDays);
    while (fmt(d) < end) {
      marks.push({ date: fmt(d), label: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` });
      d.setDate(d.getDate() + 7);
    }
  } else {
    const d = new Date(startDate + 'T00:00:00');
    d.setDate(1);
    if (d < new Date(startDate + 'T00:00:00')) d.setMonth(d.getMonth() + 1);
    const end = addD(startDate, totalDays);
    while (fmt(d) < end) {
      marks.push({ date: fmt(d), label: `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}` });
      d.setMonth(d.getMonth() + 1);
    }
  }
  return marks;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GanttTimeline({
  bars,
  groups = [],
  zoom: zoomProp,
  onZoomChange,
  onBarMove,
  onBarClick,
  labelWidth = 260,
  style = {},
  zoomLabels = ['Días', 'Semanas', 'Meses'],
}: GanttTimelineProps) {
  const [internalZoom, setInternalZoom] = useState<GanttZoom>('weeks');
  const zoom = zoomProp ?? internalZoom;
  const setZoom = onZoomChange ?? setInternalZoom;

  const [drag, setDrag] = useState<{
    barId: string; type: 'move' | 'left' | 'right'; startX: number; origStart: string; origEnd: string;
  } | null>(null);

  const DAY_W = { days: 44, weeks: 16, months: 4 }[zoom];
  const LABEL_W = labelWidth;

  // Compute date range
  const allDates = bars.flatMap(b => [b.startDate, b.endDate]).filter(Boolean).sort();
  const minDate = allDates[0] || fmt(today);
  const maxDate = allDates[allDates.length - 1] || addD(fmt(today), 30);
  const startDate = addD(minDate, -7);
  const totalDays = Math.max(diffD(startDate, maxDate) + 21, 30);
  const totalW = LABEL_W + totalDays * DAY_W;

  const dateToX = (iso: string) => LABEL_W + diffD(startDate, iso) * DAY_W;
  const xToDate = (x: number) => addD(startDate, Math.round((x - LABEL_W) / DAY_W));
  const todayX = dateToX(fmt(today));

  const marks = generateMarks(startDate, totalDays, zoom);

  // Drag handlers
  const handleMD = useCallback((e: React.MouseEvent, barId: string, type: 'move' | 'left' | 'right') => {
    e.preventDefault();
    const bar = bars.find(b => b.id === barId);
    if (!bar) return;
    setDrag({ barId, type, startX: e.clientX, origStart: bar.startDate, origEnd: bar.endDate });
  }, [bars]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const daysDx = Math.round((e.clientX - drag.startX) / DAY_W);
      if (!daysDx || !onBarMove) return;
      if (drag.type === 'move') {
        onBarMove(drag.barId, addD(drag.origStart, daysDx), addD(drag.origEnd, daysDx));
      } else if (drag.type === 'left') {
        const s = addD(drag.origStart, daysDx);
        if (diffD(s, drag.origEnd) >= 1) onBarMove(drag.barId, s, drag.origEnd);
      } else {
        const e2 = addD(drag.origEnd, daysDx);
        if (diffD(drag.origStart, e2) >= 1) onBarMove(drag.barId, drag.origStart, e2);
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [drag, DAY_W, onBarMove]);

  // Order bars: group members together
  const orderedBars = (() => {
    if (!groups.length) return bars;
    const grouped: GanttBar[] = [];
    const used = new Set<string>();
    groups.forEach(g => {
      const members = bars.filter(b => g.barIds.includes(b.id));
      members.forEach(b => { if (!used.has(b.id)) { grouped.push(b); used.add(b.id); } });
    });
    bars.forEach(b => { if (!used.has(b.id)) grouped.push(b); });
    return grouped;
  })();

  // Group frame positions
  const groupFrames = groups.map(g => {
    const memberBars = orderedBars.filter(b => g.barIds.includes(b.id));
    if (memberBars.length < 2) return null;
    const firstIdx = orderedBars.findIndex(b => g.barIds.includes(b.id));
    const lastIdx = orderedBars.length - 1 - [...orderedBars].reverse().findIndex(b => g.barIds.includes(b.id));
    return { ...g, firstIdx, lastIdx, count: memberBars.length };
  }).filter(Boolean) as (GanttGroup & { firstIdx: number; lastIdx: number; count: number })[];

  const ROW_H = 76;
  /* Vertical breathing room between the sticky date header and the first
   * row, so group-frame badges (positioned at top:-10 of the frame, like a
   * chip on a fieldset) don't get clipped by the header's sticky layer. */
  const CHART_TOP_PADDING = 14;
  const HEADER_H = zoom === 'days' ? 44 : 36;

  return (
    <div style={style}>
      {/* Zoom selector */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 'var(--fs-sm)', color: 'var(--dp-tx, var(--tx))', fontWeight: 700 }}>Timeline</h2>
        <div style={{ display: 'flex', background: 'var(--dp-sf, var(--sf))', border: '1px solid var(--dp-bd, var(--bd))', borderRadius: 6, overflow: 'hidden', marginLeft: 8 }}>
          {(['days', 'weeks', 'months'] as GanttZoom[]).map((z, i) => (
            <button key={z} onClick={() => setZoom(z)}
              style={{ background: zoom === z ? '#1d4ed8' : 'transparent', color: zoom === z ? '#fff' : 'var(--dp-tx3, var(--tx3))', border: 'none', padding: '5px 12px', fontSize: 'var(--fs-2xs)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: zoom === z ? 700 : 400, transition: 'all .15s' }}>
              {zoomLabels[i]}
            </button>
          ))}
        </div>
      </div>

      {/* Gantt chart */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--dp-bd, var(--bd))', borderRadius: 8 }}>
        <div style={{ width: Math.max(totalW, 600), minWidth: '100%', position: 'relative', background: 'var(--dp-sf, var(--sf))' }}>

          {/* Date header */}
          <div style={{ display: 'flex', height: zoom === 'days' ? 44 : 36, borderBottom: '1px solid var(--dp-bd, var(--bd))', position: 'sticky', top: 0, zIndex: 5, background: 'var(--dp-sf, var(--sf))' }}>
            <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid var(--dp-bd, var(--bd))', display: 'flex', alignItems: 'center', paddingLeft: 14 }}>
              <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 600, color: 'var(--dp-tx3, var(--tx3))', letterSpacing: '.06em', textTransform: 'uppercase' as const }}>
                {zoom === 'days' ? 'Día' : zoom === 'weeks' ? 'Semana' : 'Mes'}
              </span>
            </div>
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              {marks.map(m => {
                const x = dateToX(m.date) - LABEL_W;
                const isTodayMark = zoom === 'days' ? m.date === fmt(today) : zoom === 'weeks' ? m.date <= fmt(today) && addD(m.date, 7) > fmt(today) : m.date.slice(0, 7) === fmt(today).slice(0, 7);
                return (
                  <div key={m.date} style={{ position: 'absolute', left: x, top: 0, height: '100%', borderLeft: `1px solid ${isTodayMark ? '#f59e0b' : 'var(--dp-bd, var(--bd))'}`, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingLeft: 4, justifyContent: 'center', minWidth: 1 }}>
                    <span style={{ fontSize: zoom === 'days' ? 10 : 9, color: isTodayMark ? '#f59e0b' : 'var(--dp-tx3, var(--tx3))', fontWeight: isTodayMark ? 700 : 400, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{m.label}</span>
                    {zoom === 'days' && <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: isTodayMark ? '#f59e0b' : m.isWeekend ? 'var(--dp-tx3, var(--tx3))' : 'var(--dp-tx2, var(--tx2))', lineHeight: 1 }}>{m.sub}</span>}
                  </div>
                );
              })}
              <div style={{ position: 'absolute', left: todayX - LABEL_W, top: 0, height: '100%', borderLeft: '1px dashed #f59e0b', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Spacer so the first group's badge has room above row 0 */}
          <div style={{ height: CHART_TOP_PADDING }} />

          {/* Group frames (behind rows) */}
          {groupFrames.map(g => (
            <div key={g.id} style={{
              position: 'absolute', left: 0, top: HEADER_H + CHART_TOP_PADDING + g.firstIdx * ROW_H - 2,
              width: '100%', height: (g.lastIdx - g.firstIdx + 1) * ROW_H + 4,
              border: `2px solid ${g.color}`, borderRadius: 6,
              background: `${g.color}08`, pointerEvents: 'none', zIndex: 1,
            }}>
              <span style={{ position: 'absolute', top: -10, left: 14, fontSize: 'var(--fs-2xs)', fontWeight: 700, color: g.color, background: 'var(--dp-sf, var(--sf))', padding: '0 6px', letterSpacing: '.05em', textTransform: 'uppercase' as const, zIndex: 3 }}>{g.label}</span>
            </div>
          ))}

          {/* Rows */}
          {orderedBars.map((bar, idx) => {
            const hasDates = bar.startDate && bar.endDate;
            const x1 = hasDates ? dateToX(bar.startDate) : 0;
            const x2 = hasDates ? dateToX(bar.endDate) : 0;
            const barW = Math.max(x2 - x1, 50);

            return (
              <div key={bar.id} style={{ display: 'flex', height: ROW_H, borderBottom: '1px solid var(--dp-bd, var(--bd))', alignItems: 'center', position: 'relative', zIndex: 2 }}>
                {/* Label */}
                <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid var(--dp-bd, var(--bd))', padding: '0 14px', cursor: onBarClick ? 'pointer' : 'default' }}
                  onClick={() => onBarClick?.(bar.id)}>
                  <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--dp-tx, var(--tx))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bar.label}</div>
                  <div style={{ fontSize: 'var(--fs-2xs)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span style={{ color: bar.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{bar.status || ''}</span>
                    {bar.meta && <span style={{ color: 'var(--dp-tx3, var(--tx3))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bar.meta}</span>}
                  </div>
                </div>

                {/* Chart area */}
                <div style={{ flex: 1, position: 'relative', height: '100%' }}>
                  {/* Weekend shading */}
                  {zoom === 'days' && marks.filter(m => m.isWeekend).map(m => (
                    <div key={m.date} style={{ position: 'absolute', left: dateToX(m.date) - LABEL_W, top: 0, width: DAY_W, height: '100%', background: 'rgba(0,0,0,.15)', pointerEvents: 'none' }} />
                  ))}
                  {/* Today line */}
                  <div style={{ position: 'absolute', left: todayX - LABEL_W, top: 0, height: '100%', borderLeft: '1px dashed rgba(245,158,11,.3)', pointerEvents: 'none' }} />

                  {hasDates && (
                    <div style={{ position: 'absolute', left: x1 - LABEL_W, top: '50%', transform: 'translateY(-50%)', width: barW, height: 28, background: bar.bgColor, border: `1px solid ${bar.color}`, borderRadius: 4, cursor: drag?.barId === bar.id && drag.type === 'move' ? 'grabbing' : 'grab', display: 'flex', alignItems: 'center', userSelect: 'none', overflow: 'hidden' }}
                      onMouseDown={e => handleMD(e, bar.id, 'move')}
                      onClick={() => onBarClick?.(bar.id)}>
                      {/* Left resize handle */}
                      <div style={{ width: 5, height: '100%', cursor: 'col-resize', flexShrink: 0, background: `${bar.color}40` }}
                        onMouseDown={e => { e.stopPropagation(); handleMD(e, bar.id, 'left'); }} />
                      {/* Label */}
                      <div style={{ flex: 1, padding: '0 5px', fontSize: 'var(--fs-2xs)', color: bar.color, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {bar.startDate} → {bar.endDate}
                      </div>
                      {/* Right resize handle */}
                      <div style={{ width: 5, height: '100%', cursor: 'col-resize', flexShrink: 0, background: `${bar.color}40` }}
                        onMouseDown={e => { e.stopPropagation(); handleMD(e, bar.id, 'right'); }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3, var(--tx3))', marginTop: 8, display: 'flex', gap: 12 }}>
        <span>⟺ Arrastra para mover</span><span>·</span><span>Extremos para redimensionar</span><span>·</span><span>Clic para abrir detalle</span>
      </div>
    </div>
  );
}
