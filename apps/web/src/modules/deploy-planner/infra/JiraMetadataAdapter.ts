import type { JiraMetadataPort, JiraIssueType, JiraField } from '../domain/ports/JiraMetadataPort';

export class JiraMetadataAdapter implements JiraMetadataPort {
  constructor(
    private readonly apiBase: string,
    private readonly getAuthHeaders: () => Promise<Record<string, string>>,
  ) {}

  async getIssueTypes(): Promise<JiraIssueType[]> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${this.apiBase}/jira/issuetypes`, { headers });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to fetch issue types');
    return data.issueTypes || [];
  }

  async getFields(): Promise<JiraField[]> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${this.apiBase}/jira/fields`, { headers });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to fetch fields');
    return data.fields || [];
  }
}
