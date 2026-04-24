import type { SupabaseClient } from '@supabase/supabase-js';
import type { IUserSettingsRepo } from '../../domain/ports/IUserSettingsRepo';
import type { UserSettings } from '../../domain/entities/UserSettings';

export class SupabaseUserSettingsRepo implements IUserSettingsRepo {
  constructor(private sb: SupabaseClient) {}

  async get(userId: string): Promise<UserSettings | null> {
    const { data, error } = await this.sb
      .from('vl_user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data ? this.toDomain(data) : null;
  }

  async upsert(
    userId: string,
    patch: Partial<Omit<UserSettings, 'userId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<UserSettings> {
    const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
    if (patch.doneMaxDays !== undefined) row.done_max_days = patch.doneMaxDays;
    if (patch.doneMaxCount !== undefined) row.done_max_count = patch.doneMaxCount;
    if (patch.homeTimezone !== undefined) row.home_timezone = patch.homeTimezone;
    if (patch.homeCity !== undefined) row.home_city = patch.homeCity;

    const { data, error } = await this.sb
      .from('vl_user_settings')
      .upsert(row, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw error;
    return this.toDomain(data);
  }

  private toDomain(row: any): UserSettings {
    return {
      userId: row.user_id,
      doneMaxDays: row.done_max_days,
      doneMaxCount: row.done_max_count,
      homeTimezone: row.home_timezone,
      homeCity: row.home_city,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
