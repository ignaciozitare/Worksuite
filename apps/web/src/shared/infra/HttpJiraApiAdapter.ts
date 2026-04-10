// @ts-nocheck
import type {
  JiraApiPort,
  JiraProjectRow,
  JiraIssueRow,
  JiraIssueTypeRow,
  JiraStatusRow,
  JiraConnectionInfo,
  JiraTransitionResult,
} from '../domain/ports/JiraApiPort';

type GetHeaders = () => Promise<Record<string, string>>;

/**
 * HTTP adapter that calls the `/jira/*` endpoints exposed by `apps/api`.
 * Auth headers are injected via the `getHeaders` callback so this adapter
 * stays decoupled from the Supabase client.
 */
export class HttpJiraApiAdapter implements JiraApiPort {
  constructor(
    private readonly apiBase: string,
    private readonly getHeaders: GetHeaders,
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<any> {
    const headers = {
      'Content-Type': 'application/json',
      ...(await this.getHeaders()),
      ...(init.headers as Record<string, string> | undefined),
    };
    const res = await fetch(`${this.apiBase}${path}`, { ...init, headers });
    if (!res.ok) {
      throw new Error(`Jira API ${path} → HTTP ${res.status}`);
    }
    return res.json().catch(() => ({}));
  }

  async listProjects(): Promise<JiraProjectRow[]> {
    const json = await this.request('/jira/projects');
    return (json?.data ?? []).map((p: any) => ({ key: p.key, name: p.name, ...p }));
  }

  async listIssues(project: string, extraFields?: string): Promise<JiraIssueRow[]> {
    const qs = `project=${encodeURIComponent(project)}` +
      (extraFields ? `&extraFields=${encodeURIComponent(extraFields)}` : '');
    const json = await this.request(`/jira/issues?${qs}`);
    return (json?.data ?? []) as JiraIssueRow[];
  }

  async listIssueTypes(): Promise<JiraIssueTypeRow[]> {
    const json = await this.request('/jira/issuetypes');
    return (json?.issueTypes ?? []) as JiraIssueTypeRow[];
  }

  async listStatuses(): Promise<JiraStatusRow[]> {
    const json = await this.request('/jira/statuses');
    return (json?.statuses ?? []) as JiraStatusRow[];
  }

  async getConnection(): Promise<JiraConnectionInfo | null> {
    try {
      const json = await this.request('/jira/connection');
      if (json?.ok && json.data?.base_url) return json.data as JiraConnectionInfo;
      return null;
    } catch {
      return null;
    }
  }

  async searchIssues(params: { jql: string; maxResults?: number; fields?: string }): Promise<JiraIssueRow[]> {
    const qs = new URLSearchParams({
      jql: params.jql,
      ...(params.maxResults != null && { maxResults: String(params.maxResults) }),
      ...(params.fields && { fields: params.fields }),
    });
    const json = await this.request(`/jira/search?${qs.toString()}`);
    return (json?.issues ?? json?.data ?? []) as JiraIssueRow[];
  }

  async transitionIssue(issueKey: string, targetStatus: string): Promise<JiraTransitionResult> {
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await this.getHeaders()),
      };
      const res = await fetch(`${this.apiBase}/jira/issue/${encodeURIComponent(issueKey)}/transition`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ targetStatus }),
      });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }
}
