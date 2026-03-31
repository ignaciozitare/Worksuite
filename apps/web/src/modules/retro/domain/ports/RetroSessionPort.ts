export interface RetroSessionData {
  id: string;
  team_id: string;
  name: string;
  status: string;
  phase: string;
  votes_per_user: number;
  phase_times: Record<string, number>;
  created_by?: string;
  created_at: string;
  closed_at?: string;
  stats: Record<string, any>;
}

export interface SaveSessionInput {
  name: string;
  team_id: string;
  status: string;
  phase: string;
  votes_per_user: number;
  phase_times: Record<string, number>;
  stats: Record<string, any>;
}

export interface RetroSessionPort {
  findAll(): Promise<RetroSessionData[]>;
  save(input: SaveSessionInput): Promise<RetroSessionData>;
}
