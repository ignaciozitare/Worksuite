// ─────────────────────────────────────────────────────────────────────────────
// ADAPTER — MockJiraAdapter
// Used in dev/test. Swap for JiraCloudAdapter when token is available.
// ─────────────────────────────────────────────────────────────────────────────

import type { IJiraApi, JiraWorklogPayload } from '../../domain/worklog/IJiraApi.js';
import type { JiraIssue } from '@worksuite/shared-types';

const MOCK_ISSUES: JiraIssue[] = [
  { key: 'PLAT-142', summary: 'Refactor auth service with JWT RS256', type: 'Story',
    status: 'In Progress', priority: 'High', epicKey: 'PLAT-100', epicName: 'Security Q1',
    projectKey: 'PLAT', assignee: 'Elena Martínez', labels: ['backend', 'security'], estimatedHours: 12.5 },
  { key: 'PLAT-143', summary: 'Add rate limiting to API Gateway', type: 'Task',
    status: 'In Progress', priority: 'High', epicKey: 'PLAT-100', epicName: 'Security Q1',
    projectKey: 'PLAT', assignee: 'Elena Martínez', labels: ['backend', 'infra'], estimatedHours: 6.0 },
  { key: 'MOB-87', summary: 'Crash on iOS 17 opening notifications', type: 'Bug',
    status: 'Done', priority: 'Critical', epicKey: 'MOB-50', epicName: 'Stability',
    projectKey: 'MOB', assignee: 'Carlos Ruiz', labels: ['ios', 'hotfix'], estimatedHours: 3.5 },
  { key: 'MOB-91', summary: 'Migrate to React Native 0.73', type: 'Task',
    status: 'In Progress', priority: 'Medium', epicKey: 'MOB-80', epicName: 'Tech Debt',
    projectKey: 'MOB', assignee: 'Elena Martínez', labels: ['rn', 'upgrade'], estimatedHours: 8.0 },
  { key: 'DATA-34', summary: 'ETL pipeline for product metrics', type: 'Story',
    status: 'To Do', priority: 'Medium', epicKey: 'DATA-20', epicName: 'Analytics v2',
    projectKey: 'DATA', assignee: 'Ana López', labels: ['etl', 'bigquery'], estimatedHours: 0 },
  { key: 'OPS-19', summary: 'Migrate clusters to EKS 1.29', type: 'Spike',
    status: 'In Progress', priority: 'High', epicKey: 'OPS-10', epicName: 'K8s Upgrade',
    projectKey: 'OPS', assignee: 'Marco Silva', labels: ['k8s', 'aws'], estimatedHours: 14.0 },
];

export class MockJiraAdapter implements IJiraApi {
  private worklogCounter = 1000;

  async getIssue(key: string): Promise<JiraIssue | null> {
    return MOCK_ISSUES.find((i) => i.key === key) ?? null;
  }

  async searchIssues(jql: string): Promise<JiraIssue[]> {
    console.log(`[MockJira] searchIssues jql="${jql}"`);
    return MOCK_ISSUES;
  }

  async logWork(payload: JiraWorklogPayload): Promise<{ jiraWorklogId: string }> {
    const id = `mock-jira-wl-${++this.worklogCounter}`;
    console.log(`[MockJira] logWork → ${payload.issueKey} ${payload.timeSpentSeconds}s → id=${id}`);
    return { jiraWorklogId: id };
  }

  async deleteWorklog(issueKey: string, jiraWorklogId: string): Promise<void> {
    console.log(`[MockJira] deleteWorklog → ${issueKey} / ${jiraWorklogId}`);
  }
}
