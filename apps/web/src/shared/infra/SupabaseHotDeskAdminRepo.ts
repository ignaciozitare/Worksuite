import type { SupabaseClient } from '@supabase/supabase-js';
import type { HotDeskAdminPort, BlockedSeat } from '../domain/ports/HotDeskAdminPort';

export class SupabaseHotDeskAdminRepo implements HotDeskAdminPort {
  constructor(private readonly db: SupabaseClient) {}

  async upsertFixedAssignment(seatId: string, userId: string, userName: string): Promise<void> {
    const { error } = await this.db
      .from('fixed_assignments')
      .upsert({ seat_id: seatId, user_id: userId, user_name: userName }, { onConflict: 'seat_id' });
    if (error) throw error;
  }

  async removeFixedAssignment(seatId: string): Promise<void> {
    const { error } = await this.db
      .from('fixed_assignments')
      .delete()
      .eq('seat_id', seatId);
    if (error) throw error;
  }

  async upsertReservations(
    rows: { id: string; seat_id: string; user_id: string; user_name: string; date: string }[],
  ): Promise<void> {
    const { error } = await this.db
      .from('seat_reservations')
      .upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }

  async getBlockedSeats(): Promise<BlockedSeat[]> {
    const { data, error } = await this.db
      .from('seats')
      .select('seat_id, is_blocked, blocked_reason')
      .eq('is_blocked', true);
    if (error) throw error;
    return (data ?? []) as BlockedSeat[];
  }

  async blockSeat(seatId: string, reason: string): Promise<void> {
    const { error } = await this.db
      .from('seats')
      .update({ is_blocked: true, blocked_reason: reason })
      .eq('seat_id', seatId);
    if (error) throw error;
  }

  async unblockSeat(seatId: string): Promise<void> {
    const { error } = await this.db
      .from('seats')
      .update({ is_blocked: false, blocked_reason: null })
      .eq('seat_id', seatId);
    if (error) throw error;
  }
}
