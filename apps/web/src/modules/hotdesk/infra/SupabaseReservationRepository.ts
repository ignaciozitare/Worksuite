
import type { ReservationRepository } from "../domain/ports/ReservationRepository";
import type { SeatReservation }       from "../domain/entities/SeatReservation";
import { supabase }                   from "../../../shared/lib/supabaseClient";

function mapRow(r: Record<string, unknown>): SeatReservation {
  const row: SeatReservation = {
    id:          r.id as string,
    seatId:      r.seat_id as string,
    date:        r.date as string,
    userId:      r.user_id as string,
    userName:    r.user_name as string,
    status:      (r.status as SeatReservation["status"]) ?? "pending",
  };
  if (r.confirmed_at) row.confirmedAt = r.confirmed_at as string;
  if (r.delegated_by) row.delegatedBy = r.delegated_by as string;
  return row;
}

export class SupabaseReservationRepository implements ReservationRepository {
  async findByDate(date: string): Promise<SeatReservation[]> {
    const { data, error } = await supabase
      .from("seat_reservations").select("*").eq("date", date);
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async findByDateRange(from: string, to: string): Promise<SeatReservation[]> {
    const { data, error } = await supabase
      .from("seat_reservations").select("*").gte("date", from).lte("date", to);
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async reserve(reservations: Omit<SeatReservation, "id">[]): Promise<void> {
    const rows = reservations.map(r => ({
      seat_id: r.seatId, date: r.date, user_id: r.userId, user_name: r.userName,
      status: r.status ?? "pending",
      delegated_by: r.delegatedBy ?? null,
    }));
    const { error } = await supabase.from("seat_reservations").insert(rows);
    if (error) throw error;
  }

  async cancel(seatId: string, date: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from("seat_reservations").delete()
      .eq("seat_id", seatId).eq("date", date).eq("user_id", userId);
    if (error) throw error;
  }

  async confirmReservation(seatId: string, date: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from("seat_reservations")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("seat_id", seatId)
      .eq("date", date)
      .eq("user_id", userId);
    if (error) throw error;
  }

  async delegateSeat(seatId: string, dates: string[], fromUserId: string, toUserId: string): Promise<void> {
    const rows = dates.map(date => ({
      seat_id: seatId,
      date,
      user_id: toUserId,
      user_name: "",
      status: "pending" as const,
      delegated_by: fromUserId,
    }));
    const { error } = await supabase.from("seat_reservations").insert(rows);
    if (error) throw error;
  }
}
