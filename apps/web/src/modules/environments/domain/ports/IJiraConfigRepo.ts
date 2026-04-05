/**
 * Reads Jira integration config that is shared across modules.
 * Currently sourced from the deploy-planner's version config table
 * (dp_version_config.repo_jira_field) — the single place in Admin where
 * users choose which Jira field holds the list of repositories.
 */
export interface IJiraConfigRepo {
  /** Returns the Jira field id/name that holds the repositories (e.g. "customfield_10146", "components"). */
  getRepoField(): Promise<string>;
}
