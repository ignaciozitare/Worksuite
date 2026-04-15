import type { Task } from '../entities/Task';

export interface ITaskRepo {
  findAll(): Promise<Task[]>;
  findByTaskType(taskTypeId: string): Promise<Task[]>;
  findById(id: string): Promise<Task | null>;
  create(draft: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>;
  update(id: string, patch: Partial<Task>): Promise<void>;
  moveToState(id: string, stateId: string): Promise<void>;
  reorder(updates: Array<{ id: string; sortOrder: number; stateId?: string | null }>): Promise<void>;
  remove(id: string): Promise<void>;
}
