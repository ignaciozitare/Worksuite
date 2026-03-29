import type { SupabaseClient } from '@supabase/supabase-js';
import type { IUserRepository, UserProfile } from '../../domain/user/IUserRepository.js';

export class SupabaseUserRepo implements IUserRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findById(id: string): Promise<UserProfile | null> {
    const { data, error } = await this.db
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return null;
    return data as UserProfile;
  }

  async findByEmail(email: string): Promise<UserProfile | null> {
    const { data, error } = await this.db
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    if (error || !data) return null;
    return data as UserProfile;
  }
}
