export type BoardPermission = 'use' | 'edit';

export interface BoardMember {
  id: string;
  boardId: string;
  userId: string;
  permission: BoardPermission;
  createdAt: string;
}
