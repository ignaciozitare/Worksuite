import type { SupabaseClient } from '@supabase/supabase-js';
import type { SubtaskConfigPort, SubtaskConfig } from '../../domain/ports/SubtaskConfigPort';

export class SupabaseSubtaskConfigRepo implements SubtaskConfigPort {
  constructor(private readonly db: SupabaseClient) {}

  async findAll(): Promise<SubtaskConfig[]> {
    const { data, error } = await this.db.from('dp_subtask_config').select('*');
    if (error) throw error;
    return data || [];
  }

  async upsert(config: Omit<SubtaskConfig, 'id'>): Promise<SubtaskConfig> {
    // Upsert by jira_issue_type
    const { data: existing } = await this.db
      .from('dp_subtask_config')
      .select('id')
      .eq('jira_issue_type', config.jira_issue_type)
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await this.db
        .from('dp_subtask_config')
        .update({ category: config.category, test_type: config.test_type, closed_statuses: config.closed_statuses })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const { data, error } = await this.db
      .from('dp_subtask_config')
      .insert(config)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from('dp_subtask_config').delete().eq('id', id);
    if (error) throw error;
  }
}
