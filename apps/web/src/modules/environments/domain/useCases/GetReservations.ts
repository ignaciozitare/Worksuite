import type { IReservationRepo }                from '../ports/IReservationRepo';
import type { Reservation, Repository, EnvPolicy } from '../entities/Reservation';

export interface EnvModuleData {
  reservations: Reservation[];
  repositories: Repository[];
  policy:       EnvPolicy;
}

export class GetReservations {
  constructor(private repo: IReservationRepo) {}

  async execute(): Promise<EnvModuleData> {
    const [reservations, repositories, policy] = await Promise.all([
      this.repo.getAll(),
      this.repo.getRepositories(),
      this.repo.getPolicy(),
    ]);

    // Auto-release expired reservations in memory
    const now = new Date();
    const updated = reservations.map(r => {
      if (
        (r.status === 'Reserved' || r.status === 'InUse') &&
        new Date(r.plannedEnd) <= now
      ) {
        return {
          ...r,
          status: 'Completed' as const,
          usageSession: r.usageSession
            ? { ...r.usageSession, actual_end: r.plannedEnd }
            : { actual_start: r.plannedStart, actual_end: r.plannedEnd, branches: [] },
        };
      }
      return r;
    });

    return { reservations: updated, repositories, policy };
  }
}
