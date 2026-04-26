import type { BoardFilter } from '../entities/BoardFilter';

export interface IBoardFilterRepo {
  findByBoard(boardId: string): Promise<BoardFilter[]>;
  create(draft: Omit<BoardFilter, 'id' | 'createdAt'>): Promise<BoardFilter>;
  update(id: string, patch: Partial<BoardFilter>): Promise<void>;
  remove(id: string): Promise<void>;
  /** Replace all filters for a board atomically (delete + insert). */
  replaceAll(boardId: string, drafts: Array<Omit<BoardFilter, 'id' | 'createdAt'>>): Promise<BoardFilter[]>;
}
