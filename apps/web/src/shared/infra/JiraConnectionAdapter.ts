import type { JiraConnectionPort, JiraConnectionData } from '../domain/ports/JiraConnectionPort';

export class JiraConnectionAdapter implements JiraConnectionPort {
  constructor(
    private readonly apiBase: string,
    private readonly getHeaders: () => Promise<Record<string, string>>,
  ) {}

  async get(): Promise<JiraConnectionData | null> {
    const headers = await this.getHeaders();
    const res = await fetch(`${this.apiBase}/jira/connection`, { headers });
    if (!res.ok) return null;
    const json = await res.json();
    return json.ok ? json.data : null;
  }

  async save(baseUrl: string, email: string, apiToken: string): Promise<void> {
    const headers = { ...await this.getHeaders(), 'Content-Type': 'application/json' };
    const res = await fetch(`${this.apiBase}/jira/connection`, {
      method: 'POST', headers,
      body: JSON.stringify({ baseUrl, email, apiToken }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error?.message || 'Failed to save');
  }

  async remove(): Promise<void> {
    const headers = await this.getHeaders();
    await fetch(`${this.apiBase}/jira/connection`, { method: 'DELETE', headers });
  }
}
