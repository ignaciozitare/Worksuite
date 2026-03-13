// ─────────────────────────────────────────────────────────────────────────────
// PORT — IJiraApi
// Adapters: JiraCloudAdapter (real) | MockJiraAdapter (dev/test)
// ─────────────────────────────────────────────────────────────────────────────

import type { JiraIssue } from '@worksuite/shared-types';

export interface JiraWorklogPayload {
  issueKey: string;
  timeSpentSeconds: number;
  started: string; // ISO datetime
  comment?: string;
}

export interface IJiraApi {
  getIssue(key: string): Promise<JiraIssue | null>;
  searchIssues(jql: string): Promise<JiraIssue[]>;
  logWork(payload: JiraWorklogPayload): Promise<{ jiraWorklogId: string }>;
  deleteWorklog(issueKey: string, jiraWorklogId: string): Promise<void>;
}
