
export interface Seat {
  id:             string;        // e.g. "A1", "B3"
  clusterLabel:   string;        // e.g. "Zone A"
  x: number; y: number;
  w: number; h: number;
  isBlocked:      boolean;
  blockedReason?: string;
}

export type SeatStatusValue = "free" | "occupied" | "fixed" | "mine";

export interface SeatStatus {
  seatId: string;
  status: SeatStatusValue;
  reservedBy?: string;
  fixedTo?:    string;
}
