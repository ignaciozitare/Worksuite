import type { SupabaseClient } from '@supabase/supabase-js';
import type { IEnvHistoryNoteRepo } from '../../domain/ports/IEnvHistoryNoteRepo';

export class SupabaseEnvHistoryNoteRepo implements IEnvHistoryNoteRepo {
  constructor(private readonly db: SupabaseClient) {}

  async get(): Promise<string> {
    const { data } = await this.db
      .from('dp_version_config')
      .select('env_history_note')
      .limit(1)
      .single();
    return (data?.env_history_note as string) || '';
  }

  async save(html: string): Promise<void> {
    const { data: existing } = await this.db
      .from('dp_version_config')
      .select('id')
      .limit(1)
      .single();
    if (existing) {
      await this.db
        .from('dp_version_config')
        .update({ env_history_note: html })
        .eq('id', existing.id);
    }
  }
}
