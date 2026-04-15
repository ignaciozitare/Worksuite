export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
  id: string;
  taskTypeId: string;
  stateId: string | null;
  title: string;
  data: Record<string, unknown>;
  assigneeId: string | null;
  priority: TaskPriority | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
