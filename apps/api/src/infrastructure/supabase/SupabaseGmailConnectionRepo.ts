import type { SupabaseClient } from '@supabase/supabase-js';
import type { IGmailConnectionRepo } from '../../domain/emailIntel/IEmailIntelRepos.js';
import type { GmailConnection } from '../../domain/emailIntel/types.js';

export class SupabaseGmailConnectionRepo implements IGmailConnectionRepo {
  constructor(private readonly db: SupabaseClient) {}

  async findByUserId(userId: string): Promise<GmailConnection | null> {
    const { data, error } = await this.db
      .from('vl_gmail_connections')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return data as GmailConnection;
  }

  async upsert(conn: Omit<GmailConnection, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
    const { error } = await this.db
      .from('vl_gmail_connections')
      .upsert(conn, { onConflict: 'user_id' });
    if (error) throw new Error(`Failed to upsert gmail connection: ${error.message}`);
  }

  async updateSettings(userId: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await this.db
      .from('vl_gmail_connections')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to update gmail settings: ${error.message}`);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.db.from('vl_gmail_connections').delete().eq('user_id', userId);
  }
}
