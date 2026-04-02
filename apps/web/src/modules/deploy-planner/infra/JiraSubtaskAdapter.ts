import type { SubtaskPort, JiraSubtask } from '../domain/ports/SubtaskPort';

export class JiraSubtaskAdapter implements SubtaskPort {
  constructor(
    private readonly apiBase: string,
    private readonly getHeaders: () => Promise<Record<string, string>>,
  ) {}

  async getSubtasks(parentKeys: string[]): Promise<JiraSubtask[]> {
    if (!parentKeys.length) return [];
    const headers = await this.getHeaders();
    const res = await fetch(
      `${this.apiBase}/jira/subtasks?parents=${encodeURIComponent(parentKeys.join(','))}`,
      { headers }
    );
    if (!res.ok) throw new Error(`Failed to fetch subtasks: ${res.status}`);
    const json = await res.json();
    return json.ok ? (json.subtasks || []) : [];
  }
}
