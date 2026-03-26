
import type { Worklog } from "../entities/Worklog";

export interface WorklogFilter {
  userId?:     string;
  projectKey?: string;
  dateFrom?:   string;
  dateTo?:     string;
}

/**
 * Port — defines what the JiraTracker module needs for persistence.
 * The implementation lives in infra/SupabaseWorklogRepository.ts
 */
export interface WorklogRepository {
  findMany(filter: WorklogFilter): Promise<Worklog[]>;
  save(worklog: Omit<Worklog, "id" | "timeLabel">): Promise<Worklog>;
  update(id: string, patch: Partial<Worklog>): Promise<Worklog>;
  delete(id: string): Promise<void>;
  markSynced(id: string, jiraWorklogId: string): Promise<void>;
}
