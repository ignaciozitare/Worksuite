export type BoardVisibility = 'personal' | 'shared';

export interface KanbanBoard {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  icon: string | null;
  visibility: BoardVisibility;
  /** True for the auto-created "Smart Kanban" board. Cannot be deleted. */
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
