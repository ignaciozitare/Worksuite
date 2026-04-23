// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { Task } from '../../domain/entities/Task';
import type { TaskType } from '../../domain/entities/TaskType';
import { taskRepo, taskTypeRepo, stateRepo } from '../../container';

interface Props {
  currentUser: { id: string; name?: string; email: string; [k: string]: unknown };
}

type Mode = 'backlog' | 'history';

/**
 * Backlog / History view.
 *
 * - Backlog: tasks whose state.category === 'BACKLOG' (waiting to enter the workflow).
 * - History: tasks with archived_at IS NOT NULL (closed + auto-archived).
 *
 * Skeleton — visuals follow Pencil frame "VectorLogic/Backlog-History".
 * Full interactions (move-to-board, reopen, search) land in the Dev Agent pass.
 */
export function BacklogHistoryView({ currentUser }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('backlog');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [types, setTypes] = useState<TaskType[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [allTypes] = await Promise.all([taskTypeRepo.findAll()]);
      setTypes(allTypes);
      // Dev Agent: replace with repo methods `findBacklog(userId)` / `findArchived(userId)`.
      const list = mode === 'backlog'
        ? await (taskRepo as any).findBacklog?.(currentUser.id) ?? []
        : await (taskRepo as any).findArchived?.(currentUser.id) ?? [];
      setTasks(list);
      setLoading(false);
    })();
  }, [mode, currentUser.id]);

  const typeById = useMemo(() => {
    const m: Record<string, TaskType> = {};
    types.forEach((tt) => { m[tt.id] = tt; });
    return m;
  }, [types]);

  const filtered = useMemo(
    () => tasks.filter((t) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return t.title.toLowerCase().includes(q) || (t.code ?? '').toLowerCase().includes(q);
    }),
    [tasks, search],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx)', margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
            {t('vectorLogic.backlogHistory')}
          </h2>
          <p style={{ fontSize: 11, color: 'var(--tx3)', margin: '4px 0 0' }}>
            {t('vectorLogic.backlogHistoryDesc')}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 0, background: 'var(--sf2)', borderRadius: 8, padding: 3 }}>
          <ToggleBtn active={mode === 'backlog'} icon="inbox" label={t('vectorLogic.backlog')}
            count={mode === 'backlog' ? filtered.length : undefined}
            onClick={() => setMode('backlog')} />
          <ToggleBtn active={mode === 'history'} icon="history" label={t('vectorLogic.history')}
            count={mode === 'history' ? filtered.length : undefined}
            onClick={() => setMode('history')} />
        </div>

        <div style={{ flex: 1 }} />

        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'var(--sf2)',
          border: '1px solid var(--bd)', borderRadius: 8, padding: '6px 10px', width: 220,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--tx3)' }}>search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('vectorLogic.searchBacklog')}
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              color: 'var(--tx)', fontSize: 11, fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)' }}>
          {t('common.loading')}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--tx3)', background: 'var(--sf2)', borderRadius: 12 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: .25, display: 'block', marginBottom: 12 }}>inbox</span>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {mode === 'backlog' ? t('vectorLogic.noBacklog') : t('vectorLogic.noHistory')}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((task) => {
            const tt = typeById[task.taskTypeId];
            return (
              <div key={task.id} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                background: 'var(--sf2)', borderRadius: 12, border: '1px solid var(--bd)',
              }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--tx3)' }}>
                      {tt?.icon || 'task_alt'}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ac)', fontFamily: "'Space Grotesk',sans-serif" }}>
                      {task.code ?? '—'}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>
                    {task.title}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--tx3)' }}>
                    {t('vectorLogic.created')} {new Date(task.createdAt).toLocaleDateString()}
                  </div>
                </div>
                {/* Action — Dev Agent wires move-to-board / reopen. */}
                <button style={{
                  padding: '8px 12px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', border: 'none',
                  background: 'var(--ac-dim)', color: 'var(--ac)',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    {mode === 'backlog' ? 'move_item' : 'restart_alt'}
                  </span>
                  {mode === 'backlog' ? t('vectorLogic.toBoard') : t('vectorLogic.reopen')}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ToggleBtn({ active, icon, label, count, onClick }: {
  active: boolean; icon: string; label: string; count?: number; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: active ? 600 : 400,
      cursor: 'pointer', fontFamily: 'inherit', border: 'none',
      background: active ? 'var(--ac)' : 'transparent',
      color: active ? '#fff' : 'var(--tx3)',
      display: 'inline-flex', alignItems: 'center', gap: 5,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>
      {label}
      {count !== undefined && (
        <span style={{
          padding: '1px 6px', borderRadius: 10, fontSize: 9, fontWeight: 700,
          background: active ? 'rgba(255,255,255,.2)' : 'var(--sf3)',
          color: active ? '#fff' : 'var(--tx3)',
        }}>
          {count}
        </span>
      )}
    </button>
  );
}
