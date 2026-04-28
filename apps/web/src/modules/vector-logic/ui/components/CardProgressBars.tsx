import type { Task } from '../../domain/entities/Task';
import type { SchemaField } from '../../domain/entities/FieldType';

export interface CardProgressBarsProps {
  task: Task;
  schema: SchemaField[];
  /** Direct children of this task. Empty if the task is a leaf. */
  subtasks?: Task[];
  /** Map state.id → state.category. Used to mark a subtask as DONE. */
  stateCategoryById?: Map<string, string>;
}

/**
 * Stack of segmented micro-bars rendered at the bottom edge of a TaskCard.
 *
 *   - One bar per ToDo field with at least 1 item (N segments = N items).
 *   - One bar for direct subtasks (N segments = N children).
 *
 * Renders nothing when both the ToDo bars and the subtask bar would be
 * empty, so cards without progress data keep their clean baseline.
 *
 * Uses CSS variable colors (--green, --sf2, --bd) so light/dark themes
 * pick the right contrast automatically.
 */
export function CardProgressBars({ task, schema, subtasks = [], stateCategoryById }: CardProgressBarsProps) {
  // ToDo bars use green for the "checked" state — they're checklist progress.
  // The subtasks bar uses purple to differentiate visually (subtasks are tasks,
  // not checklist items, so a different hue is intentional).
  const todoBars = schema
    .filter(f => f.fieldType === 'todo')
    .sort((a, b) => a.order - b.order)
    .map(f => {
      const items = (task.data ?? {})[f.id];
      if (!Array.isArray(items) || items.length === 0) return null;
      const segments = (items as Array<{ checked?: boolean }>).map(it => !!it?.checked);
      return { key: `todo-${f.id}`, segments, color: 'var(--green)' as string };
    })
    .filter((b): b is { key: string; segments: boolean[]; color: string } => b !== null);

  const subtaskBar = subtasks.length > 0
    ? {
        key: 'subtasks',
        segments: subtasks.map(c => {
          const cat = c.stateId ? (stateCategoryById?.get(c.stateId) ?? null) : null;
          return cat === 'DONE';
        }),
        color: 'var(--purple)' as string,
      }
    : null;

  const bars = [...todoBars];
  if (subtaskBar) bars.push(subtaskBar);
  if (bars.length === 0) return null;

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        padding: 0,
        pointerEvents: 'none',
        borderBottomLeftRadius: 'inherit',
        borderBottomRightRadius: 'inherit',
        overflow: 'hidden',
      }}
    >
      {bars.map(bar => (
        <div
          key={bar.key}
          style={{
            display: 'flex',
            gap: 1,
            height: 3,
            background: 'var(--bd)',
          }}
        >
          {bar.segments.map((done, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                background: done ? bar.color : 'var(--sf2)',
                transition: 'background-color .15s',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Inline mini-bar rendered next to the `done/total` chip in the meta-row.
 *
 * Same color logic as the bottom stack but tiny, so a card chip like
 * `4/4` reads as both numeric ("4 of 4") and visual ("all green") at the
 * same glance.
 */
export function MiniProgressBar({
  segments,
}: {
  segments: boolean[];
}) {
  if (segments.length === 0) return null;
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        gap: 1,
        height: 4,
        marginLeft: 4,
        verticalAlign: 'middle',
      }}
    >
      {segments.map((done, i) => (
        <span
          key={i}
          style={{
            width: 4,
            height: '100%',
            background: done ? 'var(--green)' : 'var(--sf2)',
            borderRadius: 1,
          }}
        />
      ))}
    </span>
  );
}
