import type { Priority } from '../entities/Priority';

export interface IPriorityRepo {
  list(userId: string): Promise<Priority[]>;
  create(p: Omit<Priority, 'id' | 'createdAt'>): Promise<Priority>;
  update(id: string, patch: Partial<Priority>): Promise<void>;
  remove(id: string): Promise<void>;
  /** Convenience: seed the user's list with sensible defaults if it's empty. */
  ensureDefaults(userId: string): Promise<Priority[]>;
}
