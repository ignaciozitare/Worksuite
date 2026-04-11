import type { SupabaseClient } from '@supabase/supabase-js';
import type { IDeployReleaseRawRepo, DeployReleaseRow } from '../../domain/ports/IDeployReleaseRawRepo';

export class SupabaseDeployReleaseRawRepo implements IDeployReleaseRawRepo {
  constructor(private db: SupabaseClient) {}

  async listRaw(): Promise<DeployReleaseRow[]> {
    const { data, error } = await this.db
      .from('dp_releases')
      .select('*')
      .order('start_date', { ascending: true });
    if (error) throw error;
    return (data ?? []) as DeployReleaseRow[];
  }

  async insertRaw(row: Partial<DeployReleaseRow>): Promise<DeployReleaseRow | null> {
    const { data, error } = await this.db
      .from('dp_releases')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return (data ?? null) as DeployReleaseRow | null;
  }

  async updateRaw(id: string, patch: Partial<DeployReleaseRow>): Promise<void> {
    const { error } = await this.db
      .from('dp_releases')
      .update(patch)
      .eq('id', id);
    if (error) throw error;
  }

  async deleteRaw(id: string): Promise<void> {
    const { error } = await this.db
      .from('dp_releases')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
