
import type { ReservationRepository } from "../ports/ReservationRepository";

interface ReserveSeatInput {
  seatId:   string;
  dates:    string[];
  userId:   string;
  userName: string;
}

export class ReserveSeat {
  constructor(private repo: ReservationRepository) {}

  async execute(input: ReserveSeatInput): Promise<void> {
    if (!input.dates.length) throw new Error("At least one date required");
    await this.repo.reserve(
      input.dates.map(date => ({
        seatId:   input.seatId,
        date,
        userId:   input.userId,
        userName: input.userName,
      }))
    );
  }
}
