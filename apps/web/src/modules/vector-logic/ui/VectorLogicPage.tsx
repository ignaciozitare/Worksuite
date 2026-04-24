// @ts-nocheck
import { useState, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { KanbanView } from './views/KanbanView';
import { ChatView } from './views/ChatView';
import { AIDetectionsView } from './views/AIDetectionsView';
import { BacklogHistoryView } from './views/BacklogHistoryView';
import { aiRepo } from '../container';
import type { AIMode } from '../domain/entities/AI';

/* ─── CSS (Stitch / Carbon Logic) ────────────────────────────────────────── */
const CSS = `
.vl *{box-sizing:border-box;margin:0;padding:0;}
.vl{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--tx);height:100%;overflow:hidden;display:flex;}
.vl button,.vl select,.vl input,.vl textarea{font-family:'Inter',system-ui,sans-serif;}
.vl ::-webkit-scrollbar{width:4px;height:4px;}
.vl ::-webkit-scrollbar-track{background:var(--bg);}
.vl ::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:2px;}
.vl .vl-sidebar{position:sticky;top:0;width:240px;min-width:240px;height:100%;min-height:calc(100vh - 52px);align-self:stretch;background:var(--sf);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-right:1px solid var(--bd);display:flex;flex-direction:column;padding:16px;gap:4px;z-index:30;overflow-y:auto;}
.vl .vl-nav-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;font-size:13px;font-weight:500;letter-spacing:.02em;cursor:pointer;border:none;background:transparent;color:var(--tx);opacity:.6;transition:all .2s;text-align:left;width:100%;font-family:inherit;}
.vl .vl-nav-item:hover{opacity:1;background:var(--sf2);transform:translateX(2px);}
.vl .vl-nav-item.active{opacity:1;color:var(--ac);background:var(--ac-dim);font-weight:600;box-shadow:0 0 20px var(--ac-dim);}
.vl .vl-nav-item.disabled{opacity:.3;cursor:not-allowed;pointer-events:none;}
.vl .vl-section-label{font-size:9px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.12em;padding:16px 12px 6px;user-select:none;}
`;

type Tab = 'kanban' | 'chat' | 'detections' | 'backlogHistory';

interface Props {
  currentUser: { id: string; name?: string; email: string; role?: string; [k: string]: unknown };
  wsUsers?: Array<{ id: string; name?: string; email: string; avatar?: string }>;
}

export function VectorLogicPage({ currentUser, wsUsers = [] }: Props) {
  const { t } = useTranslation();
  const [view, setView] = useState<Tab>('kanban');
  const [mode, setMode] = useState<AIMode>('embedded');

  // Load mode once so we know whether to show the Chat tab
  useEffect(() => {
    aiRepo.getSettings(currentUser.id).then(s => {
      if (s) setMode(s.mode);
    }).catch(() => {});
  }, [currentUser.id]);

  // Build NAV dynamically:
  // - Chat tab is hidden in 'external' mode (user goes via Claude Desktop + MCP)
  // - MCP Access tab is always visible (also useful in embedded mode if you want
  //   to ALSO connect Claude Desktop alongside the embedded chat)
  // User-facing nav only. All configuration (workflows, states, schema,
  // assignment, rules, priorities, provider settings) lives under the
  // global Admin panel → Vector Logic tab.
  const NAV: Array<{ section?: string; id?: Tab; label?: string; icon?: string }> = [
    { section: t('vectorLogic.workspace') },
    { id: 'kanban',         label: t('vectorLogic.smartKanban'),    icon: 'view_kanban' },
    { id: 'backlogHistory', label: t('vectorLogic.backlogHistory'), icon: 'inbox_customize' },
    { id: 'detections',     label: t('vectorLogic.aiDetections'),   icon: 'mark_email_unread' },
    ...(mode === 'embedded' ? [{ id: 'chat' as Tab, label: t('vectorLogic.chat'), icon: 'forum' }] : []),
  ];

  return (
    <div className="vl">
      <style>{CSS}</style>

      {/* ── Sidebar ────────────────────────────────────────── */}
      <aside className="vl-sidebar">
        {/* Brand */}
        <div style={{padding:'24px 12px 8px',display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:40,height:40,borderRadius:8,background:'var(--ac-dim)',
            display:'flex',alignItems:'center',justifyContent:'center',
            border:'1px solid var(--bd)'}}>
            <span className="material-symbols-outlined" style={{fontSize:22,color:'var(--ac)'}}>hub</span>
          </div>
          <div>
            <h1 style={{fontSize:16,fontWeight:700,color:'var(--tx)',letterSpacing:'-0.01em',lineHeight:1,margin:0,fontFamily:"'Space Grotesk',sans-serif"}}>
              {t('vectorLogic.title')}
            </h1>
            <p style={{fontSize:10,color:'var(--tx)',opacity:.4,fontWeight:700,letterSpacing:'.1em',marginTop:4,textTransform:'uppercase'}}>
              {t('vectorLogic.moduleSubtitle')}
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav style={{flex:1,display:'flex',flexDirection:'column',gap:0,padding:'8px 0'}}>
          {NAV.map((item, i) => {
            if ('section' in item && !('id' in item)) {
              return <div key={i} className="vl-section-label">{item.section}</div>;
            }
            const active = view === item.id;
            const disabled = (item as any).disabled;
            return (
              <button
                key={item.id}
                className={`vl-nav-item${active ? ' active' : ''}${disabled ? ' disabled' : ''}`}
                onClick={() => !disabled && setView(item.id as Tab)}
              >
                <span className="material-symbols-outlined" style={{fontSize:20}}>{item.icon}</span>
                <span style={{flex:1}}>{item.label}</span>
                {disabled && <span style={{fontSize:8,padding:'2px 6px',borderRadius:4,background:'var(--sf3)',color:'var(--tx3)',fontWeight:700,letterSpacing:'.05em'}}>{t('vectorLogic.badgeSoon')}</span>}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{padding:'14px 12px',borderTop:'1px solid var(--bd)',fontSize:10,color:'var(--tx3)',letterSpacing:'.08em',fontFamily:"'Space Grotesk',monospace"}}>
          v1.0 &middot; WorkSuite
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────── */}
      {/*
        Canvas needs full-bleed with no padding so React Flow can
        measure its container properly. Other views get the padded
        scrollable shell.
      */}
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', flexDirection: 'column',
        overflow: view === 'kanban' || view === 'chat' ? 'hidden' : 'auto',
        padding: view === 'chat' ? 0 : '28px 32px',
      }}>
        {view === 'kanban'         && <KanbanView         currentUser={currentUser} wsUsers={wsUsers} />}
        {view === 'backlogHistory' && <BacklogHistoryView currentUser={currentUser} />}
        {view === 'chat'           && mode === 'embedded' && <ChatView currentUser={currentUser} />}
        {view === 'detections'     && <AIDetectionsView   currentUser={currentUser} />}
      </div>
    </div>
  );
}

