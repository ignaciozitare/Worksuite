import type { IReservationRepository } from "../ports";
import type { Reservation }             from "../entities/Reservation";

// ── CheckIn ──────────────────────────────────────────────────────────────────
export class CheckIn {
  constructor(private repo: IReservationRepository) {}

  async execute(reservation: Reservation): Promise<void> {
    if (reservation.status !== "Reserved") {
      throw new Error("Solo se puede hacer check-in en reservas en estado 'Reservado'.");
    }
    await this.repo.update(reservation.id, {
      status: "InUse",
      usage_session: {
        actual_start: new Date().toISOString(),
        actual_end:   null,
        branches:     [],
      },
    });
  }
}

// ── CheckOut ─────────────────────────────────────────────────────────────────
export class CheckOut {
  constructor(private repo: IReservationRepository) {}

  async execute(reservation: Reservation): Promise<void> {
    if (reservation.status !== "InUse") {
      throw new Error("Solo se puede hacer check-out en reservas en estado 'En uso'.");
    }
    const now = new Date().toISOString();
    await this.repo.update(reservation.id, {
      status: "Completed",
      usage_session: {
        ...(reservation.usage_session ?? { actual_start: reservation.planned_start, branches: [] }),
        actual_end: now,
      },
    });
  }
}

// ── CancelReservation ─────────────────────────────────────────────────────────
export class CancelReservation {
  constructor(private repo: IReservationRepository) {}

  async execute(reservation: Reservation, requestingUserId: string): Promise<void> {
    if (reservation.status === "Completed") {
      throw new Error("No se puede cancelar una reserva ya completada.");
    }
    if (
      reservation.reserved_by_user_id !== requestingUserId &&
      !["admin"].includes(requestingUserId) // admins can always cancel
    ) {
      throw new Error("Solo el propietario o un administrador puede cancelar esta reserva.");
    }
    await this.repo.updateStatus(reservation.id, "Cancelled");
  }
}

// ── AddBranch ─────────────────────────────────────────────────────────────────
export class AddBranch {
  constructor(private repo: IReservationRepository) {}

  async execute(reservation: Reservation, branch: string): Promise<void> {
    if (reservation.status !== "InUse") {
      throw new Error("Solo se pueden añadir ramas cuando el entorno está en uso (check-in realizado).");
    }
    const trimmed = branch.trim();
    if (!trimmed) throw new Error("El nombre de la rama no puede estar vacío.");
    await this.repo.addBranch(reservation.id, trimmed);
  }
}
