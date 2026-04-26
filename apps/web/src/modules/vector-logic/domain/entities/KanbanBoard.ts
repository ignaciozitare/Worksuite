export type BoardVisibility = 'personal' | 'shared';

export interface KanbanBoard {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  icon: string | null;
  visibility: BoardVisibility;
  createdAt: string;
  updatedAt: string;
}
