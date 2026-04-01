import type { JiraSyncPort, JiraSyncResult } from '../domain/ports/JiraSyncPort';

export class JiraSyncAdapter implements JiraSyncPort {
  constructor(
    private readonly apiBase: string,
    private readonly getHeaders: () => Promise<Record<string, string>>,
  ) {}

  async syncWorklog(issueKey: string, payload: { worklogId: string; seconds: number; startedAt: string; description: string }): Promise<JiraSyncResult> {
    const headers = { ...await this.getHeaders(), 'Content-Type': 'application/json' };
    const res = await fetch(`${this.apiBase}/jira/worklogs/${issueKey}/sync`, {
      method: 'POST', headers, body: JSON.stringify(payload),
    });
    return res.json();
  }

  async loadProjects(): Promise<{ key: string; name: string }[]> {
    const headers = { ...await this.getHeaders(), 'Content-Type': 'application/json' };
    const res = await fetch(`${this.apiBase}/jira/projects`, { headers });
    const json = await res.json();
    if (!json.ok || !json.data?.length) return [];
    return json.data.map((p: any) => ({ key: p.key, name: p.name }));
  }

  async loadIssues(projectKey: string): Promise<any[]> {
    const headers = { ...await this.getHeaders(), 'Content-Type': 'application/json' };
    const res = await fetch(`${this.apiBase}/jira/issues?project=${projectKey}`, { headers });
    const json = await res.json();
    if (!json.ok || !json.data?.length) return [];
    return json.data;
  }
}
