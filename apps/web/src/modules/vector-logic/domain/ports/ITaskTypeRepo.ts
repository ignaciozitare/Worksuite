import type { TaskType } from '../entities/TaskType';

export interface ITaskTypeRepo {
  findAll(): Promise<TaskType[]>;
  create(draft: Omit<TaskType, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskType>;
  update(id: string, patch: Partial<TaskType>): Promise<void>;
  remove(id: string): Promise<void>;
}
