
export interface SeatReservation {
  id:       string;
  seatId:   string;
  date:     string;
  userId:   string;
  userName: string;
}

export interface FixedAssignment {
  seatId:   string;
  userId:   string;
  userName: string;
}
