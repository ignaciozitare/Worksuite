import type { IJiraApi, JiraProject, JiraIssue, JiraWorklogResult } from '../../domain/worklog/IJiraApi.js';

const MOCK_PROJECTS: JiraProject[] = [
  { key: 'ANDURIL', name: 'Anduril', id: '10000' },
  { key: 'INFRA',   name: 'Infraestructura', id: '10001' },
];

const MOCK_ISSUES: JiraIssue[] = [
  { key: 'ANDURIL-1', summary: 'Setup CI/CD pipeline',            type: 'Task',  status: 'In Progress', priority: 'High',   project: 'ANDURIL', epic: 'ANDURIL-EP1', epicName: 'DevOps',  assignee: 'Demo User', labels: [] },
  { key: 'ANDURIL-2', summary: 'Diseñar esquema de base de datos', type: 'Story', status: 'Done',        priority: 'High',   project: 'ANDURIL', epic: 'ANDURIL-EP1', epicName: 'DevOps',  assignee: 'Demo User', labels: [] },
  { key: 'ANDURIL-3', summary: 'Implementar autenticación JWT',    type: 'Task',  status: 'To Do',       priority: 'Medium', project: 'ANDURIL', epic: 'ANDURIL-EP2', epicName: 'Auth',    assignee: '',          labels: [] },
  { key: 'ANDURIL-4', summary: 'Review code quality',              type: 'Task',  status: 'In Progress', priority: 'Low',    project: 'ANDURIL', epic: '—',           epicName: '—',       assignee: 'Demo User', labels: ['review'] },
  { key: 'INFRA-1',   summary: 'Configurar Vercel environments',   type: 'Task',  status: 'Done',        priority: 'High',   project: 'INFRA',   epic: '—',           epicName: '—',       assignee: 'Demo User', labels: [] },
];

export class MockJiraAdapter implements IJiraApi {
  async getProjects(): Promise<JiraProject[]> {
    return MOCK_PROJECTS;
  }

  async getIssues(projectKey: string): Promise<JiraIssue[]> {
    return MOCK_ISSUES.filter(i => i.project === projectKey);
  }

  async addWorklog(issueKey: string, seconds: number, _startedAt: string, comment?: string): Promise<JiraWorklogResult> {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const timeSpent = h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
    console.log(`[MockJira] addWorklog ${issueKey} ${timeSpent} comment="${comment ?? ''}"`);
    return { id: `mock-${Date.now()}`, issueKey, timeSpent };
  }
}
