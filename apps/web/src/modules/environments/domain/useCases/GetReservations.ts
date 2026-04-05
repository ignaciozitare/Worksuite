import type { IReservationRepo }                from '../ports/IReservationRepo';
import type { Reservation, Repository, EnvPolicy } from '../entities/Reservation';

export interface EnvModuleData {
  reservations: Reservation[];
  repositories: Repository[];
  policy:       EnvPolicy;
}

export class GetReservations {
  constructor(private repo: IReservationRepo) {}

  /**
   * @param completedStatusId   The id to use when auto-releasing expired
   *                            reservations (must belong to the `completed`
   *                            category). Resolved by the caller from the
   *                            dynamic status catalog.
   */
  async execute(completedStatusId: string | null): Promise<EnvModuleData> {
    const [reservations, repositories, policy] = await Promise.all([
      this.repo.getAll(),
      this.repo.getRepositories(),
      this.repo.getPolicy(),
    ]);

    // Auto-release expired reservations in memory only (persisted version will
    // be applied next time the user interacts). If we have no completed-status
    // id yet, we leave them as-is — this is a visual convenience, not a contract.
    const now = new Date();
    const updated = reservations.map(r => {
      const isLive = r.statusCategory === 'reserved' || r.statusCategory === 'in_use';
      if (isLive && new Date(r.plannedEnd) <= now && completedStatusId) {
        return {
          ...r,
          statusId:       completedStatusId,
          statusCategory: 'completed' as const,
          usageSession:   r.usageSession
            ? { ...r.usageSession, actual_end: r.plannedEnd }
            : { actual_start: r.plannedStart, actual_end: r.plannedEnd, branches: [] },
        };
      }
      return r;
    });

    return { reservations: updated, repositories, policy };
  }
}
