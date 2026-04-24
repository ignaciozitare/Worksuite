import type { TaskTypeHierarchy } from '../entities/TaskTypeHierarchy';

export interface ITaskTypeHierarchyRepo {
  listAll(): Promise<TaskTypeHierarchy[]>;
  listChildrenOfType(parentTypeId: string): Promise<TaskTypeHierarchy[]>;
  create(draft: Omit<TaskTypeHierarchy, 'id' | 'createdAt'>): Promise<TaskTypeHierarchy>;
  remove(id: string): Promise<void>;
}
