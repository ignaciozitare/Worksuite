import type { JiraSearchPort, JiraSearchResponse } from '../domain/JiraSearchPort';

/**
 * HTTP adapter that talks to the WorkSuite API `/jira/search` endpoint.
 * Used from the frontend — the API layer is the one that holds Jira
 * credentials and calls Jira Cloud directly (see apps/api).
 */
export class HttpJiraSearchAdapter implements JiraSearchPort {
  constructor(
    private readonly apiBase: string,
    private readonly getHeaders: () => Promise<Record<string, string>>,
  ) {}

  async searchIssues(jql: string, maxResults = 15, fields?: string): Promise<JiraSearchResponse> {
    const headers = await this.getHeaders();
    const params = `jql=${encodeURIComponent(jql)}&maxResults=${maxResults}${fields ? `&fields=${fields}` : ''}`;
    const res = await fetch(`${this.apiBase}/jira/search?${params}`, { headers });
    if (!res.ok) throw new Error(`Jira search failed: ${res.status}`);
    return res.json();
  }
}
