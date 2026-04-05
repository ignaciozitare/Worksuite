import type { SupabaseClient } from '@supabase/supabase-js';
import type { IJiraFilterConfigRepo, JiraFilterConfig } from '../../domain/ports/IJiraFilterConfigRepo';

export class SupabaseJiraFilterConfigRepo implements IJiraFilterConfigRepo {
  constructor(private readonly db: SupabaseClient) {}

  async get(): Promise<JiraFilterConfig> {
    const { data } = await this.db
      .from('syn_jira_filter_config')
      .select('project_keys, issue_types, statuses')
      .eq('id', 1)
      .single();
    return {
      projectKeys: (data?.project_keys as string[]) ?? [],
      issueTypes:  (data?.issue_types  as string[]) ?? [],
      statuses:    (data?.statuses     as string[]) ?? [],
    };
  }

  async save(config: JiraFilterConfig): Promise<void> {
    const { error } = await this.db
      .from('syn_jira_filter_config')
      .update({
        project_keys: config.projectKeys,
        issue_types:  config.issueTypes,
        statuses:     config.statuses,
        updated_at:   new Date().toISOString(),
      })
      .eq('id', 1);
    if (error) throw error;
  }
}
