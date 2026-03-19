// ── Domain port: Jira API ─────────────────────────────────────────────────────
// Implementaciones: JiraCloudAdapter (real) | MockJiraAdapter (tests/dev)

export interface JiraProject {
  key:  string;
  name: string;
  id:   string;
}

export interface JiraIssue {
  key:      string;
  summary:  string;
  type:     string;   // Story | Task | Bug | Sub-task …
  status:   string;
  priority: string;
  project:  string;   // project key
  epic:     string;   // epic key o "—"
  epicName: string;
  assignee: string;
  labels:   string[];
}

export interface JiraWorklogResult {
  id:        string;  // worklog id en Jira
  issueKey:  string;
  timeSpent: string;  // "1h 30m"
}

export interface IJiraApi {
  /** Lista proyectos accesibles con el token configurado */
  getProjects(): Promise<JiraProject[]>;

  /** Lista issues de un proyecto (máx. 100, ordenadas por updated desc) */
  getIssues(projectKey: string): Promise<JiraIssue[]>;

  /** Registra worklog en Jira y devuelve el id creado */
  addWorklog(
    issueKey:  string,
    seconds:   number,
    startedAt: string,   // ISO-8601, e.g. "2025-03-19T09:00:00.000+0000"
    comment?:  string,
  ): Promise<JiraWorklogResult>;
}
