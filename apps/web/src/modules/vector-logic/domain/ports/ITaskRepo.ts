import type { Task } from '../entities/Task';

export interface ITaskRepo {
  findByTaskType(taskTypeId: string): Promise<Task[]>;
  findById(id: string): Promise<Task | null>;
  create(draft: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>;
  update(id: string, patch: Partial<Task>): Promise<void>;
  moveToState(id: string, stateId: string): Promise<void>;
  remove(id: string): Promise<void>;
}
