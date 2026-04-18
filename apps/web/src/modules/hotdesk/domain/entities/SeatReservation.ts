
export type ReservationStatus = 'pending' | 'confirmed' | 'released';

export interface SeatReservation {
  id:           string;
  seatId:       string;
  date:         string;
  userId:       string;
  userName:     string;
  status:       ReservationStatus;
  confirmedAt?: string;
  delegatedBy?: string;
}

export interface FixedAssignment {
  seatId:   string;
  userId:   string;
  userName: string;
}
