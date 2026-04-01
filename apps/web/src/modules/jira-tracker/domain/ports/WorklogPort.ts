export interface WorklogRow {
  id: string;
  issue_key: string;
  issue_summary: string;
  issue_type: string;
  epic_key: string;
  epic_name: string;
  project_key: string;
  author_id: string;
  author_name: string;
  date: string;
  started_at: string;
  seconds: number;
  description: string;
  synced_to_jira?: boolean;
}

export interface WorklogPort {
  findAll(): Promise<WorklogRow[]>;
  insert(row: WorklogRow): Promise<void>;
  remove(id: string): Promise<void>;
  markSynced(id: string): Promise<void>;
}
