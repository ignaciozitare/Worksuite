export interface ActionableData {
  id: string;
  session_id?: string;
  card_id?: string;
  text: string;
  assignee: string;
  due_date?: string;
  status: string;
  priority: string;
  sort_order: number;
  team_id?: string;
  retro_name?: string;
  created_at?: string;
}

export interface RetroActionablePort {
  findAll(): Promise<ActionableData[]>;
  upsertMany(items: Omit<ActionableData, 'created_at'>[]): Promise<void>;
  updateStatus(id: string, status: string): Promise<void>;
}
