// @ts-nocheck
import { useState, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { useDialog } from '@worksuite/ui';
import { KanbanView } from './views/KanbanView';
import { BoardView } from './views/BoardView';
import { ChatView } from './views/ChatView';
import { AIDetectionsView } from './views/AIDetectionsView';
import { BacklogHistoryView } from './views/BacklogHistoryView';
import { BoardConfigModal } from './components/BoardConfigModal';
import { aiRepo, boardRepo } from '../container';
import type { AIMode } from '../domain/entities/AI';
import type { KanbanBoard } from '../domain/entities/KanbanBoard';

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
.vl .vl-group-toggle{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:transparent;color:var(--tx);transition:all .15s;text-align:left;width:100%;font-family:inherit;}
.vl .vl-group-toggle:hover{background:var(--sf2);}
.vl .vl-group-toggle .chev{transition:transform .15s;}
.vl .vl-group-toggle .chev.open{transform:rotate(0deg);}
.vl .vl-group-toggle .chev.closed{transform:rotate(-90deg);}
.vl .vl-board-item{display:flex;align-items:center;gap:8px;padding:7px 10px 7px 28px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;border:none;background:transparent;color:var(--tx2);transition:all .15s;text-align:left;width:100%;font-family:inherit;}
.vl .vl-board-item:hover{background:var(--sf2);color:var(--tx);}
.vl .vl-board-item:hover .vl-board-edit{opacity:.7;}
.vl .vl-board-item.active{background:var(--ac-dim);color:var(--ac2);font-weight:600;}
.vl .vl-board-edit{opacity:0;transition:opacity .15s;display:flex;}
.vl .vl-board-edit:hover{opacity:1 !important;}
.vl .vl-board-badge{font-size:8px;font-weight:700;letter-spacing:.05em;padding:2px 6px;border-radius:4px;background:var(--purple);color:var(--bg);}
.vl .vl-add-board{display:flex;align-items:center;gap:8px;padding:7px 10px 7px 28px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:none;background:transparent;color:var(--ac);transition:all .15s;text-align:left;width:100%;font-family:inherit;}
.vl .vl-add-board:hover{background:var(--ac-dim);}
`;

type Tab = 'kanban' | 'board' | 'chat' | 'detections' | 'backlogHistory';

interface Props {
  currentUser: { id: string; name?: string; email: string; role?: string; [k: string]: unknown };
  wsUsers?: Array<{ id: string; name?: string; email: string; avatar?: string }>;
}

export function VectorLogicPage({ currentUser, wsUsers = [] }: Props) {
  const { t } = useTranslation();
  const dialog = useDialog();
  const [view, setView] = useState<Tab>('kanban');
  const [mode, setMode] = useState<AIMode>('embedded');
  const [boards, setBoards] = useState<KanbanBoard[]>([]);
  const [skExpanded, setSkExpanded] = useState(true);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  /** When set, the BoardConfigModal is open. `null` means "create new". */
  const [editingBoardId, setEditingBoardId] = useState<string | null | undefined>(undefined);

  // Load mode once so we know whether to show the Chat tab
  useEffect(() => {
    aiRepo.getSettings(currentUser.id).then(s => {
      if (s) setMode(s.mode);
    }).catch(() => {});
  }, [currentUser.id]);

  // Load accessible boards for the current user (RLS-filtered)
  useEffect(() => {
    boardRepo.findAccessible().then(setBoards).catch(() => setBoards([]));
  }, [currentUser.id]);

  const handleAddBoard = () => {
    setEditingBoardId(null);
  };

  const handleEditBoard = (e: React.MouseEvent, boardId: string) => {
    e.stopPropagation();
    setEditingBoardId(boardId);
  };

  const handleSelectBoard = (boardId: string) => {
    setSelectedBoardId(boardId);
    setView('board');
  };

  const handleBoardSaved = (saved: KanbanBoard) => {
    setBoards(prev => {
      const idx = prev.findIndex(b => b.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    setSelectedBoardId(saved.id);
    setView('board');
    setEditingBoardId(undefined);
  };

  const handleBoardDeleted = (deletedId: string) => {
    setBoards(prev => prev.filter(b => b.id !== deletedId));
    if (selectedBoardId === deletedId) {
      setSelectedBoardId(null);
      setView('kanban');
    }
    setEditingBoardId(undefined);
  };

  const otherNav: Array<{ id?: Tab; label?: string; icon?: string }> = [
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
          <div className="vl-section-label">{t('vectorLogic.workspace')}</div>

          {/* Smart Kanban group (expandable) */}
          <button
            type="button"
            className="vl-group-toggle"
            onClick={() => setSkExpanded(v => !v)}
            aria-expanded={skExpanded}
          >
            <span className={`material-symbols-outlined chev ${skExpanded ? 'open' : 'closed'}`}
                  style={{fontSize:18,color:'var(--tx2)'}}>
              keyboard_arrow_down
            </span>
            <span className="material-symbols-outlined" style={{fontSize:20,color:'var(--ac)',opacity:.85}}>view_kanban</span>
            <span style={{flex:1}}>{t('vectorLogic.smartKanban')}</span>
          </button>

          {skExpanded && (
            <div style={{display:'flex',flexDirection:'column',gap:2,paddingTop:2}}>
              <button
                type="button"
                className={`vl-board-item${view === 'kanban' ? ' active' : ''}`}
                onClick={() => { setView('kanban'); setSelectedBoardId(null); }}
              >
                <span className="material-symbols-outlined" style={{fontSize:14}}>bolt</span>
                <span style={{flex:1}}>{t('vectorLogic.smartKanbanAuto')}</span>
              </button>

              {boards.map(b => {
                const active = view === 'board' && selectedBoardId === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`vl-board-item${active ? ' active' : ''}`}
                    onClick={() => handleSelectBoard(b.id)}
                  >
                    <span className="material-symbols-outlined" style={{fontSize:14}}>
                      {b.icon || 'view_kanban'}
                    </span>
                    <span style={{flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                      {b.name}
                    </span>
                    {b.visibility === 'personal' && (
                      <span className="vl-board-badge">{t('vectorLogic.badgePersonal')}</span>
                    )}
                    {b.ownerId === currentUser.id && (
                      <span
                        className="vl-board-edit material-symbols-outlined"
                        style={{fontSize:14}}
                        onClick={(e) => handleEditBoard(e, b.id)}
                        role="button"
                        aria-label={t('vectorLogic.editBoardTitle')}
                      >
                        edit
                      </span>
                    )}
                  </button>
                );
              })}

              <button
                type="button"
                className="vl-add-board"
                onClick={handleAddBoard}
              >
                <span className="material-symbols-outlined" style={{fontSize:14}}>add</span>
                <span>{t('vectorLogic.addBoard')}</span>
              </button>
            </div>
          )}

          {/* Other nav entries */}
          {otherNav.map((item) => {
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
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', flexDirection: 'column',
        overflow: view === 'kanban' || view === 'chat' ? 'hidden' : 'auto',
        padding: view === 'chat' ? 0 : '28px 32px',
      }}>
        {view === 'kanban'         && <KanbanView         currentUser={currentUser} wsUsers={wsUsers} />}
        {view === 'board' && selectedBoardId && (
          <BoardView
            key={selectedBoardId}
            boardId={selectedBoardId}
            currentUser={currentUser}
            wsUsers={wsUsers}
            onEditBoard={(id) => setEditingBoardId(id)}
          />
        )}
        {view === 'backlogHistory' && <BacklogHistoryView currentUser={currentUser} />}
        {view === 'chat'           && mode === 'embedded' && <ChatView currentUser={currentUser} />}
        {view === 'detections'     && <AIDetectionsView   currentUser={currentUser} />}
      </div>

      {editingBoardId !== undefined && (
        <BoardConfigModal
          boardId={editingBoardId}
          ownerId={currentUser.id}
          wsUsers={wsUsers}
          onClose={() => setEditingBoardId(undefined)}
          onSaved={handleBoardSaved}
          onDeleted={handleBoardDeleted}
        />
      )}
    </div>
  );
}

