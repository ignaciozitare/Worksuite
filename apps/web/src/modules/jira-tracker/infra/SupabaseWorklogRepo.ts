import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorklogPort, WorklogRow } from '../domain/ports/WorklogPort';

export class SupabaseWorklogRepo implements WorklogPort {
  constructor(private readonly db: SupabaseClient) {}

  async findAll(): Promise<WorklogRow[]> {
    const { data, error } = await this.db
      .from('worklogs').select('*').order('date', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async insert(row: WorklogRow): Promise<void> {
    const { error } = await this.db.from('worklogs').insert(row);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from('worklogs').delete().eq('id', id);
    if (error) throw error;
  }

  async markSynced(id: string): Promise<void> {
    const { error } = await this.db.from('worklogs').update({ synced_to_jira: true }).eq('id', id);
    if (error) throw error;
  }
}
