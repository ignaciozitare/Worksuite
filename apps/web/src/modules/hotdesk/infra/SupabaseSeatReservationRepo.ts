import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeatReservationPort, ReservationRow, FixedAssignmentRow, SeatRow } from '../domain/ports/SeatReservationPort';

export class SupabaseSeatReservationRepo implements SeatReservationPort {
  constructor(private readonly db: SupabaseClient) {}

  async findAllReservations(): Promise<ReservationRow[]> {
    const { data, error } = await this.db.from('seat_reservations').select('*');
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id, seat_id: r.seat_id, user_id: r.user_id,
      user_name: r.user_name, date: r.date?.slice(0, 10),
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

  async removeReservation(seatId: string, date: string, userId: string): Promise<void> {
    const { error } = await this.db.from('seat_reservations')
      .delete().eq('seat_id', seatId).eq('date', date).eq('user_id', userId);
    if (error) throw error;
  }
}
