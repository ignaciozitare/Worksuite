import type { SupabaseClient } from '@supabase/supabase-js';
import type { RetroActionablePort, ActionableData } from '../domain/ports/RetroActionablePort';

export class SupabaseRetroActionableRepo implements RetroActionablePort {
  constructor(private readonly db: SupabaseClient) {}

  async findAll(): Promise<ActionableData[]> {
    const { data, error } = await this.db
      .from('retro_actionables')
      .select('*');
    if (error) throw error;
    return data || [];
  }

  async upsertMany(items: Omit<ActionableData, 'created_at'>[]): Promise<void> {
    if (!items.length) return;
    const { error } = await this.db
      .from('retro_actionables')
      .upsert(items, { onConflict: 'id' });
    if (error) throw error;
  }

  async updateStatus(id: string, status: string): Promise<void> {
    const { error } = await this.db
      .from('retro_actionables')
      .update({ status })
      .eq('id', id);
    if (error) throw error;
  }
}
