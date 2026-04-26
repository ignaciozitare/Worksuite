import type { SupabaseClient } from '@supabase/supabase-js';
import type { IBoardColumnRepo } from '../../domain/ports/IBoardColumnRepo';
import type { BoardColumn } from '../../domain/entities/BoardColumn';

export class SupabaseBoardColumnRepo implements IBoardColumnRepo {
  constructor(private sb: SupabaseClient) {}

  async findByBoard(boardId: string): Promise<BoardColumn[]> {
    const { data, error } = await this.sb
      .from('vl_board_columns')
      .select('*')
      .eq('board_id', boardId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(this.toDomain);
  }

  async create(draft: Omit<BoardColumn, 'id' | 'createdAt'>): Promise<BoardColumn> {
    const { data, error } = await this.sb
      .from('vl_board_columns')
      .insert({
        board_id: draft.boardId,
        state_id: draft.stateId,
        sort_order: draft.sortOrder,
        wip_limit: draft.wipLimit,
      })
      .select()
      .single();
    if (error) throw error;
    return this.toDomain(data);
  }

  async update(id: string, patch: Partial<BoardColumn>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.stateId !== undefined) row.state_id = patch.stateId;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    if (patch.wipLimit !== undefined) row.wip_limit = patch.wipLimit;
    const { error } = await this.sb.from('vl_board_columns').update(row).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_board_columns').delete().eq('id', id);
    if (error) throw error;
  }

  async reorder(updates: Array<{ id: string; sortOrder: number }>): Promise<void> {
    await Promise.all(updates.map(({ id, sortOrder }) =>
      this.sb.from('vl_board_columns').update({ sort_order: sortOrder }).eq('id', id),
    ));
  }

  private toDomain(row: any): BoardColumn {
    return {
      id: row.id,
      boardId: row.board_id,
      stateId: row.state_id,
      sortOrder: row.sort_order ?? 0,
      wipLimit: row.wip_limit ?? null,
      createdAt: row.created_at,
    };
  }
}
