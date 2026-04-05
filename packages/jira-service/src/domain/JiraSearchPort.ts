// Minimal raw-ish Jira issue shape as returned by the Jira Cloud REST API.
// We keep `fields` as a loose record because different consumers request
// different fields (including custom fields) via the `fields` parameter.
export interface JiraIssueRaw {
  key: string;
  id?: string;
  fields?: Record<string, any>;
  // Flattened shortcuts some endpoints already project
  summary?: string;
  issueType?: string;
  status?: string;
}

export interface JiraSearchResponse {
  ok?: boolean;
  data?: JiraIssueRaw[];
  issues?: JiraIssueRaw[];
}

export interface JiraSearchPort {
  /**
   * Search Jira issues by JQL.
   * @param jql        Raw JQL query string.
   * @param maxResults Pagination limit (default: 15).
   * @param fields     Comma-separated list of fields to request from Jira.
   */
  searchIssues(jql: string, maxResults?: number, fields?: string): Promise<JiraSearchResponse>;
}
