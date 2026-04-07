import { useState, useMemo } from 'react';

interface RecentTasksSidebarProps {
  worklogs: Record<string, any[]>;
  onOpenLog: (opts: any) => void;
}

export function RecentTasksSidebar({ worklogs, onOpenLog }: RecentTasksSidebarProps) {
  const [open, setOpen] = useState(true);

  const recentTasks = useMemo(() => {
    const all: { issue: string; summary: string; date: string }[] = [];
    for (const [date, dayWls] of Object.entries(worklogs || {})) {
      for (const wl of dayWls) {
        all.push({ issue: wl.issue, summary: wl.summary || wl.issue, date });
      }
    }
    all.sort((a, b) => b.date.localeCompare(a.date));
    const seen = new Set<string>();
    const unique: typeof all = [];
    for (const item of all) {
      if (!seen.has(item.issue)) {
        seen.add(item.issue);
        unique.push(item);
      }
      if (unique.length >= 20) break;
    }
    return unique;
  }, [worklogs]);

  return (
    <div style={{
      width: open ? 220 : 32, flexShrink: 0, transition: 'width .2s',
      borderLeft: '1px solid var(--bd)', background: 'var(--sf)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <button onClick={() => setOpen(v => !v)} style={{
        background: 'none', border: 'none', borderBottom: '1px solid var(--bd)',
        cursor: 'pointer', padding: '10px 8px', color: 'var(--tx3)',
        fontSize: 11, fontWeight: 700, fontFamily: 'inherit', textAlign: 'center',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      }}>
        {open ? '›' : '‹'}
        {open && <span style={{ letterSpacing: '.04em', textTransform: 'uppercase' }}>Recientes</span>}
      </button>
      {open && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px' }}>
          {recentTasks.map(rt => (
            <div key={rt.issue}
              onClick={() => onOpenLog({ issueKey: rt.issue })}
              style={{
                padding: '8px 8px', borderRadius: 6, cursor: 'pointer',
                marginBottom: 4, transition: 'background .1s',
                borderLeft: '2px solid var(--ac,#4f6ef7)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--sf2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ac2,#7c9aff)', fontFamily: 'var(--mono)' }}>{rt.issue}</div>
              <div style={{ fontSize: 10, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{rt.summary}</div>
              <div style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2, opacity: 0.7 }}>{rt.date}</div>
            </div>
          ))}
          {recentTasks.length === 0 && (
            <div style={{ fontSize: 10, color: 'var(--tx3)', textAlign: 'center', padding: '16px 0' }}>Sin imputaciones</div>
          )}
        </div>
      )}
    </div>
  );
}
