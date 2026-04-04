export interface ReservationHistoryEntry {
  id: string;
  reservation_id: string;
  environment_id: string;
  environment_name: string;
  reserved_by_user_id: string;
  reserved_by_name: string;
  jira_issue_keys: string[];
  description?: string;
  planned_start: string;
  planned_end: string;
  actual_end?: string;
  status: string;
  repos: string[];
  created_at: string;
}

export interface IReservationHistoryRepo {
  findRecent(months: number): Promise<ReservationHistoryEntry[]>;
  save(entry: Omit<ReservationHistoryEntry, 'id' | 'created_at'>): Promise<void>;
}
