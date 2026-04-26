export interface BoardColumn {
  id: string;
  boardId: string;
  stateId: string;
  sortOrder: number;
  wipLimit: number | null;
  createdAt: string;
}
