import { useState, useMemo, useRef, useEffect } from 'react';

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
  /** Show time selectors. Default true. */
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
const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}
function firstDayOffset(y: number, m: number): number {
  return (new Date(y, m, 1).getDay() + 6) % 7;
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
function fmtShort(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()} ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
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

  const startDate = startValue ? startValue.slice(0, 10) : '';
  const endDate = endValue ? endValue.slice(0, 10) : '';
  const startTime = startValue ? startValue.slice(11, 16) || '09:00' : '09:00';
  const endTime = endValue ? endValue.slice(11, 16) || '18:00' : '18:00';

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'start' | 'end'>(startDate ? 'end' : 'start');
  const [hover, setHover] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const initMonth = startDate ? new Date(startDate + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState(initMonth.getFullYear());
  const [viewMonth, setViewMonth] = useState(initMonth.getMonth());

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const maxEndDate = useMemo(() => {
    if (!maxDurationHours || !startDate) return '';
    return addDays(startDate, Math.ceil(maxDurationHours / 24));
  }, [startDate, maxDurationHours]);

  const prevMonth = () => { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); };

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
      onChange(showTime ? `${iso}T${startTime}` : iso, '');
      setPhase('end');
    } else {
      if (iso < startDate) {
        onChange(showTime ? `${iso}T${startTime}` : iso, '');
        setPhase('end');
      } else {
        onChange(showTime ? `${startDate}T${startTime}` : startDate, showTime ? `${iso}T${endTime}` : iso);
        setPhase('start');
        setOpen(false);
      }
    }
  };

  const handleTimeChange = (which: 'start' | 'end', time: string) => {
    if (which === 'start') onChange(`${startDate}T${time}`, endValue);
    else onChange(startValue, `${endDate}T${time}`);
  };

  const openFor = (p: 'start' | 'end') => {
    setPhase(p);
    const ref = p === 'start' && startDate ? startDate : endDate || startDate || today;
    if (ref) {
      const d = new Date(ref + 'T00:00:00');
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
    setOpen(true);
  };

  // ── Styles ──────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    flex: 1, padding: showTime ? '7px 10px' : '5px 8px',
    fontSize: showTime ? 13 : 10,
    fontFamily: 'inherit', cursor: 'pointer',
    background: 'var(--sf2,var(--dp-sf2,#1b1b22))',
    border: '1px solid var(--bd,var(--dp-bd,#2a2a38))',
    borderRadius: showTime ? 8 : 4,
    color: 'var(--tx,var(--dp-tx2,#e4e4ef))',
    outline: 'none', textAlign: 'left',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: showTime ? 11 : 9, fontWeight: 700,
    color: 'var(--tx3,var(--dp-tx3,#50506a))',
    textTransform: 'uppercase', letterSpacing: '.05em',
    display: 'block', marginBottom: showTime ? 5 : 3,
  };
  const navBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
    color: 'var(--tx3,#50506a)', padding: '4px 8px', borderRadius: 4, fontFamily: 'inherit',
  };
  const dayBase: React.CSSProperties = {
    width: 32, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, cursor: 'pointer', transition: 'all .1s',
    fontFamily: 'inherit', border: 'none', background: 'transparent', padding: 0,
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Compact inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: showTime ? '1fr 1fr' : '1fr 1fr', gap: showTime ? 12 : 6 }}>
        <div>
          <label style={labelStyle}>{labels.start ?? 'Inicio'}</label>
          <div onClick={() => openFor('start')} style={{
            ...inputStyle,
            borderColor: open && phase === 'start' ? '#4f6ef7' : inputStyle.borderColor,
          }}>
            {startDate ? fmtShort(startDate) : '—'}
            {showTime && startDate && <span style={{ color: 'var(--tx3,#50506a)', marginLeft: 6, fontSize: 11 }}>{startTime}</span>}
          </div>
        </div>
        <div>
          <label style={labelStyle}>{labels.end ?? 'Fin'}</label>
          <div onClick={() => { if (startDate) openFor('end'); }} style={{
            ...inputStyle,
            borderColor: open && phase === 'end' ? '#4f6ef7' : inputStyle.borderColor,
            opacity: startDate ? 1 : 0.5,
          }}>
            {endDate ? fmtShort(endDate) : '—'}
            {showTime && endDate && <span style={{ color: 'var(--tx3,#50506a)', marginLeft: 6, fontSize: 11 }}>{endTime}</span>}
          </div>
        </div>
      </div>

      {/* Calendar popover */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 100,
          background: 'var(--sf,var(--dp-sf,#141418))',
          border: '1px solid var(--bd,var(--dp-bd,#2a2a38))',
          borderRadius: 12, padding: 14, minWidth: 280,
          boxShadow: '0 12px 40px rgba(0,0,0,.5)',
        }}>
          {/* Phase hint */}
          <div style={{ fontSize: 10, fontWeight: 700, color: '#4f6ef7', marginBottom: 8, textAlign: 'center' }}>
            {phase === 'start' ? `Selecciona ${(labels.start ?? 'inicio').toLowerCase()}` : `Selecciona ${(labels.end ?? 'fin').toLowerCase()}`}
          </div>

          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button onClick={prevMonth} style={navBtn}>‹</button>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx,#e4e4ef)' }}>
              {MONTHS_ES[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} style={navBtn}>›</button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 2 }}>
            {DAYS_ES.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--tx3,#50506a)', padding: '2px 0' }}>{d}</div>
            ))}
          </div>

          {/* Days */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
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

              if (disabled) { color = 'var(--tx3,#3a3a4a)'; }
              else if (isStart || isEnd) { bg = '#4f6ef7'; color = '#fff'; fontWeight = 700; }
              else if (inRange) { bg = 'rgba(79,110,247,.15)'; color = '#93b4ff'; }
              if (isToday && !isStart && !isEnd) { border = '1px solid var(--tx3,#50506a)'; }

              return (
                <button key={day}
                  onClick={() => handleDayClick(iso)}
                  onMouseEnter={() => { if (phase === 'end' && startDate && !disabled) setHover(iso); }}
                  onMouseLeave={() => setHover(null)}
                  disabled={disabled}
                  style={{
                    ...dayBase, background: bg, color, fontWeight, border,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.4 : 1,
                    borderRadius: isStart ? '6px 0 0 6px' : isEnd ? '0 6px 6px 0' : inRange ? 0 : 6,
                  }}>
                  {day}
                </button>
              );
            })}
          </div>

          {/* Max duration hint */}
          {maxDurationHours > 0 && startDate && (
            <div style={{ fontSize: 9, color: 'var(--tx3,#50506a)', textAlign: 'center', marginTop: 6 }}>
              Máx. {maxDurationHours}h{maxEndDate ? ` (hasta ${fmtShort(maxEndDate)})` : ''}
            </div>
          )}

          {/* Time selectors inside popover */}
          {showTime && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--bd,#2a2a38)' }}>
              <div>
                <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--tx3,#50506a)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
                  Hora {(labels.start ?? 'inicio').toLowerCase()}
                </label>
                <input type="time" value={startTime} onChange={e => handleTimeChange('start', e.target.value)}
                  style={{ width: '100%', background: 'var(--sf2,#1b1b22)', border: '1px solid var(--bd,#2a2a38)', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: 'var(--tx,#e4e4ef)', fontFamily: 'inherit', outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--tx3,#50506a)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
                  Hora {(labels.end ?? 'fin').toLowerCase()}
                </label>
                <input type="time" value={endTime} onChange={e => handleTimeChange('end', e.target.value)}
                  style={{ width: '100%', background: 'var(--sf2,#1b1b22)', border: '1px solid var(--bd,#2a2a38)', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: 'var(--tx,#e4e4ef)', fontFamily: 'inherit', outline: 'none' }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
