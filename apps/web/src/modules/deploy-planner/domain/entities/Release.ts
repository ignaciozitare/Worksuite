export interface Release {
  id:               string;
  releaseNumber:    string;
  description:      string | null;
  status:           string;           // nombre de dp_release_statuses
  startDate:        string | null;    // date ISO
  endDate:          string | null;
  ticketIds:        string[];
  ticketStatuses:   Record<string, string>; // { "KEY-1": "merged", ... }
  createdBy:        string | null;
  createdAt:        string;
  updatedAt:        string;
}

export interface ReleaseStatus {
  id:        string;
  name:      string;
  color:     string;
  bgColor:   string;
  border:    string;
  ord:       number;
  isFinal:   boolean;
}

export interface ReleaseConfig {
  id:             string;
  prefix:         string;
  segments:       unknown;
  separator:      string;
  nextNumber:     number;
  locked:         boolean;
  repoJiraField:  string;
  issueTypes:     string[];
}
