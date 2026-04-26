import type { SupabaseClient } from '@supabase/supabase-js';
import type { IBoardMemberRepo } from '../../domain/ports/IBoardMemberRepo';
import type { BoardMember } from '../../domain/entities/BoardMember';

export class SupabaseBoardMemberRepo implements IBoardMemberRepo {
  constructor(private sb: SupabaseClient) {}

  async findByBoard(boardId: string): Promise<BoardMember[]> {
    const { data, error } = await this.sb
      .from('vl_board_members')
      .select('*')
      .eq('board_id', boardId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(this.toDomain);
  }

  async upsert(draft: Omit<BoardMember, 'id' | 'createdAt'>): Promise<BoardMember> {
    const { data, error } = await this.sb
      .from('vl_board_members')
      .upsert({
        board_id: draft.boardId,
        user_id: draft.userId,
        permission: draft.permission,
      }, { onConflict: 'board_id,user_id' })
      .select()
      .single();
    if (error) throw error;
    return this.toDomain(data);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_board_members').delete().eq('id', id);
    if (error) throw error;
  }

  async removeAllByBoard(boardId: string): Promise<void> {
    const { error } = await this.sb
      .from('vl_board_members')
      .delete()
      .eq('board_id', boardId);
    if (error) throw error;
  }

  private toDomain(row: any): BoardMember {
    return {
      id: row.id,
      boardId: row.board_id,
      userId: row.user_id,
      permission: row.permission,
      createdAt: row.created_at,
    };
  }
}
