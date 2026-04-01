import type { SupabaseClient } from '@supabase/supabase-js';
import type { SsoConfig, SsoConfigPort } from '../domain/ports/SsoConfigPort';

export class SupabaseSsoConfigRepo implements SsoConfigPort {
  constructor(private readonly db: SupabaseClient) {}

  async get(): Promise<SsoConfig | null> {
    const { data, error } = await this.db
      .from('sso_config')
      .select('*')
      .limit(1)
      .single();
    if (error) throw error;
    return data;
  }

  async update(id: number, patch: Partial<SsoConfig>): Promise<void> {
    const { error } = await this.db
      .from('sso_config')
      .update(patch)
      .eq('id', id);
    if (error) throw error;
  }
}
