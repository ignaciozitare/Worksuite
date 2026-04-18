import { SeatStatusEnum } from '../entities/constants';

interface ReservationRecord {
  seatId: string;
  date: string;
  userId: string;
  userName: string;
  status?: string;
  delegatedBy?: string;
}

/** Domain Service — reservation logic */
export const ReservationService = {
  statusOf(
    seat: string,
    date: string,
    fixed: Record<string, string>,
    reservations: Array<{ seatId: string; date: string; status?: string; delegatedBy?: string }>,
    blockedSeats?: Record<string, string>,
  ): string {
    if (blockedSeats && blockedSeats[seat]) return SeatStatusEnum.BLOCKED;
    if (fixed[seat]) return SeatStatusEnum.FIXED;
    const res = reservations.find(r => r.seatId === seat && r.date === date);
    if (!res) return SeatStatusEnum.FREE;
    if (res.delegatedBy) return SeatStatusEnum.DELEGATED;
    if (res.status === 'pending') return SeatStatusEnum.PENDING;
    return SeatStatusEnum.OCCUPIED;
  },
  resOf(seat: string, date: string, reservations: ReservationRecord[]): ReservationRecord | null {
    return reservations.find(r => r.seatId === seat && r.date === date) || null;
  },
  isWeekend(iso: string): boolean {
    const d = new Date(iso + "T00:00:00").getDay();
    return d === 0 || d === 6;
  },
};
