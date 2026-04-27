// @ts-nocheck
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '@worksuite/i18n';
import { useDialog } from '@worksuite/ui';
import { KanbanView } from './views/KanbanView';
import { BoardView } from './views/BoardView';
import { ChatView } from './views/ChatView';
import { AIDetectionsView } from './views/AIDetectionsView';
import { BacklogHistoryView } from './views/BacklogHistoryView';
import { BoardConfigModal } from './components/BoardConfigModal';
import { aiRepo, boardRepo, boardColumnRepo, boardMemberRepo, stateRepo } from '../container';
import type { AIMode } from '../domain/entities/AI';
import type { KanbanBoard } from '../domain/entities/KanbanBoard';
import type { BoardPermission } from '../domain/entities/BoardMember';

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
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<AIMode>('embedded');
  const [boards, setBoards] = useState<KanbanBoard[]>([]);
  /** Map from boardId → my permission ('use' | 'edit'). Owner is implicit. */
  const [myPermissions, setMyPermissions] = useState<Map<string, BoardPermission>>(new Map());
  const [skExpanded, setSkExpanded] = useState(true);
  /** When set, the BoardConfigModal is open. `null` means "create new". */
  const [editingBoardId, setEditingBoardId] = useState<string | null | undefined>(undefined);

  /** Derive the current view + selected board from the URL so reloading the
   *  page keeps the user where they were. URL shape:
   *    /vector-logic                           → routes to default board
   *    /vector-logic/board/:boardId            → BoardView
   *    /vector-logic/backlog | detections | chat
   */
  const { view, selectedBoardId } = parseRoute(location.pathname);
  const setView = (next: Tab) => {
    if (next === 'kanban')          navigate('/vector-logic');
    else if (next === 'backlogHistory') navigate('/vector-logic/backlog');
    else if (next === 'detections') navigate('/vector-logic/detections');
    else if (next === 'chat')       navigate('/vector-logic/chat');
  };
  const setSelectedBoardId = (id: string | null) => {
    if (id) navigate(`/vector-logic/board/${id}`);
    else navigate('/vector-logic');
  };

  // Load mode once so we know whether to show the Chat tab
  useEffect(() => {
    aiRepo.getSettings(currentUser.id).then(s => {
      if (s) setMode(s.mode);
    }).catch(() => {});
  }, [currentUser.id]);

  // Load accessible boards for the current user (RLS-filtered) and ensure
  // the auto-created "Smart Kanban" default board exists.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let all = await boardRepo.findAccessible();
        if (cancelled) return;
        // Auto-create the default board on first load when missing.
        const myDefault = all.find(b => b.isDefault && b.ownerId === currentUser.id);
        if (!myDefault) {
          const created = await ensureDefaultBoard(currentUser.id);
          if (created) all = [created, ...all.filter(b => b.id !== created.id)];
        }
        if (!cancelled) setBoards(all);
      } catch {
        if (!cancelled) setBoards([]);
      }
    })();
    boardMemberRepo.findForUser(currentUser.id)
      .then((rows) => {
        if (cancelled) return;
        const m = new Map<string, BoardPermission>();
        rows.forEach(r => m.set(r.boardId, r.permission));
        setMyPermissions(m);
      })
      .catch(() => { if (!cancelled) setMyPermissions(new Map()); });
    return () => { cancelled = true; };
  }, [currentUser.id]);

  /** The user's Smart Kanban default board, or null while it is being
   *  created on first visit. */
  const defaultBoard = boards.find(b => b.isDefault && b.ownerId === currentUser.id) ?? null;

  // When the URL is the root /vector-logic and the user has a default
  // board, redirect there so the kanban auto experience is what they get.
  useEffect(() => {
    if (defaultBoard && location.pathname === '/vector-logic') {
      navigate(`/vector-logic/board/${defaultBoard.id}`, { replace: true });
    }
  }, [defaultBoard, location.pathname, navigate]);

  /** True if the current user can edit (configure) the given board. */
  const canEditBoard = (board: KanbanBoard) => {
    if (board.ownerId === currentUser.id) return true;
    return myPermissions.get(board.id) === 'edit';
  };

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
    setEditingBoardId(undefined);
  };

  const handleBoardDeleted = (deletedId: string) => {
    setBoards(prev => prev.filter(b => b.id !== deletedId));
    if (selectedBoardId === deletedId) {
      setSelectedBoardId(null);
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
              {/* Smart Kanban (default board) — auto-created, editable, not deletable. */}
              {defaultBoard && (() => {
                const active = view === 'board' && selectedBoardId === defaultBoard.id;
                return (
                  <button
                    type="button"
                    className={`vl-board-item${active ? ' active' : ''}`}
                    onClick={() => handleSelectBoard(defaultBoard.id)}
                  >
                    <span className="material-symbols-outlined" style={{fontSize:14}}>{defaultBoard.icon || 'bolt'}</span>
                    <span style={{flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                      {defaultBoard.name}
                    </span>
                    <span
                      className="vl-board-edit material-symbols-outlined"
                      style={{fontSize:14}}
                      onClick={(e) => handleEditBoard(e, defaultBoard.id)}
                      role="button"
                      aria-label={t('vectorLogic.editBoardTitle')}
                    >
                      edit
                    </span>
                  </button>
                );
              })()}

              {boards.filter(b => !b.isDefault).map(b => {
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
                    {canEditBoard(b) && (
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
            myPermission={myPermissions.get(selectedBoardId) ?? null}
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

/**
 * Auto-create the "Smart Kanban" default board for a user on first visit.
 * Seeds 4 columns (Backlog / To Do / In Progress / Done), each mapped to
 * every state in the matching category. Idempotent at the DB level via the
 * `vl_kanban_boards_one_default_per_owner` partial unique index.
 */
async function ensureDefaultBoard(ownerId: string): Promise<KanbanBoard | null> {
  try {
    const board = await boardRepo.create({
      ownerId,
      name: 'Smart Kanban',
      description: null,
      icon: 'bolt',
      visibility: 'personal',
      isDefault: true,
    });
    const states = await stateRepo.findAll();
    const labels: Record<string, string> = {
      BACKLOG: 'Backlog',
      OPEN: 'To Do',
      IN_PROGRESS: 'In Progress',
      DONE: 'Done',
    };
    let order = 0;
    for (const cat of ['BACKLOG', 'OPEN', 'IN_PROGRESS', 'DONE'] as const) {
      const matches = states.filter(s => s.category === cat);
      if (matches.length === 0) continue;
      await boardColumnRepo.create({
        boardId: board.id,
        name: labels[cat],
        sortOrder: order++,
        wipLimit: null,
        stateIds: matches.map(s => s.id),
      });
    }
    return board;
  } catch {
    // Race condition (another tab created it first) — re-fetch and use that.
    const all = await boardRepo.findAccessible().catch(() => []);
    return all.find(b => b.isDefault && b.ownerId === ownerId) ?? null;
  }
}

/** Map a URL path under /vector-logic to the active view + board id. */
function parseRoute(pathname: string): { view: Tab; selectedBoardId: string | null } {
  // /vector-logic/board/:id
  const boardMatch = pathname.match(/^\/vector-logic\/board\/([^/]+)/);
  if (boardMatch) return { view: 'board', selectedBoardId: boardMatch[1] };
  if (pathname.startsWith('/vector-logic/backlog'))    return { view: 'backlogHistory', selectedBoardId: null };
  if (pathname.startsWith('/vector-logic/detections')) return { view: 'detections',     selectedBoardId: null };
  if (pathname.startsWith('/vector-logic/chat'))       return { view: 'chat',           selectedBoardId: null };
  // Root /vector-logic — useEffect redirects to default board when ready.
  return { view: 'kanban', selectedBoardId: null };
}

