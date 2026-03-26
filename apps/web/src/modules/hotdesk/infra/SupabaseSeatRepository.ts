
import type { SeatRepository }    from "../domain/ports/SeatRepository";
import type { FixedAssignment }   from "../domain/entities/SeatReservation";
import { supabase }               from "../../../shared/lib/supabaseClient";

export class SupabaseSeatRepository implements SeatRepository {
  async getFixedAssignments(): Promise<FixedAssignment[]> {
    const { data, error } = await supabase.from("fixed_assignments").select("*");
    if (error) throw error;
    return (data ?? []).map(r => ({
      seatId:   r.seat_id,
      userId:   r.user_id,
      userName: r.user_name,
    }));
  }

  async setFixedAssignment(a: FixedAssignment): Promise<void> {
    const { error } = await supabase
      .from("fixed_assignments")
      .upsert({ seat_id: a.seatId, user_id: a.userId, user_name: a.userName }, { onConflict: "seat_id" });
    if (error) throw error;
  }

  async removeFixedAssignment(seatId: string): Promise<void> {
    const { error } = await supabase.from("fixed_assignments").delete().eq("seat_id", seatId);
    if (error) throw error;
  }
}
