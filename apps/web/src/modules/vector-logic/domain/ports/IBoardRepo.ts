import type { KanbanBoard } from '../entities/KanbanBoard';

export interface IBoardRepo {
  /** Boards the current authenticated user can see (RLS-filtered). */
  findAccessible(): Promise<KanbanBoard[]>;
  findById(id: string): Promise<KanbanBoard | null>;
  create(draft: Omit<KanbanBoard, 'id' | 'createdAt' | 'updatedAt'>): Promise<KanbanBoard>;
  update(id: string, patch: Partial<KanbanBoard>): Promise<void>;
  remove(id: string): Promise<void>;
}
