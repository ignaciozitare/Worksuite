// ─── @worksuite/jira-service — public API ────────────────────────────────────
// Shared frontend service layer for interacting with Jira via the WorkSuite API.
// Used by any module that needs to search Jira issues and/or extract repo info.

// ── Domain ─────────────────────────────────────────────────────────────────
export type { JiraSearchPort, JiraSearchResponse, JiraIssueRaw } from './domain/JiraSearchPort';

// ── Infra ──────────────────────────────────────────────────────────────────
export { HttpJiraSearchAdapter } from './infra/HttpJiraSearchAdapter';

// ── Services ───────────────────────────────────────────────────────────────
export { extractReposFromTickets } from './services/extractRepos';
