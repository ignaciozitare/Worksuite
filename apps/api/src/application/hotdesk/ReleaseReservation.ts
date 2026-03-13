import type { IHotDeskRepository } from '../../domain/hotdesk/IHotDeskRepository.js';
import { ReservationService } from '../../domain/hotdesk/HotDesk.js';

export interface ReleaseReservationInput {
  seatId: string;
  date: string;
  requesterId: string;
  requesterRole: string;
}

export class ReleaseReservation {
  constructor(private readonly repo: IHotDeskRepository) {}

  async execute(input: ReleaseReservationInput): Promise<void> {
    const reservations = await this.repo.getReservations(input.date, input.date);

    // Admins can release any reservation
    const effectiveUserId = input.requesterRole === 'admin'
      ? (reservations.find(r => r.seatId === input.seatId && r.date === input.date)?.userId ?? input.requesterId)
      : input.requesterId;

    const check = ReservationService.canRelease(
      input.seatId, input.date, effectiveUserId, reservations,
    );

    if (!check.allowed) throw new Error(check.reason!);

    await this.repo.deleteReservation(input.seatId, input.date, effectiveUserId);
  }
}
