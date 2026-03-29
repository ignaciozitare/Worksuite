import type { SupabaseClient } from '@supabase/supabase-js';
import { Worklog, WorklogId, TimeSpent } from '../../domain/worklog/Worklog.js';
import type { IWorklogRepository, WorklogFilters } from '../../domain/worklog/IWorklogRepository.js';

export class SupabaseWorklogRepo implements IWorklogRepository {
  constructor(private readonly db: SupabaseClient) {}

  async save(worklog: Worklog): Promise<void> {
    const s = worklog.toSnapshot();
    const { error } = await this.db.from('worklogs').upsert({
      id:              s.id.value,
      issue_key:       s.issueKey,
      issue_summary:   s.issueSummary,
      issue_type:      s.issueType,
      epic_key:        s.epicKey,
      epic_name:       s.epicName,
      project_key:     s.projectKey,
      author_id:       s.authorId,
      author_name:     s.authorName,
      date:            s.date,
      started_at:      s.startedAt,
      seconds:         s.timeSpent.seconds,
      description:     s.description,
      synced_to_jira:  s.syncedToJira,
      jira_worklog_id: s.jiraWorklogId ?? null,
    });
    if (error) throw new Error(`Failed to save worklog: ${error.message}`);
  }

  async delete(worklogId: string, _authorId: string): Promise<void> {
    const { error } = await this.db.from('worklogs').delete().eq('id', worklogId);
    if (error) throw new Error(`Failed to delete worklog: ${error.message}`);
  }

  async findByFilters(filters: WorklogFilters): Promise<Worklog[]> {
    let query = this.db.from('worklogs').select('*').gte('date', filters.from).lte('date', filters.to).order('date', { ascending: false });
    if (filters.authorId) query = query.eq('author_id', filters.authorId);
    if (filters.projectKeys?.length) query = query.in('project_key', filters.projectKeys);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch worklogs: ${error.message}`);
    return (data ?? []).map((row) => this.toEntity(row));
  }

  async markSyncedToJira(worklogId: string, jiraWorklogId: string): Promise<void> {
    const { error } = await this.db
      .from('worklogs')
      .update({ synced_to_jira: true, jira_worklog_id: jiraWorklogId })
      .eq('id', worklogId);
    if (error) throw new Error(`Failed to mark worklog as synced: ${error.message}`);
  }

  async findById(id: string): Promise<Worklog | null> {
    const { data, error } = await this.db.from('worklogs').select('*').eq('id', id).single();
    if (error || !data) return null;
    return this.toEntity(data);
  }

  private toEntity(row: Record<string, unknown>): Worklog {
    return Worklog.reconstitute({
      id:             WorklogId.from(row['id'] as string),
      issueKey:       row['issue_key'] as string,
      issueSummary:   row['issue_summary'] as string,
      issueType:      row['issue_type'] as string,
      epicKey:        row['epic_key'] as string,
      epicName:       row['epic_name'] as string,
      projectKey:     row['project_key'] as string,
      authorId:       row['author_id'] as string,
      authorName:     row['author_name'] as string,
      date:           row['date'] as string,
      startedAt:      row['started_at'] as string,
      timeSpent:      TimeSpent.fromSeconds(row['seconds'] as number),
      description:    row['description'] as string,
      syncedToJira:   row['synced_to_jira'] as boolean,
      jiraWorklogId:  row['jira_worklog_id'] as string | undefined,
    });
  }
}
