import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeatReservationPort, ReservationRow, FixedAssignmentRow, SeatRow } from '../domain/ports/SeatReservationPort';
import { ConflictError } from '@/shared/domain/errors/ConflictError';

export class SupabaseSeatReservationRepo implements SeatReservationPort {
  constructor(private readonly db: SupabaseClient) {}

  async findAllReservations(): Promise<ReservationRow[]> {
    const { data, error } = await this.db.from('seat_reservations').select('*');
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id, seat_id: r.seat_id, user_id: r.user_id,
      user_name: r.user_name, date: r.date?.slice(0, 10),
      status: r.status ?? 'pending',
      confirmed_at: r.confirmed_at ?? undefined,
      delegated_by: r.delegated_by ?? undefined,
    }));
  }

  async findAllFixed(): Promise<FixedAssignmentRow[]> {
    const { data, error } = await this.db.from('fixed_assignments').select('*');
    if (error) throw error;
    return data || [];
  }

  async findAllSeats(): Promise<SeatRow[]> {
    const { data, error } = await this.db.from('seats').select('*').order('id');
    if (error) throw error;
    return data || [];
  }

  async upsertReservations(rows: Omit<ReservationRow, 'created_at'>[]): Promise<void> {
    const { error } = await this.db.from('seat_reservations').upsert(rows, { onConflict: 'seat_id,date' });
    if (error) throw error;
  }

  async insertReservations(rows: Omit<ReservationRow, 'created_at'>[]): Promise<{ date: string; success: boolean }[]> {
    // Use the RPC batch function for atomic per-date conflict detection
    const payload = rows.map(r => ({
      id: r.id, seat_id: r.seat_id, user_id: r.user_id,
      user_name: r.user_name, date: r.date, status: r.status,
    }));
    const { data, error } = await this.db.rpc('reserve_seats_batch', { p_rows: payload });
    if (error) {
      // Fallback: if RPC doesn't exist yet, try direct INSERT
      if (error.code === '42883') { // function does not exist
        const { error: insertErr } = await this.db.from('seat_reservations').insert(rows);
        if (insertErr) {
          if (insertErr.code === '23505') {
            throw new ConflictError('seat', insertErr.message);
          }
          throw insertErr;
        }
        return rows.map(r => ({ date: r.date, success: true }));
      }
      throw error;
    }
    const results = (data as { date: string; success: boolean }[]) ?? [];
    const hasConflict = results.some(r => !r.success);
    if (hasConflict) {
      throw new ConflictError('seat', results.filter(r => !r.success).map(r => r.date).join(', '));
    }
    return results;
  }

  async removeReservation(seatId: string, date: string, userId: string): Promise<void> {
    const { error } = await this.db.from('seat_reservations')
      .delete().eq('seat_id', seatId).eq('date', date).eq('user_id', userId);
    if (error) throw error;
  }
}
