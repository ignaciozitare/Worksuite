import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { useDialog } from '@worksuite/ui';
import { boardRepo, boardColumnRepo, stateRepo } from '../../container';
import type { KanbanBoard, BoardVisibility } from '../../domain/entities/KanbanBoard';
import type { BoardColumn } from '../../domain/entities/BoardColumn';
import type { State, StateCategory } from '../../domain/entities/State';

type DraftColumn = {
  /** Existing column id when editing, undefined when newly added in this session. */
  id?: string;
  stateId: string;
  sortOrder: number;
  wipLimit: number | null;
};

interface Props {
  /** When null, the modal is in "create new board" mode. */
  boardId: string | null;
  ownerId: string;
  onClose: () => void;
  onSaved: (board: KanbanBoard) => void;
  onDeleted: (boardId: string) => void;
}

const CAT_ORDER: StateCategory[] = ['BACKLOG', 'OPEN', 'IN_PROGRESS', 'DONE'];

/**
 * Pick one state per category to seed a new board's columns.
 * Falls back to whatever is available if a category has no states.
 */
function buildDefaultColumns(allStates: State[]): DraftColumn[] {
  const out: DraftColumn[] = [];
  let idx = 0;
  for (const cat of CAT_ORDER) {
    const match = allStates.find(s => s.category === cat);
    if (match) out.push({ stateId: match.id, sortOrder: idx++, wipLimit: null });
  }
  return out;
}

export function BoardConfigModal({ boardId, ownerId, onClose, onSaved, onDeleted }: Props) {
  const { t } = useTranslation();
  const dialog = useDialog();

  const isNew = boardId === null;

  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<BoardVisibility>('personal');
  const [columns, setColumns] = useState<DraftColumn[]>([]);
  const [allStates, setAllStates] = useState<State[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originalColumnIds, setOriginalColumnIds] = useState<Set<string>>(new Set());
  const [originalBoard, setOriginalBoard] = useState<KanbanBoard | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [stateMenuOpen, setStateMenuOpen] = useState(false);

  /** Initial load — fetch states + (if editing) the board itself + its columns. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const states = await stateRepo.findAll();
        if (cancelled) return;
        setAllStates(states);

        if (isNew) {
          setColumns(buildDefaultColumns(states));
          setLoading(false);
          return;
        }

        const [board, cols] = await Promise.all([
          boardRepo.findById(boardId!),
          boardColumnRepo.findByBoard(boardId!),
        ]);
        if (cancelled) return;
        if (!board) {
          setError(t('vectorLogic.boardNotFound'));
          setLoading(false);
          return;
        }
        setOriginalBoard(board);
        setName(board.name);
        setVisibility(board.visibility);
        const sorted = [...cols].sort((a, b) => a.sortOrder - b.sortOrder);
        setColumns(sorted.map<DraftColumn>(c => ({
          id: c.id,
          stateId: c.stateId,
          sortOrder: c.sortOrder,
          wipLimit: c.wipLimit,
        })));
        setOriginalColumnIds(new Set(sorted.map(c => c.id)));
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load board');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [boardId, isNew, t]);

  const stateById = useMemo(() => {
    const m = new Map<string, State>();
    allStates.forEach(s => m.set(s.id, s));
    return m;
  }, [allStates]);

  const usedStateIds = useMemo(
    () => new Set(columns.map(c => c.stateId)),
    [columns],
  );

  const availableStates = useMemo(
    () => allStates.filter(s => !usedStateIds.has(s.id)),
    [allStates, usedStateIds],
  );

  const isOwner = isNew || (originalBoard?.ownerId === ownerId);
  const canDelete = !isNew && isOwner;

  const handleAddColumn = (stateId: string) => {
    setColumns(prev => [
      ...prev,
      { stateId, sortOrder: prev.length, wipLimit: null },
    ]);
    setStateMenuOpen(false);
  };

  const handleRemoveColumn = (idx: number) => {
    setColumns(prev => prev
      .filter((_, i) => i !== idx)
      .map((c, i) => ({ ...c, sortOrder: i })));
  };

  const handleWipChange = (idx: number, raw: string) => {
    const trimmed = raw.trim();
    let wipLimit: number | null = null;
    if (trimmed !== '') {
      const n = parseInt(trimmed, 10);
      if (!Number.isNaN(n) && n >= 1) wipLimit = n;
    }
    setColumns(prev => prev.map((c, i) => i === idx ? { ...c, wipLimit } : c));
  };

  const handleDragStart = (idx: number) => () => setDragIdx(idx);
  const handleDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
  };
  const handleDrop = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setColumns(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next.map((c, i) => ({ ...c, sortOrder: i }));
    });
    setDragIdx(null);
  };
  const handleDragEnd = () => setDragIdx(null);

  const handleSave = async () => {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('vectorLogic.boardNameRequired'));
      return;
    }
    if (columns.length === 0) {
      setError(t('vectorLogic.boardNeedAtLeastOneColumn'));
      return;
    }
    setSaving(true);
    try {
      let board: KanbanBoard;
      if (isNew) {
        board = await boardRepo.create({
          ownerId,
          name: trimmedName,
          description: null,
          icon: null,
          visibility,
        });
      } else {
        await boardRepo.update(boardId!, {
          name: trimmedName,
          visibility,
        });
        board = { ...originalBoard!, name: trimmedName, visibility };
      }

      // Diff columns: existing → update or remove; new → create.
      const currentIds = new Set(columns.filter(c => c.id).map(c => c.id!));
      const removedIds = [...originalColumnIds].filter(id => !currentIds.has(id));
      await Promise.all(removedIds.map(id => boardColumnRepo.remove(id)));

      for (const col of columns) {
        if (col.id) {
          await boardColumnRepo.update(col.id, {
            stateId: col.stateId,
            sortOrder: col.sortOrder,
            wipLimit: col.wipLimit,
          });
        } else {
          await boardColumnRepo.create({
            boardId: board.id,
            stateId: col.stateId,
            sortOrder: col.sortOrder,
            wipLimit: col.wipLimit,
          });
        }
      }

      onSaved(board);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save board');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!boardId) return;
    const ok = await dialog.confirm(t('vectorLogic.boardDeleteConfirm'), {
      title: t('vectorLogic.boardDeleteBoard'),
      danger: true,
      confirmLabel: t('common.delete'),
    });
    if (!ok) return;
    setSaving(true);
    try {
      await boardRepo.remove(boardId);
      onDeleted(boardId);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to delete board');
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 12,
        width: '100%', maxWidth: 720, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.6)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--bd)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--tx)', margin: 0, letterSpacing: '-0.01em' }}>
              {isNew ? t('vectorLogic.boardModalCreateTitle') : t('vectorLogic.editBoardTitle')}
            </h3>
            {!isNew && originalBoard && (
              <span style={{ fontSize: 13, color: 'var(--tx3)' }}>{originalBoard.name}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx2)', display: 'flex' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)' }}>
              {t('common.loading')}
            </div>
          ) : (
            <>
              {error && (
                <div role="alert" style={{
                  padding: '10px 14px', background: 'var(--red-dim)', color: 'var(--red)',
                  borderRadius: 8, fontSize: 13, fontWeight: 500,
                }}>
                  {error}
                </div>
              )}

              {/* Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={S.label}>{t('vectorLogic.boardName')}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('vectorLogic.boardNamePlaceholder')}
                  style={S.input}
                  autoFocus
                />
              </div>

              {/* Visibility */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={S.label}>{t('vectorLogic.boardVisibility')}</label>
                <div style={S.toggleGroup}>
                  <button
                    type="button"
                    onClick={() => setVisibility('personal')}
                    style={visibility === 'personal' ? S.toggleActive : S.toggleInactive}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>person</span>
                    {t('vectorLogic.boardPersonal')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility('shared')}
                    style={visibility === 'shared' ? S.toggleActive : S.toggleInactive}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>groups</span>
                    {t('vectorLogic.boardShared')}
                  </button>
                </div>
              </div>

              {/* Columns */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ ...S.label, flex: 1 }}>{t('vectorLogic.boardColumns')}</label>
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => setStateMenuOpen(v => !v)}
                      disabled={availableStates.length === 0}
                      style={S.smallButton}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--ac-strong)' }}>add</span>
                      {t('vectorLogic.boardAddColumn')}
                    </button>
                    {stateMenuOpen && (
                      <div style={S.statePickerPanel}>
                        {availableStates.length === 0 ? (
                          <div style={{ padding: 10, fontSize: 12, color: 'var(--tx3)' }}>
                            {t('vectorLogic.boardNoMoreStates')}
                          </div>
                        ) : (
                          availableStates.map(s => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => handleAddColumn(s.id)}
                              style={S.statePickerItem}
                            >
                              <span style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: s.color || 'var(--tx3)',
                              }} />
                              <span style={{ flex: 1, color: 'var(--tx)' }}>{s.name}</span>
                              <span style={S.catLabel}>{s.category}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {columns.length === 0 && (
                    <div style={{ padding: 12, fontSize: 12, color: 'var(--tx3)', background: 'var(--sf2)', borderRadius: 8 }}>
                      {t('vectorLogic.boardNeedAtLeastOneColumn')}
                    </div>
                  )}
                  {columns.map((col, idx) => {
                    const st = stateById.get(col.stateId);
                    return (
                      <div
                        key={col.id ?? `new-${idx}-${col.stateId}`}
                        draggable
                        onDragStart={handleDragStart(idx)}
                        onDragOver={handleDragOver(idx)}
                        onDrop={handleDrop(idx)}
                        onDragEnd={handleDragEnd}
                        style={{
                          ...S.columnRow,
                          opacity: dragIdx === idx ? 0.4 : 1,
                        }}
                      >
                        <span className="material-symbols-outlined"
                              style={{ fontSize: 16, color: 'var(--tx3)', cursor: 'grab' }}>
                          drag_indicator
                        </span>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: st?.color || 'var(--tx3)', flexShrink: 0,
                        }} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--tx)' }}>
                          {st?.name ?? '—'}
                        </span>
                        <span style={S.catLabel}>{st?.category ?? ''}</span>
                        <div style={S.wipBox}>
                          <span className="material-symbols-outlined"
                                style={{ fontSize: 12, color: 'var(--tx3)' }}
                                title={t('vectorLogic.boardWipLimit')}>
                            speed
                          </span>
                          <input
                            type="number"
                            min={1}
                            value={col.wipLimit ?? ''}
                            onChange={(e) => handleWipChange(idx, e.target.value)}
                            placeholder="—"
                            aria-label={t('vectorLogic.boardWipLimit')}
                            style={S.wipInput}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveColumn(idx)}
                          aria-label={t('common.delete')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', display: 'flex' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div style={{
            padding: '16px 24px', borderTop: '1px solid var(--bd)',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                style={S.deleteButton}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                {t('vectorLogic.boardDeleteBoard')}
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={S.cancelButton}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={S.saveButton}
            >
              {saving
                ? t('common.loading')
                : (isNew ? t('vectorLogic.boardCreateButton') : t('vectorLogic.boardSaveChanges'))}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  label: {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
    color: 'var(--tx2)',
  },
  input: {
    width: '100%', background: 'var(--sf2)', border: '1px solid var(--bd)',
    borderRadius: 8, padding: '10px 14px', color: 'var(--tx)', fontSize: 14,
    fontFamily: 'inherit', outline: 'none',
  },
  toggleGroup: {
    display: 'inline-flex', background: 'var(--sf2)', borderRadius: 8, padding: 4, gap: 2,
    width: 'fit-content',
  },
  toggleActive: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
    background: 'var(--ac-strong)', color: 'var(--ac-on)', border: 'none',
    borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
  toggleInactive: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
    background: 'transparent', color: 'var(--tx3)', border: 'none',
    borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
  },
  smallButton: {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px',
    background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 6,
    color: 'var(--ac-strong)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  statePickerPanel: {
    position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 10,
    background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 8,
    boxShadow: '0 12px 32px rgba(0,0,0,.4)', minWidth: 240, maxHeight: 280,
    overflowY: 'auto',
  },
  statePickerItem: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
    width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
    color: 'var(--tx)', fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
  },
  catLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--tx3)',
  },
  columnRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: 'var(--sf2)', borderRadius: 8, padding: '10px 14px',
  },
  wipBox: {
    display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
    background: 'var(--sf3)', borderRadius: 5,
  },
  wipInput: {
    width: 40, background: 'transparent', border: 'none', outline: 'none',
    color: 'var(--tx)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
    textAlign: 'center',
  },
  deleteButton: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
    background: 'transparent', border: 'none', color: 'var(--red)',
    borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  cancelButton: {
    padding: '10px 18px', background: 'var(--sf2)', border: '1px solid var(--bd)',
    color: 'var(--tx2)', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  saveButton: {
    padding: '10px 18px', background: 'linear-gradient(135deg, var(--ac), var(--ac-strong))',
    border: 'none', color: 'var(--ac-on)', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 4px 12px var(--ac-dim)',
  },
};
