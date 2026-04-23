import type { SupabaseClient } from '@supabase/supabase-js';
import type { IWorldCityRepo } from '../../domain/ports/IWorldCityRepo';
import type { WorldCity } from '../../domain/entities/WorldCity';

export class SupabaseWorldCityRepo implements IWorldCityRepo {
  constructor(private sb: SupabaseClient) {}

  async list(userId: string): Promise<WorldCity[]> {
    const { data, error } = await this.sb
      .from('vl_user_world_cities')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => this.toDomain(row));
  }

  async create(draft: Omit<WorldCity, 'id' | 'createdAt'>): Promise<WorldCity> {
    const { data, error } = await this.sb
      .from('vl_user_world_cities')
      .insert({
        user_id: draft.userId,
        city_name: draft.cityName,
        timezone: draft.timezone,
        sort_order: draft.sortOrder,
      })
      .select()
      .single();
    if (error) throw error;
    return this.toDomain(data);
  }

  async update(id: string, patch: Partial<WorldCity>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.cityName !== undefined) row.city_name = patch.cityName;
    if (patch.timezone !== undefined) row.timezone = patch.timezone;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    const { error } = await this.sb.from('vl_user_world_cities').update(row).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_user_world_cities').delete().eq('id', id);
    if (error) throw error;
  }

  async reorder(updates: Array<{ id: string; sortOrder: number }>): Promise<void> {
    await Promise.all(
      updates.map((u) =>
        this.sb.from('vl_user_world_cities').update({ sort_order: u.sortOrder }).eq('id', u.id),
      ),
    );
  }

  private toDomain(row: any): WorldCity {
    return {
      id: row.id,
      userId: row.user_id,
      cityName: row.city_name,
      timezone: row.timezone,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
    };
  }
}
