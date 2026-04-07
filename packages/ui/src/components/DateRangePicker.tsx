import { useState, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DateRangePickerProps {
  /** ISO datetime string for range start (e.g. "2026-04-07T09:00"). */
  startValue: string;
  /** ISO datetime string for range end. */
  endValue: string;
  /** Called when start or end changes. */
  onChange: (start: string, end: string) => void;
  /** Max duration in hours. Days beyond this from start are disabled. 0 = no limit. */
  maxDurationHours?: number;
  /** Disable dates before this ISO date string. Defaults to today. */
  minDate?: string;
  /** Show time selectors below the calendar. Default true. */
  showTime?: boolean;
  /** Labels for i18n. */
  labels?: {
    start?: string;
    end?: string;
    time?: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS_ES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}
function firstDayOffset(y: number, m: number): number {
  return (new Date(y, m, 1).getDay() + 6) % 7; // Monday = 0
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DateRangePicker({
  startValue,
  endValue,
  onChange,
  maxDurationHours = 0,
  minDate,
  showTime = true,
  labels = {},
}: DateRangePickerProps) {
  const today = toDateStr(new Date());
  const effectiveMin = minDate ?? today;

  // Parse current values
  const startDate = startValue ? startValue.slice(0, 10) : '';
  const endDate = endValue ? endValue.slice(0, 10) : '';
  const startTime = startValue ? startValue.slice(11, 16) || '09:00' : '09:00';
  const endTime = endValue ? endValue.slice(11, 16) || '18:00' : '18:00';

  // Calendar month navigation
  const initMonth = startDate ? new Date(startDate + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState(initMonth.getFullYear());
  const [viewMonth, setViewMonth] = useState(initMonth.getMonth());

  // Selection phase: 'start' or 'end'
  const [phase, setPhase] = useState<'start' | 'end'>(startDate ? 'end' : 'start');
  // Hover date for range preview
  const [hover, setHover] = useState<string | null>(null);

  // Max end date based on start + maxDurationHours
  const maxEndDate = useMemo(() => {
    if (!maxDurationHours || !startDate) return '';
    const maxDays = Math.ceil(maxDurationHours / 24);
    return addDays(startDate, maxDays);
  }, [startDate, maxDurationHours]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const days = daysInMonth(viewYear, viewMonth);
  const offset = firstDayOffset(viewYear, viewMonth);

  const isDisabled = (iso: string): boolean => {
    if (iso < effectiveMin) return true;
    if (phase === 'end' && startDate && iso < startDate) return true;
    if (phase === 'end' && maxEndDate && iso > maxEndDate) return true;
    return false;
  };

  const isInRange = (iso: string): boolean => {
    if (!startDate) return false;
    const rangeEnd = phase === 'end' && hover ? hover : endDate;
    if (!rangeEnd) return false;
    return iso >= startDate && iso <= rangeEnd;
  };

  const handleDayClick = (iso: string) => {
    if (isDisabled(iso)) return;

    if (phase === 'start') {
      // Reset range — pick start
      onChange(`${iso}T${startTime}`, '');
      setPhase('end');
    } else {
      // Pick end
      if (iso < startDate) {
        // Clicked before start — restart
        onChange(`${iso}T${startTime}`, '');
        setPhase('end');
      } else {
        onChange(`${startDate}T${startTime}`, `${iso}T${endTime}`);
        setPhase('start');
      }
    }
  };

  const handleTimeChange = (which: 'start' | 'end', time: string) => {
    if (which === 'start') {
      onChange(`${startDate}T${time}`, endValue);
    } else {
      onChange(startValue, `${endDate}T${time}`);
    }
  };

  // Styles
  const navBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
    color: 'var(--tx3,#50506a)', padding: '4px 8px', borderRadius: 4,
    fontFamily: 'inherit',
  };
  const dayBase: React.CSSProperties = {
    width: 36, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, borderRadius: 6, cursor: 'pointer', transition: 'all .1s',
    fontFamily: 'inherit', border: 'none', background: 'transparent',
  };
  const timeInput: React.CSSProperties = {
    background: 'var(--sf2,#1b1b22)', border: '1px solid var(--bd,#2a2a38)',
    borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--tx,#e4e4ef)',
    fontFamily: 'inherit', outline: 'none', width: '100%',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Phase indicator */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{
          flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: phase === 'start' ? 'rgba(79,110,247,.12)' : 'var(--sf2,#1b1b22)',
          border: `1px solid ${phase === 'start' ? '#4f6ef7' : startDate ? 'rgba(34,197,94,.3)' : 'var(--bd,#2a2a38)'}`,
          color: phase === 'start' ? '#4f6ef7' : startDate ? '#22c55e' : 'var(--tx3,#50506a)',
          cursor: 'pointer',
        }} onClick={() => setPhase('start')}>
          {labels.start ?? 'Inicio'}: {startDate ? `${startDate} ${startTime}` : '—'}
        </div>
        <div style={{
          flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: phase === 'end' ? 'rgba(79,110,247,.12)' : 'var(--sf2,#1b1b22)',
          border: `1px solid ${phase === 'end' ? '#4f6ef7' : endDate ? 'rgba(34,197,94,.3)' : 'var(--bd,#2a2a38)'}`,
          color: phase === 'end' ? '#4f6ef7' : endDate ? '#22c55e' : 'var(--tx3,#50506a)',
          cursor: 'pointer',
        }} onClick={() => { if (startDate) setPhase('end'); }}>
          {labels.end ?? 'Fin'}: {endDate ? `${endDate} ${endTime}` : '—'}
        </div>
      </div>

      {/* Calendar */}
      <div style={{
        background: 'var(--sf2,#1b1b22)', border: '1px solid var(--bd,#2a2a38)',
        borderRadius: 10, padding: 12,
      }}>
        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button onClick={prevMonth} style={navBtn}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx,#e4e4ef)' }}>
            {MONTHS_ES[viewMonth]} {viewYear}
          </span>
          <button onClick={nextMonth} style={navBtn}>›</button>
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
          {DAYS_ES.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--tx3,#50506a)', padding: '2px 0' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {Array.from({ length: offset }, (_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const day = i + 1;
            const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const disabled = isDisabled(iso);
            const isStart = iso === startDate;
            const isEnd = iso === endDate;
            const inRange = isInRange(iso);
            const isToday = iso === today;

            let bg = 'transparent';
            let color = 'var(--tx,#e4e4ef)';
            let border = 'none';
            let fontWeight = 400;

            if (disabled) {
              color = 'var(--tx3,#3a3a4a)';
            } else if (isStart || isEnd) {
              bg = '#4f6ef7';
              color = '#fff';
              fontWeight = 700;
            } else if (inRange) {
              bg = 'rgba(79,110,247,.15)';
              color = '#93b4ff';
            }
            if (isToday && !isStart && !isEnd) {
              border = '1px solid var(--tx3,#50506a)';
            }

            return (
              <button
                key={day}
                onClick={() => handleDayClick(iso)}
                onMouseEnter={() => { if (phase === 'end' && startDate && !disabled) setHover(iso); }}
                onMouseLeave={() => setHover(null)}
                disabled={disabled}
                style={{
                  ...dayBase,
                  background: bg,
                  color,
                  fontWeight,
                  border,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.4 : 1,
                  borderRadius: isStart ? '6px 0 0 6px' : isEnd ? '0 6px 6px 0' : inRange ? 0 : 6,
                }}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* Max duration hint */}
        {maxDurationHours > 0 && (
          <div style={{ fontSize: 10, color: 'var(--tx3,#50506a)', textAlign: 'center', marginTop: 8 }}>
            Máx. {maxDurationHours}h desde inicio{maxEndDate ? ` (hasta ${maxEndDate})` : ''}
          </div>
        )}
      </div>

      {/* Time selectors */}
      {showTime && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3,#50506a)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 4 }}>
              {labels.time ?? 'Hora'} {labels.start?.toLowerCase() ?? 'inicio'}
            </label>
            <input type="time" value={startTime} onChange={e => handleTimeChange('start', e.target.value)} style={timeInput} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3,#50506a)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 4 }}>
              {labels.time ?? 'Hora'} {labels.end?.toLowerCase() ?? 'fin'}
            </label>
            <input type="time" value={endTime} onChange={e => handleTimeChange('end', e.target.value)} style={timeInput} />
          </div>
        </div>
      )}
    </div>
  );
}
