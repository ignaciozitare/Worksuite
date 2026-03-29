import { SeatStatusEnum } from '../entities/constants';

/** Domain Service — reservation logic */
export const ReservationService = {
  statusOf(seat: string, date: string, fixed: Record<string, string>, reservations: Array<{ seatId: string; date: string }>): string {
    if (fixed[seat]) return SeatStatusEnum.FIXED;
    return reservations.find(r => r.seatId === seat && r.date === date)
      ? SeatStatusEnum.OCCUPIED : SeatStatusEnum.FREE;
  },
  resOf(seat: string, date: string, reservations: Array<{ seatId: string; date: string; userId: string; userName: string }>): { seatId: string; date: string; userId: string; userName: string } | null {
    return reservations.find(r => r.seatId === seat && r.date === date) || null;
  },
  isWeekend(iso: string): boolean {
    const d = new Date(iso + "T00:00:00").getDay();
    return d === 0 || d === 6;
  },
};
