import type { SupabaseClient } from '@supabase/supabase-js';
import type { IBoardFilterRepo } from '../../domain/ports/IBoardFilterRepo';
import type { BoardFilter } from '../../domain/entities/BoardFilter';

export class SupabaseBoardFilterRepo implements IBoardFilterRepo {
  constructor(private sb: SupabaseClient) {}

  async findByBoard(boardId: string): Promise<BoardFilter[]> {
    const { data, error } = await this.sb
      .from('vl_board_filters')
      .select('*')
      .eq('board_id', boardId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(this.toDomain);
  }

  async create(draft: Omit<BoardFilter, 'id' | 'createdAt'>): Promise<BoardFilter> {
    const { data, error } = await this.sb
      .from('vl_board_filters')
      .insert({
        board_id: draft.boardId,
        dimension: draft.dimension,
        value: draft.value ?? [],
      })
      .select()
      .single();
    if (error) throw error;
    return this.toDomain(data);
  }

  async update(id: string, patch: Partial<BoardFilter>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.dimension !== undefined) row.dimension = patch.dimension;
    if (patch.value !== undefined) row.value = patch.value;
    const { error } = await this.sb.from('vl_board_filters').update(row).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_board_filters').delete().eq('id', id);
    if (error) throw error;
  }

  async replaceAll(
    boardId: string,
    drafts: Array<Omit<BoardFilter, 'id' | 'createdAt'>>,
  ): Promise<BoardFilter[]> {
    const { error: delErr } = await this.sb
      .from('vl_board_filters')
      .delete()
      .eq('board_id', boardId);
    if (delErr) throw delErr;
    if (drafts.length === 0) return [];
    const { data, error } = await this.sb
      .from('vl_board_filters')
      .insert(drafts.map(d => ({
        board_id: d.boardId,
        dimension: d.dimension,
        value: d.value ?? [],
      })))
      .select();
    if (error) throw error;
    return (data ?? []).map(this.toDomain);
  }

  private toDomain(row: any): BoardFilter {
    return {
      id: row.id,
      boardId: row.board_id,
      dimension: row.dimension,
      value: row.value,
      createdAt: row.created_at,
    };
  }
}
