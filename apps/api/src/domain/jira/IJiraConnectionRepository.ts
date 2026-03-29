export interface JiraConnection {
  user_id:      string;
  base_url:     string;
  email:        string;
  api_token:    string;
  connected_at: string | null;
  updated_at:   string | null;
}

export interface JiraConnectionSummary {
  base_url:     string;
  email:        string;
  connected_at: string | null;
  updated_at:   string | null;
}

export interface IJiraConnectionRepository {
  findByUserId(userId: string): Promise<JiraConnection | null>;
  findSummaryByUserId(userId: string): Promise<JiraConnectionSummary | null>;
  findAny(): Promise<JiraConnection | null>;
  upsert(conn: Omit<JiraConnection, 'connected_at' | 'updated_at'>): Promise<void>;
  updateUrlAndEmail(userId: string, baseUrl: string, email: string): Promise<void>;
  deleteByUserId(userId: string): Promise<void>;
}
