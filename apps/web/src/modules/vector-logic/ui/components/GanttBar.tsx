import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Task } from '../../domain/entities/Task';
import type { SchemaField } from '../../domain/entities/FieldType';

export interface GanttBarProps {
  task: Task;
  schema: SchemaField[];
  /** Direct subtasks of this task. Empty if leaf or unknown. */
  subtasks?: Task[];
  /** state.id → state.category map; used to mark a subtask as DONE. */
  stateCategoryById?: Map<string, string>;
  /** Color from state.color (or fallback). Used for the bar's tint. */
  stateColor?: string | null;
  /** Pixel x where the bar starts inside the timeline area. */
  left: number;
  /** Pixel width of the bar. */
  width: number;
  /** Disable drag/resize (e.g. read-only role). */
  readOnly?: boolean;
  onClick?: () => void;
  /** Persist a date change after a drag/resize ends. */
  onDatesChange?: (next: { startDate: string; dueDate: string }) => void;
  /** Pixels per day — needed to translate cursor delta to date delta. */
  dayWidth: number;
}

/**
 * A single Gantt bar with two stacked progress fills inside it:
 *
 *   ┌─────────────────────────────────┐
 *   │▓▓▓▓▓▓▓▓░░░░░░░  ToDo % (green)  │
 *   │▓▓▓▓░░░░░░░░░░░  Subtask % (purple)
 *   └─────────────────────────────────┘
 *
 * Stacked vertically: ToDo on top, subtask on bottom. Each occupies half
 * the bar's height when both apply; full height when only one source.
 * If neither, the bar is rendered flat in the state color so the user
 * still sees the date range.
 *
 * Drag the body to move start+due (kept duration). Drag the left/right
 * handles to resize start or due. The bar emits `onDatesChange` only
 * once on mouseup, so the parent persists a single DB write per gesture.
 */
export function GanttBar({
  task, schema, subtasks = [], stateCategoryById,
  stateColor, left, width, readOnly = false,
  onClick, onDatesChange, dayWidth,
}: GanttBarProps) {
  const [drag, setDrag] = useState<
    | { type: 'move' | 'left' | 'right'; startX: number; origStart: string; origDue: string }
    | null
  >(null);
  const [previewLeft, setPreviewLeft] = useState<number | null>(null);
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  /** Track whether the gesture moved at least one day so a clean click
   *  (no movement) still opens the modal instead of being interpreted
   *  as a no-op drag. */
  const movedRef = useRef(false);

  const todoItems = schema
    .filter(f => f.fieldType === 'todo')
    .map(f => (task.data ?? {})[f.id])
    .filter((v): v is Array<{ checked?: boolean }> => Array.isArray(v) && v.length > 0)
    .flat();
  const todoTotal = todoItems.length;
  const todoDone = todoItems.filter(it => !!it?.checked).length;
  const todoPct = todoTotal > 0 ? todoDone / todoTotal : null;

  const subtaskTotal = subtasks.length;
  const subtaskDone = subtasks.filter(s => {
    const cat = s.stateId ? stateCategoryById?.get(s.stateId) ?? null : null;
    return cat === 'DONE';
  }).length;
  const subtaskPct = subtaskTotal > 0 ? subtaskDone / subtaskTotal : null;

  const hasTodo = todoPct !== null;
  const hasSubtask = subtaskPct !== null;

  // Drag bookkeeping. The bar visually previews via `previewLeft/previewWidth`
  // (transient) so the parent doesn't have to re-render mid-gesture. The DB
  // write happens once on mouseup via onDatesChange.
  useEffect(() => {
    if (!drag) return;
    const handleMove = (e: MouseEvent) => {
      const dxPx = e.clientX - drag.startX;
      const dxDays = Math.round(dxPx / dayWidth);
      if (dxDays !== 0) movedRef.current = true;
      if (drag.type === 'move') {
        setPreviewLeft(left + dxDays * dayWidth);
        setPreviewWidth(width);
      } else if (drag.type === 'left') {
        const newLeft = left + dxDays * dayWidth;
        const newWidth = width - dxDays * dayWidth;
        if (newWidth >= dayWidth) { setPreviewLeft(newLeft); setPreviewWidth(newWidth); }
      } else {
        const newWidth = width + dxDays * dayWidth;
        if (newWidth >= dayWidth) { setPreviewLeft(left); setPreviewWidth(newWidth); }
      }
    };
    const handleUp = (e: MouseEvent) => {
      const dxPx = e.clientX - drag.startX;
      const dxDays = Math.round(dxPx / dayWidth);
      let nextStart = drag.origStart;
      let nextDue = drag.origDue;
      if (dxDays !== 0) {
        if (drag.type === 'move') {
          nextStart = addDays(drag.origStart, dxDays);
          nextDue = addDays(drag.origDue, dxDays);
        } else if (drag.type === 'left') {
          const candidate = addDays(drag.origStart, dxDays);
          if (compareDate(candidate, drag.origDue) <= 0) nextStart = candidate;
        } else {
          const candidate = addDays(drag.origDue, dxDays);
          if (compareDate(drag.origStart, candidate) <= 0) nextDue = candidate;
        }
        if (nextStart !== drag.origStart || nextDue !== drag.origDue) {
          onDatesChange?.({ startDate: nextStart, dueDate: nextDue });
        }
      }
      setDrag(null);
      setPreviewLeft(null);
      setPreviewWidth(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [drag, dayWidth, left, width, onDatesChange]);

  const startDrag = (type: 'move' | 'left' | 'right') => (e: React.MouseEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    movedRef.current = false;
    setDrag({
      type,
      startX: e.clientX,
      origStart: task.startDate ?? '',
      origDue: task.dueDate ?? '',
    });
  };

  const renderLeft = previewLeft ?? left;
  const renderWidth = previewWidth ?? width;
  const tint = stateColor || 'var(--ac)';

  const wrapperStyle: CSSProperties = {
    position: 'absolute',
    left: renderLeft,
    top: '50%',
    transform: 'translateY(-50%)',
    width: renderWidth,
    height: 28,
    background: `${tint}22`,
    border: `1px solid ${tint}`,
    borderRadius: 6,
    cursor: readOnly ? 'pointer' : drag?.type === 'move' ? 'grabbing' : 'grab',
    userSelect: 'none',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <div
      style={wrapperStyle}
      onMouseDown={startDrag('move')}
      onClick={(e) => {
        // Only treat as click when the gesture didn't actually move.
        if (movedRef.current) return;
        e.stopPropagation();
        onClick?.();
      }}
    >
      {/* Resize handles — narrow grab zones at left/right edges. */}
      {!readOnly && (
        <>
          <div
            onMouseDown={startDrag('left')}
            style={{
              position: 'absolute', left: 0, top: 0, width: 5, height: '100%',
              cursor: 'col-resize', background: `${tint}55`, zIndex: 2,
            }}
          />
          <div
            onMouseDown={startDrag('right')}
            style={{
              position: 'absolute', right: 0, top: 0, width: 5, height: '100%',
              cursor: 'col-resize', background: `${tint}55`, zIndex: 2,
            }}
          />
        </>
      )}

      {/* Progress fills — stacked. ToDo on top, subtask on bottom. Each row
          height splits in half when both kinds apply, full height otherwise. */}
      {(hasTodo || hasSubtask) && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          pointerEvents: 'none',
        }}>
          {hasTodo && (
            <div style={{
              flex: 1,
              background: 'transparent',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: 0, bottom: 0, left: 0,
                width: `${(todoPct as number) * 100}%`,
                background: 'var(--green)',
                opacity: 0.7,
                transition: 'width .15s',
              }} />
            </div>
          )}
          {hasSubtask && (
            <div style={{
              flex: 1,
              background: 'transparent',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: 0, bottom: 0, left: 0,
                width: `${(subtaskPct as number) * 100}%`,
                background: 'var(--purple)',
                opacity: 0.7,
                transition: 'width .15s',
              }} />
            </div>
          )}
        </div>
      )}

      {/* Code label inside the bar — small, centered vertically. Truncates
          when the bar is too narrow. */}
      {task.code && renderWidth > 60 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center',
          padding: '0 10px',
          fontSize: 'var(--fs-2xs)', fontWeight: 700,
          color: 'var(--tx)',
          letterSpacing: '.04em',
          pointerEvents: 'none',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {task.code}
        </div>
      )}
    </div>
  );
}

// ── Date helpers (local — no external dep) ───────────────────────────────────

/** Add `n` days to an ISO yyyy-mm-dd string, returning a new ISO string. */
function addDays(iso: string, n: number): string {
  if (!iso) return iso;
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function compareDate(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
