import type { SupabaseClient } from '@supabase/supabase-js';
import type { IJiraConfigRepo } from '../../domain/ports/IJiraConfigRepo';

/**
 * Reads `repo_jira_field` from the shared `dp_version_config` table.
 * Falls back to Jira's native "components" field if nothing is configured.
 */
export class SupabaseJiraConfigRepo implements IJiraConfigRepo {
  constructor(private readonly db: SupabaseClient) {}

  async getRepoField(): Promise<string> {
    const { data } = await this.db
      .from('dp_version_config')
      .select('repo_jira_field')
      .limit(1)
      .single();
    return (data?.repo_jira_field as string) || 'components';
  }
}
