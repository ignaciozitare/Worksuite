import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminUserPort } from '../domain/ports/AdminUserPort';

export class SupabaseAdminUserRepo implements AdminUserPort {
  constructor(private readonly db: SupabaseClient) {}

  async updateJiraToken(userId: string, token: string): Promise<void> {
    const { error } = await this.db
      .from('users')
      .update({ jira_api_token: token })
      .eq('id', userId);
    if (error) throw error;
  }

  async getJiraToken(userId: string): Promise<string | null> {
    const { data, error } = await this.db
      .from('users')
      .select('jira_api_token')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data?.jira_api_token ?? null;
  }
}
