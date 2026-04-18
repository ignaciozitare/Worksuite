
import { SupabaseReservationRepository } from "./infra/SupabaseReservationRepository";
import { SupabaseSeatRepository }        from "./infra/SupabaseSeatRepository";
import { SupabaseConfigRepository }      from "./infra/SupabaseConfigRepository";

export const reservationRepo = new SupabaseReservationRepository();
export const seatRepo        = new SupabaseSeatRepository();
export const configRepo      = new SupabaseConfigRepository();
