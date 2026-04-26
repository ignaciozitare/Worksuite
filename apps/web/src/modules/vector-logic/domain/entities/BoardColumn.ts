export interface BoardColumn {
  id: string;
  boardId: string;
  /** User-chosen column label, displayed in the board header. */
  name: string;
  sortOrder: number;
  wipLimit: number | null;
  /** State ids from the library that belong to this column. A task whose
   *  current state is in this list is rendered in this column. */
  stateIds: string[];
  createdAt: string;
}
