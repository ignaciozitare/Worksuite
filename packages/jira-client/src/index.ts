import type { JiraIssue, JiraProject, JiraWorklog } from '@worksuite/shared-types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JiraClientConfig {
  baseUrl:  string;    // e.g. https://mycompany.atlassian.net
  email:    string;
  apiToken: string;
}

export interface JiraWorklogInput {
  issueKey:    string;
  seconds:     number;
  startedAt:   string;    // ISO 8601
  description?: string;
}

export interface JiraWorklogResult {
  id:          string;
  issueKey:    string;
  seconds:     number;
  startedAt:   string;
}

// Issue search options
export interface JiraSearchOptions {
  projectKey?:  string;
  status?:      string;
  assignee?:    string;
  maxResults?:  number;
  jql?:         string;   // raw JQL override
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class JiraClientError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public jiraMessage?: string,
  ) {
    super(message);
    this.name = 'JiraClientError';
  }
}

// ─── Client ───────────────────────────────────────────────────────────────────

/**
 * JiraClient — single HTTP adapter for the Jira Cloud REST API v3.
 *
 * Used by:
 *   - apps/api/src/jira-tracker/routes.ts
 *   - apps/api/src/deploy-planner/routes.ts
 *
 * Never instantiated in the frontend — only in the API layer.
 */
export class JiraClient {
  private readonly base: string;
  private readonly auth: string;

  constructor(config: JiraClientConfig) {
    this.base = config.baseUrl.replace(/\/$/, '');
    this.auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
  }

  // ── HTTP base ──────────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.base}/rest/api/3${path}`;

    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Accept':        'application/json',
        'Content-Type':  'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let jiraMsg: string | undefined;
      try {
        const err = await res.json() as { errorMessages?: string[]; errors?: Record<string, string> };
        jiraMsg = err.errorMessages?.[0] ?? Object.values(err.errors ?? {})[0];
      } catch { /* ignore */ }
      throw new JiraClientError(
        `Jira API error ${res.status} on ${method} ${path}`,
        res.status,
        jiraMsg,
      );
    }

    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  }

  private get<T>(path: string)               { return this.request<T>('GET',    path);        }
  private post<T>(path: string, body: unknown){ return this.request<T>('POST',   path, body); }
  private put<T>(path: string, body: unknown) { return this.request<T>('PUT',    path, body); }
  private del<T>(path: string)               { return this.request<T>('DELETE', path);        }

  // ── Projects ───────────────────────────────────────────────────────────────

  async getProjects(): Promise<JiraProject[]> {
    const data = await this.get<{ values: Array<{ id: string; key: string; name: string }> }>(
      '/project/search?maxResults=100&orderBy=name'
    );
    return data.values.map(p => ({ id: p.id, key: p.key, name: p.name }));
  }

  // ── Issues ─────────────────────────────────────────────────────────────────

  async searchIssues(opts: JiraSearchOptions = {}): Promise<JiraIssue[]> {
    const jql = opts.jql ?? this.buildJql(opts);
    const maxResults = opts.maxResults ?? 50;

    const data = await this.post<{
      issues: Array<{
        id: string;
        key: string;
        fields: {
          summary: string;
          status:   { name: string };
          assignee: { displayName: string } | null;
          project:  { key: string };
        };
      }>;
    }>('/search', { jql, maxResults, fields: ['summary', 'status', 'assignee', 'project'] });

    return data.issues.map(i => ({
      id:       i.id,
      key:      i.key,
      summary:  i.fields.summary,
      status:   i.fields.status.name,
      assignee: i.fields.assignee?.displayName ?? null,
      project:  i.fields.project.key,
    }));
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    const i = await this.get<{
      id: string; key: string;
      fields: {
        summary: string;
        status:   { name: string };
        assignee: { displayName: string } | null;
        project:  { key: string };
      };
    }>(`/issue/${issueKey}?fields=summary,status,assignee,project`);

    return {
      id:       i.id,
      key:      i.key,
      summary:  i.fields.summary,
      status:   i.fields.status.name,
      assignee: i.fields.assignee?.displayName ?? null,
      project:  i.fields.project.key,
    };
  }

  private buildJql(opts: JiraSearchOptions): string {
    const parts: string[] = [];
    if (opts.projectKey) parts.push(`project = "${opts.projectKey}"`);
    if (opts.status)     parts.push(`status = "${opts.status}"`);
    if (opts.assignee)   parts.push(`assignee = "${opts.assignee}"`);
    parts.push('ORDER BY updated DESC');
    return parts.join(' AND ');
  }

  // ── Worklogs ───────────────────────────────────────────────────────────────

  async addWorklog(input: JiraWorklogInput): Promise<JiraWorklogResult> {
    const body = {
      timeSpentSeconds: input.seconds,
      started:          this.formatStarted(input.startedAt),
      comment: input.description ? {
        version: 1,
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: input.description }],
        }],
      } : undefined,
    };

    const res = await this.post<{ id: string; timeSpentSeconds: number; started: string }>(
      `/issue/${input.issueKey}/worklog`,
      body,
    );

    return {
      id:         res.id,
      issueKey:   input.issueKey,
      seconds:    res.timeSpentSeconds,
      startedAt:  res.started,
    };
  }

  async updateWorklog(
    issueKey: string,
    worklogId: string,
    input: Partial<JiraWorklogInput>,
  ): Promise<JiraWorklogResult> {
    const body: Record<string, unknown> = {};
    if (input.seconds)    body.timeSpentSeconds = input.seconds;
    if (input.startedAt)  body.started = this.formatStarted(input.startedAt);
    if (input.description !== undefined) {
      body.comment = {
        version: 1, type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: input.description }] }],
      };
    }

    const res = await this.put<{ id: string; timeSpentSeconds: number; started: string }>(
      `/issue/${issueKey}/worklog/${worklogId}`,
      body,
    );

    return { id: res.id, issueKey, seconds: res.timeSpentSeconds, startedAt: res.started };
  }

  async deleteWorklog(issueKey: string, worklogId: string): Promise<void> {
    await this.del(`/issue/${issueKey}/worklog/${worklogId}`);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Jira requires: "2024-03-21T09:00:00.000+0000"
   * We receive ISO 8601: "2024-03-21T09:00:00.000Z"
   */
  private formatStarted(iso: string): string {
    return iso.replace('Z', '+0000');
  }

  /**
   * Validate connection — lightweight call.
   * Throws JiraClientError if credentials are invalid.
   */
  async validateConnection(): Promise<{ accountId: string; displayName: string }> {
    const res = await this.get<{ accountId: string; displayName: string }>('/myself');
    return res;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * createJiraClient — factory para usar en routes.ts de cada módulo.
 *
 * @example
 * // apps/api/src/jira-tracker/routes.ts
 * import { createJiraClient } from '@worksuite/jira-client';
 *
 * const client = createJiraClient({ baseUrl, email, apiToken });
 * const issues = await client.searchIssues({ projectKey: 'PROJ' });
 *
 * // apps/api/src/deploy-planner/routes.ts — mismo client, misma conexión
 * const client = createJiraClient({ baseUrl, email, apiToken });
 * const issue  = await client.getIssue('PROJ-123');
 */
export function createJiraClient(config: JiraClientConfig): JiraClient {
  return new JiraClient(config);
}

export type { JiraProject, JiraIssue } from '@worksuite/shared-types';
