import type { SeatReservation, FixedAssignment, Seat } from './HotDesk.js';

export interface IHotDeskRepository {
  getSeats(): Promise<Seat[]>;
  getReservations(from: string, to: string): Promise<SeatReservation[]>;
  getFixedAssignments(): Promise<FixedAssignment[]>;
  saveReservation(reservation: SeatReservation): Promise<void>;
  deleteReservation(seatId: string, date: string, userId: string): Promise<void>;
  upsertFixedAssignment(assignment: FixedAssignment): Promise<void>;
  removeFixedAssignment(seatId: string): Promise<void>;
}
