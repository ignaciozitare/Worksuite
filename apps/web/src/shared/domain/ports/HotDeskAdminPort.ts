export interface BlockedSeat {
  seat_id: string;
  is_blocked: boolean;
  blocked_reason: string | null;
}

export interface HotDeskAdminPort {
  upsertFixedAssignment(seatId: string, userId: string, userName: string): Promise<void>;
  removeFixedAssignment(seatId: string): Promise<void>;
  upsertReservations(rows: { id: string; seat_id: string; user_id: string; user_name: string; date: string }[]): Promise<void>;
  getBlockedSeats(): Promise<BlockedSeat[]>;
  blockSeat(seatId: string, reason: string): Promise<void>;
  unblockSeat(seatId: string): Promise<void>;
}
