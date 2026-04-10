import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminUserPort } from '../domain/ports/AdminUserPort';

export class SupabaseAdminUserRepo implements AdminUserPort {
  constructor(private readonly db: SupabaseClient) {}

  async updateJiraToken(userId: string, token: string | null): Promise<void> {
    const { error } = await this.db.from('users').update({ jira_api_token: token }).eq('id', userId);
    if (error) throw error;
  }

  async getJiraToken(userId: string): Promise<string | null> {
    const { data, error } = await this.db.from('users').select('jira_api_token').eq('id', userId).single();
    if (error) throw error;
    return data?.jira_api_token ?? null;
  }

  async updateRole(userId: string, role: string): Promise<void> {
    const { error } = await this.db.from('users').update({ role }).eq('id', userId);
    if (error) throw error;
  }

  async updateActive(userId: string, active: boolean): Promise<void> {
    const { error } = await this.db.from('users').update({ active }).eq('id', userId);
    if (error) throw error;
  }

  async updateDeskType(userId: string, deskType: string): Promise<void> {
    const { error } = await this.db.from('users').update({ desk_type: deskType }).eq('id', userId);
    if (error) throw error;
  }

  async updateModules(userId: string, modules: string[]): Promise<void> {
    const { error } = await this.db.from('users').update({ modules }).eq('id', userId);
    if (error) throw error;
  }

  async updateExportPresets(userId: string, presets: unknown[]): Promise<void> {
    const { error } = await this.db.from('users').update({ export_presets: presets }).eq('id', userId);
    if (error) throw error;
  }

  async createUser(payload: { name: string; email: string; password: string; role: string; desk_type: string }): Promise<any> {
    const session = await this.db.auth.getSession();
    const token = session.data.session?.access_token;
    const url = (import.meta as any).env?.VITE_SUPABASE_URL;
    const apikey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
    const res = await fetch(`${url}/functions/v1/create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': apikey,
      },
      body: JSON.stringify(payload),
    });
    return res.json();
  }
}
