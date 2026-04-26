import type { BoardColumn } from '../entities/BoardColumn';

export interface IBoardColumnRepo {
  findByBoard(boardId: string): Promise<BoardColumn[]>;
  create(draft: Omit<BoardColumn, 'id' | 'createdAt'>): Promise<BoardColumn>;
  update(id: string, patch: Partial<BoardColumn>): Promise<void>;
  remove(id: string): Promise<void>;
  reorder(updates: Array<{ id: string; sortOrder: number }>): Promise<void>;
}
