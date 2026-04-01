import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoleData, RolePort } from '../domain/ports/RolePort';

export class SupabaseRoleRepo implements RolePort {
  constructor(private readonly db: SupabaseClient) {}

  async findAll(): Promise<RoleData[]> {
    const { data, error } = await this.db.from('roles').select('*').order('created_at');
    if (error) throw error;
    return data || [];
  }

  async create(role: Omit<RoleData, 'id' | 'created_at'>): Promise<RoleData> {
    const { data, error } = await this.db
      .from('roles')
      .insert(role)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from('roles').delete().eq('id', id);
    if (error) throw error;
  }

  async updatePermissions(id: string, permissions: any): Promise<void> {
    const { error } = await this.db
      .from('roles')
      .update({ permissions })
      .eq('id', id);
    if (error) throw error;
  }

  async updateDescription(id: string, description: string): Promise<void> {
    const { error } = await this.db
      .from('roles')
      .update({ description })
      .eq('id', id);
    if (error) throw error;
  }
}
