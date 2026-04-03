export interface JiraSyncResult {
  ok: boolean;
  error?: { message: string };
}

export interface JiraSyncPort {
  syncWorklog(issueKey: string, payload: { worklogId: string; seconds: number; startedAt: string; description: string }): Promise<JiraSyncResult>;
  loadProjects(): Promise<{ key: string; name: string }[]>;
  loadIssues(projectKey: string, extraFields?: string[], userFilter?: string): Promise<any[]>;
  searchIssues(jql: string, maxResults?: number, fields?: string): Promise<any>;
}
