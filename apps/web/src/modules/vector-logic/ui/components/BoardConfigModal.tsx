import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { useDialog } from '@worksuite/ui';
import {
  boardRepo, boardColumnRepo, boardFilterRepo, boardMemberRepo,
  stateRepo, taskTypeRepo, priorityRepo,
} from '../../container';
import type { KanbanBoard, BoardVisibility } from '../../domain/entities/KanbanBoard';
import type { BoardColumn } from '../../domain/entities/BoardColumn';
import type { BoardFilter, BoardFilterDimension } from '../../domain/entities/BoardFilter';
import type { BoardMember, BoardPermission } from '../../domain/entities/BoardMember';
import type { State, StateCategory } from '../../domain/entities/State';
import type { TaskType } from '../../domain/entities/TaskType';
import type { Priority } from '../../domain/entities/Priority';
import { IconPicker } from './IconPicker';

type DraftColumn = {
  /** Existing column id when editing, undefined when newly added in this session. */
  id?: string;
  /** User-chosen column label. */
  name: string;
  /** State ids from the library that map to this column. Tasks whose state
   *  is in this list appear in the column. */
  stateIds: string[];
  sortOrder: number;
  wipLimit: number | null;
};

type DraftMember = {
  /** Existing member id when editing; undefined for newly added in this session. */
  id?: string;
  userId: string;
  permission: BoardPermission;
};

/** Local filter state. We keep all 7 dimensions in a single object — easier
 *  to reason about than an array of {dimension, value}. We translate to/from
 *  the BoardFilter[] shape on load and save. */
type DraftFilters = {
  task_type: string[];
  assignee: string[];
  priority: string[];
  label: string[];
  created_by: string[];
  due_from: string | null;
  due_to: string | null;
};

const EMPTY_FILTERS: DraftFilters = {
  task_type: [], assignee: [], priority: [], label: [], created_by: [],
  due_from: null, due_to: null,
};

interface WSUserLite {
  id: string;
  name?: string;
  email: string;
}

interface Props {
  /** When null, the modal is in "create new board" mode. */
  boardId: string | null;
  ownerId: string;
  /** Workspace users for assignee / created_by selectors. */
  wsUsers?: WSUserLite[];
  onClose: () => void;
  onSaved: (board: KanbanBoard) => void;
  onDeleted: (boardId: string) => void;
}

const CAT_ORDER: StateCategory[] = ['BACKLOG', 'OPEN', 'IN_PROGRESS', 'DONE'];

/**
 * Seed a new board with one column per category, each mapping to every
 * state in that category. Skips categories that have no states.
 */
function buildDefaultColumns(allStates: State[]): DraftColumn[] {
  const labels: Record<StateCategory, string> = {
    BACKLOG: 'Backlog',
    OPEN: 'To Do',
    IN_PROGRESS: 'In Progress',
    DONE: 'Done',
  };
  const out: DraftColumn[] = [];
  let idx = 0;
  for (const cat of CAT_ORDER) {
    const matches = allStates.filter(s => s.category === cat);
    if (matches.length > 0) {
      out.push({
        name: labels[cat],
        stateIds: matches.map(s => s.id),
        sortOrder: idx++,
        wipLimit: null,
      });
    }
  }
  return out;
}

/** Translate the BoardFilter[] from the repo into the modal's DraftFilters. */
function filtersFromBoardFilters(rows: BoardFilter[]): DraftFilters {
  const out: DraftFilters = { ...EMPTY_FILTERS };
  for (const r of rows) {
    if (r.dimension === 'due_from' || r.dimension === 'due_to') {
      out[r.dimension] = (typeof r.value === 'string' ? r.value : null) as any;
    } else if (Array.isArray(r.value)) {
      (out as any)[r.dimension] = r.value.filter((v): v is string => typeof v === 'string');
    }
  }
  return out;
}

/** Translate the modal's DraftFilters into the BoardFilter[] for persistence.
 *  Empty arrays / null dates produce no row. */
function boardFiltersFromDraft(boardId: string, f: DraftFilters): Array<Omit<BoardFilter, 'id' | 'createdAt'>> {
  const out: Array<Omit<BoardFilter, 'id' | 'createdAt'>> = [];
  const multiDims: Array<keyof DraftFilters> = ['task_type', 'assignee', 'priority', 'label', 'created_by'];
  for (const dim of multiDims) {
    const v = f[dim] as string[];
    if (Array.isArray(v) && v.length > 0) {
      out.push({ boardId, dimension: dim as BoardFilterDimension, value: v });
    }
  }
  if (f.due_from) out.push({ boardId, dimension: 'due_from', value: f.due_from });
  if (f.due_to)   out.push({ boardId, dimension: 'due_to',   value: f.due_to });
  return out;
}

export function BoardConfigModal({ boardId, ownerId, wsUsers = [], onClose, onSaved, onDeleted }: Props) {
  const { t } = useTranslation();
  const dialog = useDialog();

  const isNew = boardId === null;

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('view_kanban');
  const [visibility, setVisibility] = useState<BoardVisibility>('personal');
  const [columns, setColumns] = useState<DraftColumn[]>([]);
  const [filters, setFilters] = useState<DraftFilters>(EMPTY_FILTERS);
  const [allStates, setAllStates] = useState<State[]>([]);
  const [allTaskTypes, setAllTaskTypes] = useState<TaskType[]>([]);
  const [allPriorities, setAllPriorities] = useState<Priority[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originalColumnIds, setOriginalColumnIds] = useState<Set<string>>(new Set());
  const [originalBoard, setOriginalBoard] = useState<KanbanBoard | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  /** Index of the column whose "states" dropdown is open. Null = closed. */
  const [openStateMenuColIdx, setOpenStateMenuColIdx] = useState<number | null>(null);
  /** Which filter dropdown is currently open (one at a time). */
  const [openFilter, setOpenFilter] = useState<BoardFilterDimension | null>(null);
  const [members, setMembers] = useState<DraftMember[]>([]);
  const [originalMemberIds, setOriginalMemberIds] = useState<Set<string>>(new Set());
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);

  /** Initial load — fetch states + task types + priorities + (if editing)
   *  the board itself, its columns, and its filters. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [states, types, prs] = await Promise.all([
          stateRepo.findAll(),
          taskTypeRepo.findAll(),
          priorityRepo.ensureDefaults(ownerId),
        ]);
        if (cancelled) return;
        setAllStates(states);
        setAllTaskTypes(types);
        setAllPriorities(prs);

        if (isNew) {
          setColumns(buildDefaultColumns(states));
          setLoading(false);
          return;
        }

        const [board, cols, savedFilters, savedMembers] = await Promise.all([
          boardRepo.findById(boardId!),
          boardColumnRepo.findByBoard(boardId!),
          boardFilterRepo.findByBoard(boardId!),
          boardMemberRepo.findByBoard(boardId!),
        ]);
        if (cancelled) return;
        if (!board) {
          setError(t('vectorLogic.boardNotFound'));
          setLoading(false);
          return;
        }
        setOriginalBoard(board);
        setName(board.name);
        setIcon(board.icon ?? 'view_kanban');
        setVisibility(board.visibility);
        const sorted = [...cols].sort((a, b) => a.sortOrder - b.sortOrder);
        setColumns(sorted.map<DraftColumn>(c => ({
          id: c.id,
          name: c.name,
          stateIds: [...c.stateIds],
          sortOrder: c.sortOrder,
          wipLimit: c.wipLimit,
        })));
        setOriginalColumnIds(new Set(sorted.map(c => c.id)));
        setFilters(filtersFromBoardFilters(savedFilters));
        setMembers(savedMembers.map<DraftMember>(m => ({
          id: m.id,
          userId: m.userId,
          permission: m.permission,
        })));
        setOriginalMemberIds(new Set(savedMembers.map(m => m.id)));
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load board');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [boardId, isNew, ownerId, t]);

  const stateById = useMemo(() => {
    const m = new Map<string, State>();
    allStates.forEach(s => m.set(s.id, s));
    return m;
  }, [allStates]);

  /** Every state id already used by SOME column on the board. A state can
   *  only belong to one column at a time (otherwise tasks would appear in
   *  two places at once). */
  const usedStateIds = useMemo(
    () => new Set(columns.flatMap(c => c.stateIds)),
    [columns],
  );

  const isOwner = isNew || (originalBoard?.ownerId === ownerId);
  const isDefaultBoard = !!originalBoard?.isDefault;
  // The auto-created default board cannot be deleted; it is always present.
  const canDelete = !isNew && isOwner && !isDefaultBoard;

  /** Users who are not the owner and not already a member. */
  const usedUserIds = useMemo(
    () => new Set([ownerId, ...members.map(m => m.userId)]),
    [ownerId, members],
  );
  const availableUsersForMember = useMemo(
    () => wsUsers.filter(u => !usedUserIds.has(u.id)),
    [wsUsers, usedUserIds],
  );

  const handleAddMember = (userId: string) => {
    setMembers(prev => [...prev, { userId, permission: 'use' }]);
    setMemberPickerOpen(false);
  };
  const handleRemoveMember = (idx: number) => {
    setMembers(prev => prev.filter((_, i) => i !== idx));
  };
  const handleMemberPermissionChange = (idx: number, permission: BoardPermission) => {
    setMembers(prev => prev.map((m, i) => i === idx ? { ...m, permission } : m));
  };

  const handleAddColumn = () => {
    setColumns(prev => [
      ...prev,
      {
        name: t('vectorLogic.boardNewColumnName'),
        stateIds: [],
        sortOrder: prev.length,
        wipLimit: null,
      },
    ]);
  };

  const handleRemoveColumn = (idx: number) => {
    setColumns(prev => prev
      .filter((_, i) => i !== idx)
      .map((c, i) => ({ ...c, sortOrder: i })));
  };

  const handleColumnNameChange = (idx: number, name: string) => {
    setColumns(prev => prev.map((c, i) => i === idx ? { ...c, name } : c));
  };

  const handleColumnToggleState = (idx: number, stateId: string) => {
    setColumns(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      const has = c.stateIds.includes(stateId);
      return { ...c, stateIds: has ? c.stateIds.filter(x => x !== stateId) : [...c.stateIds, stateId] };
    }));
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
          icon: icon || null,
          visibility,
          isDefault: false,
        });
      } else {
        await boardRepo.update(boardId!, {
          name: trimmedName,
          icon: icon || null,
          visibility,
        });
        board = { ...originalBoard!, name: trimmedName, icon: icon || null, visibility };
      }

      // Diff columns: existing → update or remove; new → create.
      const currentIds = new Set(columns.filter(c => c.id).map(c => c.id!));
      const removedIds = [...originalColumnIds].filter(id => !currentIds.has(id));
      await Promise.all(removedIds.map(id => boardColumnRepo.remove(id)));

      for (const col of columns) {
        if (col.id) {
          await boardColumnRepo.update(col.id, {
            name: col.name,
            sortOrder: col.sortOrder,
            wipLimit: col.wipLimit,
            stateIds: col.stateIds,
          });
        } else {
          await boardColumnRepo.create({
            boardId: board.id,
            name: col.name,
            sortOrder: col.sortOrder,
            wipLimit: col.wipLimit,
            stateIds: col.stateIds,
          });
        }
      }

      // Filters: replace all rows for this board atomically.
      await boardFilterRepo.replaceAll(board.id, boardFiltersFromDraft(board.id, filters));

      // Members: only meaningful when visibility is 'shared'. If the board
      // flipped (or stays) personal, drop all memberships per spec.
      if (visibility === 'personal') {
        await boardMemberRepo.removeAllByBoard(board.id);
      } else {
        const currentMemberIds = new Set(members.filter(m => m.id).map(m => m.id!));
        const removed = [...originalMemberIds].filter(id => !currentMemberIds.has(id));
        await Promise.all(removed.map(id => boardMemberRepo.remove(id)));
        for (const m of members) {
          await boardMemberRepo.upsert({
            boardId: board.id,
            userId: m.userId,
            permission: m.permission,
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

              {/* Name + icon */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={S.label}>{t('vectorLogic.boardName')}</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <IconPicker
                    value={icon}
                    color="var(--ac-strong)"
                    onChange={setIcon}
                    size={24}
                  />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('vectorLogic.boardNamePlaceholder')}
                    style={{ ...S.input, flex: 1 }}
                    autoFocus
                  />
                </div>
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

              {/* Permissions (only when shared) */}
              {visibility === 'shared' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ ...S.label, flex: 1 }}>{t('vectorLogic.boardPermissions')}</label>
                    <div style={{ position: 'relative' }}>
                      <button
                        type="button"
                        onClick={() => setMemberPickerOpen(v => !v)}
                        disabled={availableUsersForMember.length === 0}
                        style={S.smallButton}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--ac-strong)' }}>add</span>
                        {t('vectorLogic.boardAddMember')}
                      </button>
                      {memberPickerOpen && (
                        <div style={S.statePickerPanel}>
                          {availableUsersForMember.length === 0 ? (
                            <div style={{ padding: 10, fontSize: 12, color: 'var(--tx3)' }}>
                              {t('vectorLogic.boardNoMoreUsers')}
                            </div>
                          ) : (
                            availableUsersForMember.map(u => (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => handleAddMember(u.id)}
                                style={S.statePickerItem}
                              >
                                <span style={{ flex: 1 }}>{u.name || u.email}</span>
                                <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{u.email}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--tx3)', margin: 0 }}>
                    {t('vectorLogic.boardPermissionsHelp')}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {members.length === 0 && (
                      <div style={{ padding: 12, fontSize: 12, color: 'var(--tx3)', background: 'var(--sf2)', borderRadius: 8 }}>
                        {t('vectorLogic.boardNoMembers')}
                      </div>
                    )}
                    {members.map((m, idx) => {
                      const u = wsUsers.find(x => x.id === m.userId);
                      return (
                        <div key={m.id ?? `new-${idx}-${m.userId}`} style={S.memberRow}>
                          <span style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: 'var(--ac-dim)', color: 'var(--ac-strong)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700,
                          }}>
                            {(u?.name || u?.email || '?').slice(0, 2).toUpperCase()}
                          </span>
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {u?.name || u?.email || m.userId}
                            </span>
                            {u?.name && (
                              <span style={{ fontSize: 11, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {u.email}
                              </span>
                            )}
                          </div>
                          <select
                            value={m.permission}
                            onChange={(e) => handleMemberPermissionChange(idx, e.target.value as BoardPermission)}
                            style={S.permissionSelect}
                          >
                            <option value="use">{t('vectorLogic.boardPermissionUse')}</option>
                            <option value="edit">{t('vectorLogic.boardPermissionEdit')}</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(idx)}
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
              )}

              {/* Columns */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ ...S.label, flex: 1 }}>{t('vectorLogic.boardColumns')}</label>
                  <button
                    type="button"
                    onClick={handleAddColumn}
                    style={S.smallButton}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--ac-strong)' }}>add</span>
                    {t('vectorLogic.boardAddColumn')}
                  </button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--tx3)', margin: 0 }}>
                  {t('vectorLogic.boardColumnsHelp')}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {columns.length === 0 && (
                    <div style={{ padding: 12, fontSize: 12, color: 'var(--tx3)', background: 'var(--sf2)', borderRadius: 8 }}>
                      {t('vectorLogic.boardNeedAtLeastOneColumn')}
                    </div>
                  )}
                  {columns.map((col, idx) => {
                    const isMenuOpen = openStateMenuColIdx === idx;
                    const colStates = col.stateIds
                      .map(id => stateById.get(id))
                      .filter((s): s is State => !!s);
                    const summary = colStates.length === 0
                      ? t('vectorLogic.boardColumnNoStates')
                      : colStates.map(s => s.name).join(' · ');
                    const accent = colStates[0]?.color || 'var(--tx3)';
                    return (
                      <div
                        key={col.id ?? `new-${idx}`}
                        draggable
                        onDragStart={handleDragStart(idx)}
                        onDragOver={handleDragOver(idx)}
                        onDrop={handleDrop(idx)}
                        onDragEnd={handleDragEnd}
                        style={{
                          ...S.columnRow,
                          flexDirection: 'column',
                          alignItems: 'stretch',
                          gap: 8,
                          opacity: dragIdx === idx ? 0.4 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="material-symbols-outlined"
                                style={{ fontSize: 16, color: 'var(--tx3)', cursor: 'grab' }}>
                            drag_indicator
                          </span>
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: accent, flexShrink: 0,
                          }} />
                          <input
                            type="text"
                            value={col.name}
                            onChange={(e) => handleColumnNameChange(idx, e.target.value)}
                            placeholder={t('vectorLogic.boardColumnNamePlaceholder')}
                            aria-label={t('vectorLogic.boardColumnName')}
                            style={S.columnNameInput}
                          />
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
                        <div style={{ position: 'relative', paddingLeft: 26 }}>
                          <button
                            type="button"
                            onClick={() => setOpenStateMenuColIdx(isMenuOpen ? null : idx)}
                            style={S.statesPickerButton}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--tx3)' }}>label</span>
                            <span style={{
                              flex: 1, color: colStates.length === 0 ? 'var(--tx3)' : 'var(--tx)',
                              fontSize: 12, fontWeight: 500,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {summary}
                            </span>
                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--tx3)' }}>
                              keyboard_arrow_down
                            </span>
                          </button>
                          {isMenuOpen && (
                            <div style={{ ...S.statePickerPanel, top: 'calc(100% + 4px)', left: 26, right: 0 }}>
                              {allStates.length === 0 ? (
                                <div style={{ padding: 10, fontSize: 12, color: 'var(--tx3)' }}>—</div>
                              ) : (
                                allStates.map(s => {
                                  const checked = col.stateIds.includes(s.id);
                                  const usedElsewhere = !checked && usedStateIds.has(s.id);
                                  return (
                                    <label
                                      key={s.id}
                                      style={{
                                        ...S.statePickerItem,
                                        opacity: usedElsewhere ? 0.4 : 1,
                                        cursor: usedElsewhere ? 'not-allowed' : 'pointer',
                                      }}
                                      title={usedElsewhere ? t('vectorLogic.boardStateAlreadyUsed') : ''}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={usedElsewhere}
                                        onChange={() => handleColumnToggleState(idx, s.id)}
                                        style={{ accentColor: 'var(--ac-strong)' }}
                                      />
                                      <span style={{
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: s.color || 'var(--tx3)',
                                      }} />
                                      <span style={{ flex: 1, color: 'var(--tx)' }}>{s.name}</span>
                                      <span style={S.catLabel}>{s.category}</span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Filters */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={S.label}>{t('vectorLogic.boardFilters')}</label>
                <p style={{ fontSize: 12, color: 'var(--tx3)', margin: 0 }}>
                  {t('vectorLogic.boardFiltersHelp')}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <FilterMultiRow
                    dim="task_type"
                    label={t('vectorLogic.boardFilterTaskType')}
                    options={allTaskTypes.map(tt => ({ id: tt.id, label: tt.name }))}
                    selected={filters.task_type}
                    open={openFilter === 'task_type'}
                    onToggleOpen={() => setOpenFilter(o => o === 'task_type' ? null : 'task_type')}
                    onChange={(v) => setFilters(f => ({ ...f, task_type: v }))}
                    emptyLabel={t('vectorLogic.boardFilterAny')}
                  />
                  <FilterMultiRow
                    dim="assignee"
                    label={t('vectorLogic.boardFilterAssignee')}
                    options={wsUsers.map(u => ({ id: u.id, label: u.name || u.email }))}
                    selected={filters.assignee}
                    open={openFilter === 'assignee'}
                    onToggleOpen={() => setOpenFilter(o => o === 'assignee' ? null : 'assignee')}
                    onChange={(v) => setFilters(f => ({ ...f, assignee: v }))}
                    emptyLabel={t('vectorLogic.boardFilterAnyone')}
                  />
                  <FilterMultiRow
                    dim="priority"
                    label={t('vectorLogic.boardFilterPriority')}
                    options={allPriorities.map(p => ({ id: p.name, label: p.name }))}
                    selected={filters.priority}
                    open={openFilter === 'priority'}
                    onToggleOpen={() => setOpenFilter(o => o === 'priority' ? null : 'priority')}
                    onChange={(v) => setFilters(f => ({ ...f, priority: v }))}
                    emptyLabel={t('vectorLogic.boardFilterAny')}
                  />
                  <FilterMultiRow
                    dim="created_by"
                    label={t('vectorLogic.boardFilterCreatedBy')}
                    options={wsUsers.map(u => ({ id: u.id, label: u.name || u.email }))}
                    selected={filters.created_by}
                    open={openFilter === 'created_by'}
                    onToggleOpen={() => setOpenFilter(o => o === 'created_by' ? null : 'created_by')}
                    onChange={(v) => setFilters(f => ({ ...f, created_by: v }))}
                    emptyLabel={t('vectorLogic.boardFilterAnyone')}
                  />
                  <FilterDateRow
                    label={t('vectorLogic.boardFilterDueRange')}
                    from={filters.due_from}
                    to={filters.due_to}
                    onChangeFrom={(v) => setFilters(f => ({ ...f, due_from: v }))}
                    onChangeTo={(v) => setFilters(f => ({ ...f, due_to: v }))}
                  />
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

/* ── Filter row components ─────────────────────────────────────────────── */

interface FilterOption { id: string; label: string }

function FilterMultiRow({
  dim, label, options, selected, open, onToggleOpen, onChange, emptyLabel,
}: {
  dim: BoardFilterDimension;
  label: string;
  options: FilterOption[];
  selected: string[];
  open: boolean;
  onToggleOpen: () => void;
  onChange: (values: string[]) => void;
  emptyLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        onToggleOpen();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, onToggleOpen]);

  const summary = selected.length === 0
    ? emptyLabel
    : selected
        .map(id => options.find(o => o.id === id)?.label ?? id)
        .join(' · ');

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id));
    else onChange([...selected, id]);
  };

  return (
    <div ref={wrapRef} style={S.filterRow}>
      <span style={S.filterRowLabel}>{label}</span>
      <button
        type="button"
        onClick={onToggleOpen}
        style={S.filterRowButton}
      >
        <span style={{
          flex: 1, color: selected.length === 0 ? 'var(--tx3)' : 'var(--tx)',
          fontWeight: selected.length === 0 ? 400 : 500,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {summary}
        </span>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--tx3)' }}>
          keyboard_arrow_down
        </span>
      </button>
      {open && (
        <div style={S.filterDropdown}>
          {options.length === 0 ? (
            <div style={{ padding: 10, fontSize: 12, color: 'var(--tx3)' }}>—</div>
          ) : (
            options.map(o => {
              const checked = selected.includes(o.id);
              return (
                <label
                  key={o.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                    cursor: 'pointer', color: 'var(--tx)', fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(o.id)}
                    style={{ accentColor: 'var(--ac-strong)' }}
                  />
                  <span style={{ flex: 1 }}>{o.label}</span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function FilterDateRow({
  label, from, to, onChangeFrom, onChangeTo,
}: {
  label: string;
  from: string | null;
  to: string | null;
  onChangeFrom: (v: string | null) => void;
  onChangeTo: (v: string | null) => void;
}) {
  return (
    <div style={S.filterRow}>
      <span style={S.filterRowLabel}>{label}</span>
      <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="date"
          value={from ?? ''}
          onChange={(e) => onChangeFrom(e.target.value || null)}
          style={S.dateInput}
        />
        <span style={{ color: 'var(--tx3)', fontSize: 12 }}>→</span>
        <input
          type="date"
          value={to ?? ''}
          onChange={(e) => onChangeTo(e.target.value || null)}
          style={S.dateInput}
        />
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
  columnNameInput: {
    flex: 1, background: 'var(--sf3)', border: '1px solid var(--bd)',
    borderRadius: 6, padding: '6px 10px', color: 'var(--tx)',
    fontSize: 13, fontWeight: 500, fontFamily: 'inherit', outline: 'none',
    minWidth: 0,
  },
  statesPickerButton: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 10px', background: 'var(--sf3)', border: '1px solid var(--bd)',
    borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
    color: 'var(--tx2)', fontSize: 12, fontWeight: 500,
    minWidth: 0,
  },
  filterRow: {
    position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
    background: 'var(--sf2)', borderRadius: 8, padding: '10px 14px',
  },
  memberRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: 'var(--sf2)', borderRadius: 8, padding: '8px 12px',
  },
  permissionSelect: {
    background: 'var(--sf3)', border: '1px solid var(--bd)', borderRadius: 6,
    padding: '4px 8px', color: 'var(--tx)', fontSize: 12, fontWeight: 600,
    fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
  },
  filterRowLabel: {
    fontSize: 12, fontWeight: 500, color: 'var(--tx2)', width: 120, flexShrink: 0,
  },
  filterRowButton: {
    flex: 1, display: 'flex', alignItems: 'center', gap: 10,
    padding: '4px 8px', background: 'transparent', border: 'none',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
    minWidth: 0,
  },
  filterDropdown: {
    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
    background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 8,
    boxShadow: '0 12px 32px rgba(0,0,0,.4)', maxHeight: 240, overflowY: 'auto',
    padding: '4px 0',
  },
  dateInput: {
    flex: 1, padding: '6px 10px', background: 'var(--sf3)', border: '1px solid var(--bd)',
    borderRadius: 6, color: 'var(--tx)', fontSize: 13, fontFamily: 'inherit',
    outline: 'none', colorScheme: 'dark',
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
