import type { IReservationRepo } from '../ports/IReservationRepo';
import type { Reservation }      from '../entities/Reservation';

/**
 * Applies lifecycle transitions. Callers pass the target `statusId` to use
 * (resolved from the dynamic status catalog by category). Keeping this use
 * case free of hard-coded status names means admins can rename / add / remove
 * statuses without touching the transition logic.
 */
export class UpdateReservationStatus {
  constructor(private repo: IReservationRepo) {}

  async checkIn(id: string, inUseStatusId: string): Promise<void> {
    await this.repo.patch(id, {
      statusId:     inUseStatusId,
      usageSession: { actual_start: new Date().toISOString(), actual_end: null, branches: [] },
    });
  }

  async checkOut(id: string, current: Reservation, completedStatusId: string): Promise<void> {
    await this.repo.patch(id, {
      statusId:     completedStatusId,
      usageSession: current.usageSession
        ? { ...current.usageSession, actual_end: new Date().toISOString() }
        : { actual_start: current.plannedStart, actual_end: new Date().toISOString(), branches: [] },
    });
  }

  async cancel(id: string, cancelledStatusId: string): Promise<void> {
    await this.repo.patch(id, { statusId: cancelledStatusId });
  }

  async addBranch(id: string, branch: string, current: Reservation): Promise<void> {
    const branches = [...(current.usageSession?.branches ?? []), branch];
    await this.repo.patch(id, {
      usageSession: { ...(current.usageSession!), branches },
    });
  }
}
