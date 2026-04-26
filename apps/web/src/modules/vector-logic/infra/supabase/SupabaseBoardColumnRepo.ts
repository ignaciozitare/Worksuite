import type { SupabaseClient } from '@supabase/supabase-js';
import type { IBoardColumnRepo } from '../../domain/ports/IBoardColumnRepo';
import type { BoardColumn } from '../../domain/entities/BoardColumn';

export class SupabaseBoardColumnRepo implements IBoardColumnRepo {
  constructor(private sb: SupabaseClient) {}

  async findByBoard(boardId: string): Promise<BoardColumn[]> {
    const { data, error } = await this.sb
      .from('vl_board_columns')
      .select('*, states:vl_board_column_states(state_id)')
      .eq('board_id', boardId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row: any) => this.toDomain(row));
  }

  async create(draft: Omit<BoardColumn, 'id' | 'createdAt'>): Promise<BoardColumn> {
    const { data, error } = await this.sb
      .from('vl_board_columns')
      .insert({
        board_id: draft.boardId,
        name: draft.name,
        sort_order: draft.sortOrder,
        wip_limit: draft.wipLimit,
      })
      .select()
      .single();
    if (error) throw error;
    if (draft.stateIds.length > 0) {
      await this.replaceStates(data.id, draft.stateIds);
    }
    return { ...this.toDomain(data), stateIds: draft.stateIds };
  }

  async update(id: string, patch: Partial<BoardColumn>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    if (patch.wipLimit !== undefined) row.wip_limit = patch.wipLimit;
    if (Object.keys(row).length > 0) {
      const { error } = await this.sb.from('vl_board_columns').update(row).eq('id', id);
      if (error) throw error;
    }
    if (patch.stateIds !== undefined) {
      await this.replaceStates(id, patch.stateIds);
    }
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

  /** Replace every state mapping for a column atomically (delete + insert). */
  private async replaceStates(columnId: string, stateIds: string[]): Promise<void> {
    const { error: delErr } = await this.sb
      .from('vl_board_column_states')
      .delete()
      .eq('column_id', columnId);
    if (delErr) throw delErr;
    if (stateIds.length === 0) return;
    const { error } = await this.sb
      .from('vl_board_column_states')
      .insert(stateIds.map(state_id => ({ column_id: columnId, state_id })));
    if (error) throw error;
  }

  private toDomain(row: any): BoardColumn {
    const stateRows: Array<{ state_id: string }> = row.states ?? [];
    return {
      id: row.id,
      boardId: row.board_id,
      name: row.name,
      sortOrder: row.sort_order ?? 0,
      wipLimit: row.wip_limit ?? null,
      stateIds: stateRows.map(s => s.state_id),
      createdAt: row.created_at,
    };
  }
}
