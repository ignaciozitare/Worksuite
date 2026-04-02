export type SubtaskCategory = 'bug' | 'test' | 'other';

export interface SubtaskConfig {
  id: string;
  jira_issue_type: string;
  category: SubtaskCategory;
  test_type?: string;
  closed_statuses: string[];
}

export interface SubtaskConfigPort {
  findAll(): Promise<SubtaskConfig[]>;
  upsert(config: Omit<SubtaskConfig, 'id'>): Promise<SubtaskConfig>;
  remove(id: string): Promise<void>;
}
