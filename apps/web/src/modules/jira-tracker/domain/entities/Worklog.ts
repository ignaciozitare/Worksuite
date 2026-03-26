
export type WorklogId = string;

export interface Worklog {
  id:           WorklogId;
  issueKey:     string;
  issueSummary: string;
  project:      string;
  seconds:      number;
  startedAt:    string;      // ISO YYYY-MM-DD
  description:  string;
  syncedToJira: boolean;
  jiraWorklogId?: string;
  authorId:     string;
  authorName:   string;
  // UI computed
  timeLabel?:   string;      // "2h 30m"
}

export function worklogTimeLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h)      return `${h}h`;
  return `${m}m`;
}

export function worklogFromRow(row: Record<string, unknown>): Worklog {
  const seconds = (row.seconds as number) ?? 0;
  return {
    id:           row.id as string,
    issueKey:     row.issue_key as string ?? '',
    issueSummary: row.issue_summary as string ?? '',
    project:      row.project_key as string ?? '',
    seconds,
    startedAt:    (row.started_at as string ?? '').slice(0, 10),
    description:  row.description as string ?? '',
    syncedToJira: row.synced_to_jira as boolean ?? false,
    jiraWorklogId: row.jira_worklog_id as string,
    authorId:     row.author_id as string ?? '',
    authorName:   row.author_name as string ?? '',
    timeLabel:    worklogTimeLabel(seconds),
  };
}
