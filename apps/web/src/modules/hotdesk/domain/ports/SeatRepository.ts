
import type { FixedAssignment } from "../entities/SeatReservation";

export interface SeatRepository {
  getFixedAssignments(): Promise<FixedAssignment[]>;
  setFixedAssignment(a: FixedAssignment): Promise<void>;
  removeFixedAssignment(seatId: string): Promise<void>;
}
