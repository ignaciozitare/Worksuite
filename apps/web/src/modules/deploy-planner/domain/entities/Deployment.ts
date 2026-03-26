
export type DeployStatus = "planned"|"in-progress"|"deployed"|"rolled-back"|"cancelled";
export type DeployEnv    = "development"|"staging"|"production";

export interface Deployment {
  id:          string;
  name:        string;
  version:     string;
  environment: DeployEnv;
  status:      DeployStatus;
  jiraIssues:  string[];
  plannedAt:   string;
  deployedAt?: string;
  createdBy:   string;
  notes?:      string;
}

export interface DeployStep {
  id:          string;
  order:       number;
  title:       string;
  description: string;
  status:      "pending"|"running"|"done"|"failed";
  assignee?:   string;
  durationMin?: number;
}

export interface DeployPlan {
  id:           string;
  deploymentId: string;
  steps:        DeployStep[];
  createdAt:    string;
}
