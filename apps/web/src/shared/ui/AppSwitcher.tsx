import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';

interface ModuleEntry {
  key: string;
  icon: string;
  labelKey: string;
  route: string;
  color: string;
}

const ALL_MODULES: ModuleEntry[] = [
  { key: 'jt',           icon: 'assignment',    labelKey: 'nav.jiraTracker',   route: '/jira-tracker/calendar', color: '#4d8eff' },
  { key: 'hd',           icon: 'event_seat',    labelKey: 'nav.hotdesk',       route: '/hotdesk/map',           color: '#4ae176' },
  { key: 'retro',        icon: 'replay',        labelKey: 'nav.retro',         route: '/retro',                 color: '#f59e0b' },
  { key: 'deploy',       icon: 'rocket_launch', labelKey: 'nav.deployPlanner', route: '/deploy',                color: '#ef4444' },
  { key: 'envtracker',   icon: 'dns',           labelKey: 'nav.environments',  route: '/envtracker',            color: '#22d3ee' },
  { key: 'vector-logic', icon: 'hub',           labelKey: 'nav.vectorLogic',   route: '/vector-logic',          color: '#b76dff' },
  { key: 'chrono',       icon: 'timer',         labelKey: 'nav.timeClock',     route: '/chrono',                color: '#fb923c' },
  { key: 'chrono-admin', icon: 'groups',        labelKey: 'nav.hr',            route: '/chrono-admin',          color: '#ddb7ff' },
];

interface AppSwitcherProps {
  currentMod: string;
  userModules: string[];
  onNavigate: (path: string) => void;
}

export function AppSwitcher({ currentMod, userModules, onNavigate }: AppSwitcherProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const visibleModules = ALL_MODULES.filter(m => userModules.includes(m.key));

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(prev => !prev)}
        title={t('nav.appSwitcher')}
        style={{
          background: open ? 'var(--sf3)' : 'transparent',
          border: '1px solid var(--bd)',
          borderRadius: 'var(--r)',
          cursor: 'pointer',
          color: open ? 'var(--ac2)' : 'var(--tx2)',
          padding: '4px 8px',
          height: 32,
          width: 32,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'var(--ease)',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 'var(--fs-lg)', fontVariationSettings: "'wght' 300" }}
        >
          apps
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            minWidth: 280,
            background: 'var(--sf2)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: 12,
            border: '1px solid var(--bd)',
            boxShadow: 'var(--shadow)',
            padding: 12,
            zIndex: 9999,
            animation: 'appSwitcherFadeIn .15s ease-out',
          }}
        >
          <div
            style={{
              fontSize: 'var(--fs-2xs)',
              fontWeight: 700,
              letterSpacing: '.05em',
              textTransform: 'uppercase' as const,
              color: 'var(--tx3)',
              padding: '4px 6px 10px',
            }}
          >
            {t('nav.modules')}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
            }}
          >
            {visibleModules.map(m => {
              const isActive = currentMod === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => {
                    onNavigate(m.route);
                    setOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '12px 6px',
                    background: isActive ? 'var(--ac-dim)' : 'transparent',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'var(--ease)',
                    position: 'relative',
                    outline: isActive ? '1px solid var(--ac)' : 'none',
                    boxShadow: isActive ? '0 0 12px var(--ac-dim)' : 'none',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--sf3)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    }
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: 'var(--fs-lg)',
                      color: isActive ? 'var(--ac2)' : m.color,
                      fontVariationSettings: isActive ? "'wght' 400, 'FILL' 1" : "'wght' 300",
                      transition: 'var(--ease)',
                    }}
                  >
                    {m.icon}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--fs-2xs)',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? 'var(--ac2)' : 'var(--tx3)',
                      letterSpacing: '.01em',
                      textAlign: 'center',
                      lineHeight: 1.2,
                      maxWidth: 72,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t(m.labelKey)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Keyframe animation */}
      <style>{`
        @keyframes appSwitcherFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
