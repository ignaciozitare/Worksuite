export interface SeatCoordinates { x: number; y: number; }

export class Seat {
  constructor(readonly id: string, readonly zone: string, readonly label: string, readonly coordinates: SeatCoordinates) {
    if (!id.trim()) throw new Error('Seat id cannot be empty');
  }
}

export class SeatReservation {
  private constructor(readonly id: string, readonly seatId: string, readonly userId: string, readonly userName: string, readonly date: string, readonly createdAt: string) {}

  static create(seatId: string, userId: string, userName: string, date: string): SeatReservation {
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) throw new Error('Invalid date format');
    return new SeatReservation(`res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, seatId, userId, userName, date, new Date().toISOString());
  }

  static reconstitute(props: { id: string; seatId: string; userId: string; userName: string; date: string; createdAt: string }): SeatReservation {
    return new SeatReservation(props.id, props.seatId, props.userId, props.userName, props.date, props.createdAt);
  }
}

export class FixedAssignment {
  constructor(readonly seatId: string, readonly userId: string, readonly userName: string) {}
}

export class ReservationService {
  static isWeekend(isoDate: string): boolean {
    const dow = new Date(`${isoDate}T00:00:00`).getDay();
    return dow === 0 || dow === 6;
  }

  static isFixed(seatId: string, fixedAssignments: FixedAssignment[]): boolean {
    return fixedAssignments.some((fa) => fa.seatId === seatId);
  }

  static findReservation(seatId: string, date: string, reservations: SeatReservation[]): SeatReservation | undefined {
    return reservations.find((r) => r.seatId === seatId && r.date === date);
  }

  static canReserve(seatId: string, date: string, userId: string, fixedAssignments: FixedAssignment[], reservations: SeatReservation[]): { allowed: boolean; reason?: string } {
    if (this.isWeekend(date)) return { allowed: false, reason: 'Cannot reserve on weekends' };
    if (this.isFixed(seatId, fixedAssignments)) return { allowed: false, reason: 'Seat is permanently assigned' };
    const existing = this.findReservation(seatId, date, reservations);
    if (existing && existing.userId !== userId) return { allowed: false, reason: 'Seat already reserved by another user' };
    return { allowed: true };
  }

  static canRelease(seatId: string, date: string, userId: string, reservations: SeatReservation[]): { allowed: boolean; reason?: string } {
    const reservation = this.findReservation(seatId, date, reservations);
    if (!reservation) return { allowed: false, reason: 'No reservation found' };
    if (reservation.userId !== userId) return { allowed: false, reason: 'Can only release your own reservation' };
    return { allowed: true };
  }
}
