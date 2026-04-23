/**
 * Priority is now a free-form string referencing a Priority entity by name.
 * Default seeded list is low/medium/high/urgent but users can customize their
 * own list via Settings → Priorities.
 */
export type TaskPriority = string;

export interface Task {
  id: string;
  code: string | null;
  taskTypeId: string;
  stateId: string | null;
  title: string;
  data: Record<string, unknown>;
  assigneeId: string | null;
  priority: TaskPriority | null;
  dueDate: string | null;
  stateEnteredAt: string;
  parentTaskId: string | null;
  archivedAt: string | null;
  archivedBy: string | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * What a caller supplies to create a new task.
 * Fields excluded entirely are DB-managed: `id`, `createdAt`, `updatedAt`,
 * `stateEnteredAt` (trigger), `archivedAt`, `archivedBy` (set via archive()).
 * Fields reduced to optional are the Phase-5 additions — existing callers
 * (pre-v2) can continue passing the v1 draft shape unchanged.
 */
export type TaskDraft = Omit<
  Task,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'stateEnteredAt'
  | 'archivedAt'
  | 'archivedBy'
  | 'code'
  | 'dueDate'
  | 'parentTaskId'
  | 'sortOrder'
> & {
  code?: string | null;
  dueDate?: string | null;
  parentTaskId?: string | null;
  sortOrder?: number;
};
