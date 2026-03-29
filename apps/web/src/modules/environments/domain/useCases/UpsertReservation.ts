import type { IReservationRepo }    from '../ports/IReservationRepo';
import type { Reservation, EnvPolicy } from '../entities/Reservation';

export class UpsertReservation {
  constructor(private repo: IReservationRepo) {}

  validate(
    res: Reservation,
    all: Reservation[],
    maxDuration: number,
    policy: EnvPolicy,
    isAdmin: boolean,
  ): string | null {
    const start = new Date(res.plannedStart);
    const end   = new Date(res.plannedEnd);
    const now   = new Date();

    if (start >= end)             return 'El fin debe ser posterior al inicio.';
    if (end <= now)               return 'El fin debe ser en el futuro.';

    const durH = (end.getTime() - start.getTime()) / 3_600_000;
    if (durH > maxDuration)       return `Excede la duración máxima (${maxDuration}h).`;
    if (durH < policy.minDurationHours) return `Mínimo ${policy.minDurationHours}h.`;

    if (!isAdmin && policy.bookingWindowDays) {
      const maxDate = new Date(now.getTime() + policy.bookingWindowDays * 86_400_000);
      if (end > maxDate)          return `Máximo ${policy.bookingWindowDays} días por adelantado.`;
    }

    const overlap = all.find(r =>
      r.id !== res.id &&
      r.environmentId === res.environmentId &&
      ['Reserved', 'InUse', 'PolicyViolation'].includes(r.status) &&
      new Date(r.plannedStart) < end &&
      new Date(r.plannedEnd)   > start,
    );
    if (overlap)                  return `Solapamiento con: ${overlap.jiraIssueKeys.join(', ')}`;

    return null;
  }

  async execute(res: Reservation): Promise<void> {
    await this.repo.upsert(res);
  }
}
