/**
 * Priority is now a free-form string referencing a Priority entity by name.
 * Default seeded list is low/medium/high/urgent but users can customize their
 * own list via Settings → Priorities.
 */
export type TaskPriority = string;

export interface Task {
  id: string;
  taskTypeId: string;
  stateId: string | null;
  title: string;
  data: Record<string, unknown>;
  assigneeId: string | null;
  priority: TaskPriority | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
