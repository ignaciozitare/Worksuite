/**
 * Frontend-facing port for the Jira API exposed by `apps/api`.
 *
 * Each method maps 1:1 to an `/jira/*` HTTP endpoint and returns the
 * payload shape that the existing UI consumers expect, so refactoring
 * call sites is a drop-in replacement for inline `fetch()` calls.
 */

export interface JiraProjectRow {
  key: string;
  name: string;
  [k: string]: unknown;
}

export interface JiraIssueRow {
  key: string;
  id?: string;
  summary?: string;
  assignee?: string;
  priority?: string;
  type?: string;
  status?: string;
  fields?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface JiraIssueTypeRow {
  id: string;
  name: string;
  subtask?: boolean;
  [k: string]: unknown;
}

export interface JiraStatusRow {
  id: string;
  name: string;
  category?: string;
  [k: string]: unknown;
}

export interface JiraConnectionInfo {
  base_url: string;
  email?: string;
  [k: string]: unknown;
}

export interface JiraTransitionResult {
  ok: boolean;
  error?: string;
}

export interface JiraApiPort {
  /** GET /jira/projects → list of projects (key + name). */
  listProjects(): Promise<JiraProjectRow[]>;

  /** GET /jira/issues?project=KEY[&extraFields=field] → issues of one project. */
  listIssues(project: string, extraFields?: string): Promise<JiraIssueRow[]>;

  /** GET /jira/issuetypes → all issue types (including subtasks). */
  listIssueTypes(): Promise<JiraIssueTypeRow[]>;

  /** GET /jira/statuses → all statuses (id + name + category). */
  listStatuses(): Promise<JiraStatusRow[]>;

  /** GET /jira/connection → current Jira connection info or null. */
  getConnection(): Promise<JiraConnectionInfo | null>;

  /** GET /jira/search?jql=...&maxResults=...&fields=... → issues matching JQL. */
  searchIssues(params: { jql: string; maxResults?: number; fields?: string }): Promise<JiraIssueRow[]>;

  /** POST /jira/issue/:key/transition → move ticket to a target status by name. */
  transitionIssue(issueKey: string, targetStatus: string): Promise<JiraTransitionResult>;
}
