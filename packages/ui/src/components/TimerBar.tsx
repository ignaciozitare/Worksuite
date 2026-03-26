import { useState, type ReactNode } from 'react';
import { Btn } from './Btn';

interface TimerBarProps {
  timer:        number;          // remaining seconds
  setTimer:     (v: number) => void;
  running:      boolean;
  setRunning:   (v: boolean) => void;
  isMod:        boolean;
  phaseMins:    number;
  setPhaseMins: (v: number) => void;
  onNext?:      () => void;
  nextLabel?:   string;
  children?:    ReactNode;       // extra content (e.g. vote counter)
  /** sticky top offset — defaults to 0 */
  stickyTop?:   number;
}

function fmt(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function TimerBar({
  timer, setTimer, running, setRunning,
  isMod, phaseMins, setPhaseMins,
  onNext, nextLabel = 'Next →',
  children,
  stickyTop = 0,
}: TimerBarProps) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');

  const totalSecs = phaseMins * 60;
  const pct = totalSecs > 0 ? Math.min(100, (timer / totalSecs) * 100) : 0;
  const timerColor =
    timer > 60 ? 'var(--ws-green)' :
    timer > 20 ? 'var(--ws-amber)' :
    'var(--ws-red)';

  const commit = () => {
    const n = parseInt(editVal, 10);
    if (n > 0 && n <= 120) { setPhaseMins(n); setTimer(n * 60); }
    setEditing(false);
  };

  return (
    <div style={{
      position:       'sticky',
      top:            stickyTop,
      zIndex:         15,
      background:     'var(--ws-surface)',
      backdropFilter: 'blur(10px)',
      borderBottom:   '1px solid var(--ws-border)',
      padding:        '10px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, maxWidth: 1200, margin: '0 auto' }}>

        {/* Timer display */}
        <div style={{
          fontSize:    22,
          fontFamily:  'var(--ws-font-heading)',
          fontWeight:  700,
          color:       timerColor,
          minWidth:    60,
          letterSpacing: '.5px',
        }}>
          {fmt(timer)}
        </div>

        {/* Progress + extra */}
        <div style={{ flex: 1 }}>
          <div style={{
            background:   'var(--ws-surface-2)',
            borderRadius: 4,
            height:       5,
            overflow:     'hidden',
            marginBottom: 5,
          }}>
            <div style={{
              width:      `${pct}%`,
              height:     '100%',
              background: timerColor,
              borderRadius: 4,
              transition: 'width 1s linear, background .4s',
            }}/>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {children}

            {isMod && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
                <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>Duration:</span>
                {editing ? (
                  <input
                    autoFocus
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onBlur={commit}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commit();
                      if (e.key === 'Escape') setEditing(false);
                    }}
                    style={{
                      width:        40,
                      background:   'var(--ws-bg)',
                      border:       '1px solid var(--ws-accent)',
                      borderRadius: 'var(--ws-radius-sm)',
                      padding:      '2px 5px',
                      color:        'var(--ws-text)',
                      fontSize:     11,
                      textAlign:    'center',
                      outline:      'none',
                      fontFamily:   'inherit',
                    }}
                  />
                ) : (
                  <button
                    onClick={() => { setEditVal(String(phaseMins)); setEditing(true); }}
                    style={{
                      background:   'var(--ws-surface-2)',
                      border:       '1px solid var(--ws-border)',
                      borderRadius: 'var(--ws-radius-sm)',
                      padding:      '2px 7px',
                      color:        'var(--ws-text-3)',
                      fontSize:     11,
                      cursor:       'pointer',
                      fontFamily:   'inherit',
                    }}
                  >
                    {phaseMins} min ✎
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        {isMod && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <Btn size="sm" variant={running ? 'warn' : 'success'} onClick={() => setRunning(!running)}>
              {running ? '⏸ Pause' : '▶ Start'}
            </Btn>
            {onNext && (
              <Btn size="sm" variant="ghost" onClick={onNext}>
                {nextLabel}
              </Btn>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
