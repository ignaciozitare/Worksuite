// ─────────────────────────────────────────────────────────────────────────────
// ADAPTER — JiraCloudAdapter
// Implements IJiraApi against Jira REST API v3.
// Configure via env: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN
// ─────────────────────────────────────────────────────────────────────────────

import type { IJiraApi, JiraWorklogPayload } from '../../domain/worklog/IJiraApi.js';
import type { JiraIssue } from '@worksuite/shared-types';

export class JiraCloudAdapter implements IJiraApi {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(baseUrl: string, email: string, apiToken: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}/rest/api/3${path}`, {
      ...options,
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Jira API ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async getIssue(key: string): Promise<JiraIssue | null> {
    try {
      const data = await this.fetch<Record<string, unknown>>(`/issue/${key}?fields=summary,issuetype,status,priority,assignee,labels,customfield_10014`);
      return this.mapIssue(data);
    } catch {
      return null;
    }
  }

  async searchIssues(jql: string): Promise<JiraIssue[]> {
    const data = await this.fetch<{ issues: Record<string, unknown>[] }>(
      `/search?jql=${encodeURIComponent(jql)}&fields=summary,issuetype,status,priority,assignee,labels&maxResults=50`,
    );
    return data.issues.map((i) => this.mapIssue(i));
  }

  async logWork(payload: JiraWorklogPayload): Promise<{ jiraWorklogId: string }> {
    const data = await this.fetch<{ id: string }>(
      `/issue/${payload.issueKey}/worklog`,
      {
        method: 'POST',
        body: JSON.stringify({
          timeSpentSeconds: payload.timeSpentSeconds,
          started: payload.started,
          comment: payload.comment
            ? { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: payload.comment }] }] }
            : undefined,
        }),
      },
    );
    return { jiraWorklogId: data.id };
  }

  async deleteWorklog(issueKey: string, jiraWorklogId: string): Promise<void> {
    await this.fetch(`/issue/${issueKey}/worklog/${jiraWorklogId}`, { method: 'DELETE' });
  }

  // TODO: map full Jira response shape to our domain type
  private mapIssue(raw: Record<string, unknown>): JiraIssue {
    const fields = raw['fields'] as Record<string, unknown>;
    return {
      key: raw['key'] as string,
      summary: (fields['summary'] as string) ?? '',
      type: ((fields['issuetype'] as Record<string,unknown>)?.['name'] as string) ?? 'Task',
      status: ((fields['status'] as Record<string,unknown>)?.['name'] as string) ?? '',
      priority: ((fields['priority'] as Record<string,unknown>)?.['name'] as string) ?? 'Medium',
      epicKey: (fields['customfield_10014'] as string) ?? '—',
      epicName: '—', // requires separate fetch or custom field
      projectKey: (raw['key'] as string).split('-')[0]!,
      assignee: ((fields['assignee'] as Record<string,unknown>)?.['displayName'] as string) ?? 'Unassigned',
      labels: (fields['labels'] as string[]) ?? [],
      estimatedHours: 0,
    };
  }
}
