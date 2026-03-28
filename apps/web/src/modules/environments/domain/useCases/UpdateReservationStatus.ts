import type { IReservationRepo } from '../ports/IReservationRepo';
import type { Reservation }      from '../entities/Reservation';

export class UpdateReservationStatus {
  constructor(private repo: IReservationRepo) {}

  async checkIn(id: string): Promise<void> {
    await this.repo.patch(id, {
      status:       'InUse',
      usageSession: { actual_start: new Date().toISOString(), actual_end: null, branches: [] },
    });
  }

  async checkOut(id: string, current: Reservation): Promise<void> {
    await this.repo.patch(id, {
      status:       'Completed',
      usageSession: current.usageSession
        ? { ...current.usageSession, actual_end: new Date().toISOString() }
        : { actual_start: current.plannedStart, actual_end: new Date().toISOString(), branches: [] },
    });
  }

  async cancel(id: string): Promise<void> {
    await this.repo.patch(id, { status: 'Cancelled' });
  }

  async addBranch(id: string, branch: string, current: Reservation): Promise<void> {
    const branches = [...(current.usageSession?.branches ?? []), branch];
    await this.repo.patch(id, {
      usageSession: { ...(current.usageSession!), branches },
    });
  }
}
