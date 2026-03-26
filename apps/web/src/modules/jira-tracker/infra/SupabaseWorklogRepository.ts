
import type { WorklogRepository, WorklogFilter } from "../domain/ports/WorklogRepository";
import type { Worklog }                          from "../domain/entities/Worklog";
import { worklogFromRow }                        from "../domain/entities/Worklog";
import { supabase }                              from "../../../shared/lib/supabaseClient";

export class SupabaseWorklogRepository implements WorklogRepository {
  async findMany(filter: WorklogFilter): Promise<Worklog[]> {
    let q = supabase.from("worklogs").select("*").order("started_at", { ascending: false });
    if (filter.userId)     q = q.eq("author_id",   filter.userId);
    if (filter.projectKey) q = q.eq("project_key", filter.projectKey);
    if (filter.dateFrom)   q = q.gte("started_at", filter.dateFrom);
    if (filter.dateTo)     q = q.lte("started_at", filter.dateTo + "T23:59:59");
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(worklogFromRow);
  }

  async save(wl: Omit<Worklog, "id" | "timeLabel">): Promise<Worklog> {
    const { data, error } = await supabase
      .from("worklogs")
      .insert({
        issue_key:    wl.issueKey,
        issue_summary:wl.issueSummary,
        project_key:  wl.project,
        seconds:      wl.seconds,
        started_at:   wl.startedAt,
        description:  wl.description,
        author_id:    wl.authorId,
        author_name:  wl.authorName,
        synced_to_jira: false,
      })
      .select().single();
    if (error) throw error;
    return worklogFromRow(data);
  }

  async update(id: string, patch: Partial<Worklog>): Promise<Worklog> {
    const { data, error } = await supabase
      .from("worklogs")
      .update({
        seconds:     patch.seconds,
        started_at:  patch.startedAt,
        description: patch.description,
      })
      .eq("id", id)
      .select().single();
    if (error) throw error;
    return worklogFromRow(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("worklogs").delete().eq("id", id);
    if (error) throw error;
  }

  async markSynced(id: string, jiraWorklogId: string): Promise<void> {
    const { error } = await supabase
      .from("worklogs")
      .update({ synced_to_jira: true, jira_worklog_id: jiraWorklogId })
      .eq("id", id);
    if (error) throw error;
  }
}
