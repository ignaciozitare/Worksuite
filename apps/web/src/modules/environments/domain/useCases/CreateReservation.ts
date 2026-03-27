import type { IReservationRepository, CreateReservationInput } from "../ports";
import type { IEnvironmentRepository }                          from "../ports";
import type { Reservation }                                      from "../entities/Reservation";
import type { Policy }                                           from "../entities/Policy";
import { findConflicts, durationHours }                          from "../entities/Reservation";
import { validateAgainstPolicy }                                 from "../entities/Policy";

export class CreateReservation {
  constructor(
    private reservations: IReservationRepository,
    private environments: IEnvironmentRepository,
  ) {}

  async execute(
    input: CreateReservationInput,
    existingReservations: Reservation[],
    policy: Policy,
  ): Promise<Reservation> {
    // 1. Policy validation
    const violations = validateAgainstPolicy(policy, input.planned_start, input.planned_end);
    if (violations.length) throw new Error(violations.join(" / "));

    // 2. Overlap check
    const conflicts = findConflicts(
      existingReservations,
      input.environment_id,
      input.planned_start,
      input.planned_end,
    );
    if (conflicts.length) {
      throw new Error(`El entorno está ocupado en ese tramo (${conflicts.length} reserva${conflicts.length > 1 ? "s" : ""} solapada${conflicts.length > 1 ? "s" : ""}).`);
    }

    // 3. Environment not locked
    const envs = await this.environments.findAll();
    const env  = envs.find(e => e.id === input.environment_id);
    if (env?.is_locked) throw new Error("El entorno está bloqueado por el administrador.");

    // 4. Max duration check
    if (env?.max_reservation_duration !== null && env?.max_reservation_duration !== undefined) {
      const hours = durationHours(input.planned_start, input.planned_end);
      if (hours > env.max_reservation_duration) {
        throw new Error(`La duración máxima para este entorno es ${env.max_reservation_duration}h.`);
      }
    }

    return this.reservations.create(input);
  }
}
