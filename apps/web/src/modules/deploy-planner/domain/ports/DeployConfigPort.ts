export type StatusCategory = 'backlog' | 'in_progress' | 'approved' | 'done';

export interface ReleaseStatusData {
  id: string;
  name: string;
  color: string;
  bg_color: string;
  border: string;
  ord: number;
  is_final: boolean;          // legacy — read from status_category instead
  status_category: StatusCategory;
}

export interface RepoGroupData {
  id: string;
  name: string;
  repos: string[];
}

export interface VersionConfigData {
  id: string;
  prefix: string;
  segments: { name: string; value: number }[];
  separator: string;
  next_number: number;
  locked: boolean;
  repo_jira_field: string;
}

export interface DeployConfigPort {
  // Release statuses
  findAllStatuses(): Promise<ReleaseStatusData[]>;
  createStatus(data: Omit<ReleaseStatusData, 'id'>): Promise<ReleaseStatusData>;
  updateStatus(id: string, patch: Partial<ReleaseStatusData>): Promise<void>;
  deleteStatus(id: string): Promise<void>;
  reorderStatuses(items: { id: string; ord: number }[]): Promise<void>;

  // Version config
  getVersionConfig(): Promise<VersionConfigData | null>;
  saveVersionConfig(patch: Partial<VersionConfigData>): Promise<void>;

  // Repo groups
  findAllRepoGroups(): Promise<RepoGroupData[]>;
  createRepoGroup(name: string): Promise<RepoGroupData>;
  deleteRepoGroup(id: string): Promise<void>;
  updateRepoGroupRepos(id: string, repos: string[]): Promise<void>;
  renameRepoGroup(id: string, name: string): Promise<void>;

  // Jira deploy statuses (stored in sso_config)
  getJiraDeployStatuses(): Promise<string>;
  saveJiraDeployStatuses(statuses: string): Promise<void>;
}
