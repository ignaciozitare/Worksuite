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
  upsertReservations(rows: Omit<ReservationRow, 'created_at'>[]): Promise<void>;
  removeReservation(seatId: string, date: string, userId: string): Promise<void>;
}
