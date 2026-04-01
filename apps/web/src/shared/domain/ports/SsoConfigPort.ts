export interface SsoConfig {
  id: number;
  ad_group_id?: string;
  ad_group_name?: string;
  allow_google: boolean;
  allow_microsoft: boolean;
  deploy_jira_statuses?: string;
}

export interface SsoConfigPort {
  get(): Promise<SsoConfig | null>;
  update(id: number, patch: Partial<SsoConfig>): Promise<void>;
}
