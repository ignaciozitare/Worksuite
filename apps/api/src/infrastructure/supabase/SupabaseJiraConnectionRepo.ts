import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IJiraConnectionRepository,
  JiraConnection,
  JiraConnectionSummary,
} from '../../domain/jira/IJiraConnectionRepository.js';

export class SupabaseJiraConnectionRepo implements IJiraConnectionRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findByUserId(userId: string): Promise<JiraConnection | null> {
    const { data, error } = await this.db
      .from('jira_connections')
      .select('user_id, base_url, email, api_token, connected_at, updated_at')
      .eq('user_id', userId)
      .single();
    if (error || !data) return null;
    return data as JiraConnection;
  }

  async findSummaryByUserId(userId: string): Promise<JiraConnectionSummary | null> {
    const { data, error } = await this.db
      .from('jira_connections')
      .select('base_url, email, connected_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return data as JiraConnectionSummary;
  }

  async findAny(): Promise<JiraConnection | null> {
    const { data } = await this.db
      .from('jira_connections')
      .select('user_id, base_url, email, api_token, connected_at, updated_at')
      .limit(1)
      .single();
    return (data as JiraConnection) ?? null;
  }

  async upsert(conn: Omit<JiraConnection, 'connected_at' | 'updated_at'>): Promise<void> {
    const { error } = await this.db
      .from('jira_connections')
      .upsert(
        { user_id: conn.user_id, base_url: conn.base_url, email: conn.email, api_token: conn.api_token },
        { onConflict: 'user_id' },
      );
    if (error) throw new Error(`Failed to upsert jira connection: ${error.message}`);
  }

  async updateUrlAndEmail(userId: string, baseUrl: string, email: string): Promise<void> {
    const { error } = await this.db
      .from('jira_connections')
      .update({ base_url: baseUrl, email, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to update jira connection: ${error.message}`);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.db.from('jira_connections').delete().eq('user_id', userId);
  }
}
