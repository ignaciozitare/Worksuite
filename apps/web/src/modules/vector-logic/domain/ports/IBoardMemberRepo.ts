import type { BoardMember } from '../entities/BoardMember';

export interface IBoardMemberRepo {
  findByBoard(boardId: string): Promise<BoardMember[]>;
  /** Memberships of a single user across every board they belong to. */
  findForUser(userId: string): Promise<BoardMember[]>;
  upsert(draft: Omit<BoardMember, 'id' | 'createdAt'>): Promise<BoardMember>;
  remove(id: string): Promise<void>;
  /** Drop every membership for a board (used when visibility flips to 'personal'). */
  removeAllByBoard(boardId: string): Promise<void>;
}
