export type BoardFilterDimension =
  | 'task_type'
  | 'assignee'
  | 'priority'
  | 'label'
  | 'created_by'
  | 'due_from'
  | 'due_to';

export interface BoardFilter {
  id: string;
  boardId: string;
  dimension: BoardFilterDimension;
  /**
   * jsonb value. For multi-select dimensions (task_type, assignee, priority,
   * label, created_by) this is an array of ids/strings. For due_from / due_to
   * it is a single ISO date string. Stored as `unknown` here to keep the
   * domain port adapter-agnostic.
   */
  value: unknown;
  createdAt: string;
}
