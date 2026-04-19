export interface ReservationRow {
  id: string;
  seat_id: string;
  user_id: string;
  user_name: string;
  date: string;
  status: 'pending' | 'confirmed' | 'released';
  confirmed_at?: string;
  delegated_by?: string;
}

export interface FixedAssignmentRow {
  seat_id: string;
  user_id: string;
  user_name: string;
}

export interface SeatRow {
  id: string;
  zone: string;
  label: string;
  x: number;
  y: number;
  is_blocked: boolean;
  blocked_reason?: string;
}

export interface SeatReservationPort {
  findAllReservations(): Promise<ReservationRow[]>;
  findAllFixed(): Promise<FixedAssignmentRow[]>;
  findAllSeats(): Promise<SeatRow[]>;
  /** @deprecated Use insertReservations — upsert silently overwrites on conflict */
  upsertReservations(rows: Omit<ReservationRow, 'created_at'>[]): Promise<void>;
  insertReservations(rows: Omit<ReservationRow, 'created_at'>[]): Promise<{ date: string; success: boolean }[]>;
  removeReservation(seatId: string, date: string, userId: string): Promise<void>;
}
