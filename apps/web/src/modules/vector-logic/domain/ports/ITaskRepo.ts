import type { Task, TaskDraft } from '../entities/Task';

export interface ITaskRepo {
  findAll(): Promise<Task[]>;
  findByTaskType(taskTypeId: string): Promise<Task[]>;
  findById(id: string): Promise<Task | null>;
  /** Tasks whose current state has category='BACKLOG' and are not archived. */
  findBacklog(): Promise<Task[]>;
  /** Archived tasks (archived_at IS NOT NULL), most recently archived first. */
  findArchived(): Promise<Task[]>;
  /** Direct children of a parent task (one level only). */
  findChildren(parentTaskId: string): Promise<Task[]>;
  create(draft: TaskDraft): Promise<Task>;
  update(id: string, patch: Partial<Task>): Promise<void>;
  moveToState(id: string, stateId: string): Promise<void>;
  reorder(updates: Array<{ id: string; sortOrder: number; stateId?: string | null }>): Promise<void>;
  /** Send to History: set archived_at=now() and archived_by=userId. */
  archive(id: string, userId: string): Promise<void>;
  /** Restore from History: clear archived_at/archived_by and move to target state. */
  reopen(id: string, stateId: string): Promise<void>;
  remove(id: string): Promise<void>;
}
