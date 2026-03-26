
import type { ReservationRepository } from "../domain/ports/ReservationRepository";
import type { SeatReservation }       from "../domain/entities/SeatReservation";
import { supabase }                   from "../../../shared/lib/supabaseClient";

export class SupabaseReservationRepository implements ReservationRepository {
  async findByDate(date: string): Promise<SeatReservation[]> {
    const { data, error } = await supabase
      .from("seat_reservations").select("*").eq("date", date);
    if (error) throw error;
    return (data ?? []).map(r => ({ id: r.id, seatId: r.seat_id, date: r.date, userId: r.user_id, userName: r.user_name }));
  }

  async findByDateRange(from: string, to: string): Promise<SeatReservation[]> {
    const { data, error } = await supabase
      .from("seat_reservations").select("*").gte("date", from).lte("date", to);
    if (error) throw error;
    return (data ?? []).map(r => ({ id: r.id, seatId: r.seat_id, date: r.date, userId: r.user_id, userName: r.user_name }));
  }

  async reserve(reservations: Omit<SeatReservation, "id">[]): Promise<void> {
    const rows = reservations.map(r => ({ seat_id: r.seatId, date: r.date, user_id: r.userId, user_name: r.userName }));
    const { error } = await supabase.from("seat_reservations").insert(rows);
    if (error) throw error;
  }

  async cancel(seatId: string, date: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from("seat_reservations").delete()
      .eq("seat_id", seatId).eq("date", date).eq("user_id", userId);
    if (error) throw error;
  }
}
