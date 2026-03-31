import type { SupabaseClient } from '@supabase/supabase-js';
import type { RetroSessionPort, RetroSessionData, SaveSessionInput } from '../domain/ports/RetroSessionPort';

export class SupabaseRetroSessionRepo implements RetroSessionPort {
  constructor(private readonly db: SupabaseClient) {}

  async findAll(): Promise<RetroSessionData[]> {
    const { data, error } = await this.db
      .from('retro_sessions')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async save(input: SaveSessionInput): Promise<RetroSessionData> {
    const { data, error } = await this.db
      .from('retro_sessions')
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}
