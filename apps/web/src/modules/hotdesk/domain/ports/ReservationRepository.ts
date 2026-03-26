
import type { SeatReservation } from "../entities/SeatReservation";

export interface ReservationRepository {
  findByDate(date: string): Promise<SeatReservation[]>;
  findByDateRange(from: string, to: string): Promise<SeatReservation[]>;
  reserve(reservations: Omit<SeatReservation, "id">[]): Promise<void>;
  cancel(seatId: string, date: string, userId: string): Promise<void>;
}
