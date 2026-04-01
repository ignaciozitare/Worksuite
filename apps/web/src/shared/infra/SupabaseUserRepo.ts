import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserPort, UserRow } from '../domain/ports/UserPort';

export class SupabaseUserRepo implements UserPort {
  constructor(private readonly db: SupabaseClient) {}

  async findAll(): Promise<UserRow[]> {
    const { data, error } = await this.db.from('users').select('*').order('name');
    if (error) throw error;
    return data || [];
  }
}
