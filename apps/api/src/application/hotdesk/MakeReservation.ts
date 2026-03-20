import { SeatReservation, ReservationService } from '../../domain/hotdesk/HotDesk.js';
import type { IHotDeskRepository } from '../../domain/hotdesk/IHotDeskRepository.js';

export interface MakeReservationInput {
  seatId: string;
  dates: string[];
  userId: string;
  userName: string;
}

export interface MakeReservationOutput {
  reserved: string[];
  skipped: Array<{ date: string; reason: string }>;
}

export class MakeReservation {
  constructor(private readonly repo: IHotDeskRepository) {}

  async execute(input: MakeReservationInput): Promise<MakeReservationOutput> {
    const [fixedAssignments, allReservations] = await Promise.all([
      this.repo.getFixedAssignments(),
      this.repo.getReservations(input.dates[0]!, input.dates[input.dates.length - 1]!),
    ]);
    const reserved: string[] = [];
    const skipped: Array<{ date: string; reason: string }> = [];
    for (const date of input.dates) {
      const check = ReservationService.canReserve(input.seatId, date, input.userId, fixedAssignments, allReservations);
      if (!check.allowed) { skipped.push({ date, reason: check.reason! }); continue; }
      const reservation = SeatReservation.create(input.seatId, input.userId, input.userName, date);
      await this.repo.saveReservation(reservation);
      reserved.push(date);
    }
    return { reserved, skipped };
  }
}
