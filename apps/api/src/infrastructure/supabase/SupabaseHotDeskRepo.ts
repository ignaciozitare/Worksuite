import type { SupabaseClient } from '@supabase/supabase-js';
import { Seat, SeatReservation, FixedAssignment } from '../../domain/hotdesk/HotDesk.js';
import type { IHotDeskRepository } from '../../domain/hotdesk/IHotDeskRepository.js';

export class SupabaseHotDeskRepo implements IHotDeskRepository {
  constructor(private readonly db: SupabaseClient) {}

  async getSeats(): Promise<Seat[]> {
    const { data, error } = await this.db.from('seats').select('*').order('id');
    if (error) throw new Error(`Failed to fetch seats: ${error.message}`);
    return (data ?? []).map(
      (r) => new Seat(r.id as string, r.zone as string, r.label as string, { x: r.x as number, y: r.y as number }),
    );
  }

  async getReservations(from: string, to: string): Promise<SeatReservation[]> {
    const { data, error } = await this.db
      .from('seat_reservations')
      .select('*')
      .gte('date', from)
      .lte('date', to);
    if (error) throw new Error(`Failed to fetch reservations: ${error.message}`);
    return (data ?? []).map((r) =>
      SeatReservation.reconstitute({
        id: r.id as string, seatId: r.seat_id as string,
        userId: r.user_id as string, userName: r.user_name as string,
        date: r.date as string, createdAt: r.created_at as string,
      }),
    );
  }

  async getFixedAssignments(): Promise<FixedAssignment[]> {
    const { data, error } = await this.db.from('fixed_assignments').select('*');
    if (error) throw new Error(`Failed to fetch fixed assignments: ${error.message}`);
    return (data ?? []).map(
      (r) => new FixedAssignment(r.seat_id as string, r.user_id as string, r.user_name as string),
    );
  }

  async saveReservation(reservation: SeatReservation): Promise<void> {
    const { error } = await this.db.from('seat_reservations').upsert({
      id: reservation.id, seat_id: reservation.seatId,
      user_id: reservation.userId, user_name: reservation.userName,
      date: reservation.date,
    });
    if (error) throw new Error(`Failed to save reservation: ${error.message}`);
  }

  // FIX: userId ya no es ignorado — se filtra en la query para cumplir
  // el contrato del puerto y evitar borrados no autorizados si alguna
  // llamada futura usa service_role_key (que bypasea RLS).
  async deleteReservation(seatId: string, date: string, userId: string): Promise<void> {
    const { error } = await this.db
      .from('seat_reservations')
      .delete()
      .eq('seat_id', seatId)
      .eq('date', date)
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to delete reservation: ${error.message}`);
  }

  async upsertFixedAssignment(assignment: FixedAssignment): Promise<void> {
    const { error } = await this.db.from('fixed_assignments').upsert({
      seat_id: assignment.seatId, user_id: assignment.userId, user_name: assignment.userName,
    });
    if (error) throw new Error(`Failed to upsert fixed assignment: ${error.message}`);
  }

  async removeFixedAssignment(seatId: string): Promise<void> {
    const { error } = await this.db.from('fixed_assignments').delete().eq('seat_id', seatId);
    if (error) throw new Error(`Failed to remove fixed assignment: ${error.message}`);
  }
}
