/**
 * Admin-configurable filter used to pre-fetch Jira tickets shown in the
 * reservation modal. Empty arrays mean "no restriction" for that dimension.
 */
export interface JiraFilterConfig {
  projectKeys: string[];
  issueTypes:  string[];
  statuses:    string[];
}

export interface IJiraFilterConfigRepo {
  get(): Promise<JiraFilterConfig>;
  save(config: JiraFilterConfig): Promise<void>;
}
