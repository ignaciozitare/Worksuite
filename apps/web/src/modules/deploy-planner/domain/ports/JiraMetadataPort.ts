export interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
}

export interface JiraField {
  id: string;
  name: string;
  custom: boolean;
  type: string;
}

export interface JiraMetadataPort {
  getIssueTypes(): Promise<JiraIssueType[]>;
  getFields(): Promise<JiraField[]>;
}
