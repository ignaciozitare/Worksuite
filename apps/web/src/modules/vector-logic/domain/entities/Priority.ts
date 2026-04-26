export interface Priority {
  id: string;
  userId: string;
  name: string;
  color: string;
  /** Optional Material Symbols icon name (e.g. 'priority_high'). */
  icon?: string | null;
  sortOrder: number;
  createdAt: string;
}
