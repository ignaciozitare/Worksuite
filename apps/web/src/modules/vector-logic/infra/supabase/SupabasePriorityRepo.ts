import type { SupabaseClient } from '@supabase/supabase-js';
import type { IPriorityRepo } from '../../domain/ports/IPriorityRepo';
import type { Priority } from '../../domain/entities/Priority';

const DEFAULTS: Array<Omit<Priority, 'id' | 'userId' | 'createdAt'>> = [
  { name: 'Low',    color: '#8c909f', sortOrder: 0 },
  { name: 'Medium', color: '#4f6ef7', sortOrder: 1 },
  { name: 'High',   color: '#f59e0b', sortOrder: 2 },
  { name: 'Urgent', color: '#e05252', sortOrder: 3 },
];

export class SupabasePriorityRepo implements IPriorityRepo {
  constructor(private sb: SupabaseClient) {}

  async list(userId: string): Promise<Priority[]> {
    const { data, error } = await this.sb
      .from('vl_priorities')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => this.toDomain(row));
  }

  async create(p: Omit<Priority, 'id' | 'createdAt'>): Promise<Priority> {
    const { data, error } = await this.sb
      .from('vl_priorities')
      .insert({
        user_id: p.userId,
        name: p.name,
        color: p.color,
        icon: p.icon ?? null,
        sort_order: p.sortOrder,
      })
      .select()
      .single();
    if (error) throw error;
    return this.toDomain(data);
  }

  async update(id: string, patch: Partial<Priority>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.color !== undefined) row.color = patch.color;
    if (patch.icon !== undefined) row.icon = patch.icon;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    const { error } = await this.sb.from('vl_priorities').update(row).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_priorities').delete().eq('id', id);
    if (error) throw error;
  }

  async ensureDefaults(userId: string): Promise<Priority[]> {
    const existing = await this.list(userId);
    if (existing.length > 0) return existing;
    const created: Priority[] = [];
    for (const d of DEFAULTS) {
      created.push(await this.create({ userId, ...d }));
    }
    return created;
  }

  private toDomain(row: any): Priority {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      color: row.color,
      icon: row.icon ?? null,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
    };
  }
}
