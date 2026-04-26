import type { SupabaseClient } from '@supabase/supabase-js';
import type { IBoardRepo } from '../../domain/ports/IBoardRepo';
import type { KanbanBoard } from '../../domain/entities/KanbanBoard';

export class SupabaseBoardRepo implements IBoardRepo {
  constructor(private sb: SupabaseClient) {}

  async findAccessible(): Promise<KanbanBoard[]> {
    const { data, error } = await this.sb
      .from('vl_kanban_boards')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(this.toDomain);
  }

  async findById(id: string): Promise<KanbanBoard | null> {
    const { data, error } = await this.sb
      .from('vl_kanban_boards')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? this.toDomain(data) : null;
  }

  async create(draft: Omit<KanbanBoard, 'id' | 'createdAt' | 'updatedAt'>): Promise<KanbanBoard> {
    const { data, error } = await this.sb
      .from('vl_kanban_boards')
      .insert({
        owner_id: draft.ownerId,
        name: draft.name,
        description: draft.description,
        icon: draft.icon,
        visibility: draft.visibility,
        is_default: draft.isDefault ?? false,
      })
      .select()
      .single();
    if (error) throw error;
    return this.toDomain(data);
  }

  async update(id: string, patch: Partial<KanbanBoard>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.icon !== undefined) row.icon = patch.icon;
    if (patch.visibility !== undefined) row.visibility = patch.visibility;
    const { error } = await this.sb.from('vl_kanban_boards').update(row).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_kanban_boards').delete().eq('id', id);
    if (error) throw error;
  }

  private toDomain(row: any): KanbanBoard {
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      description: row.description ?? null,
      icon: row.icon ?? null,
      visibility: row.visibility,
      isDefault: row.is_default ?? false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
