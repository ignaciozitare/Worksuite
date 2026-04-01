export interface JiraConnectionData {
  base_url: string;
  email: string;
  projects?: number;
  last_sync?: string;
}

export interface JiraConnectionPort {
  get(): Promise<JiraConnectionData | null>;
  save(baseUrl: string, email: string, apiToken: string): Promise<void>;
  remove(): Promise<void>;
}
