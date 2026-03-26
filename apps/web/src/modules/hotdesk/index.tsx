// @ts-nocheck
// HotDesk module barrel
export { SupabaseSeatRepository }        from "./infra/SupabaseSeatRepository";
export { SupabaseReservationRepository } from "./infra/SupabaseReservationRepository";
export { ReserveSeat }                   from "./domain/useCases/ReserveSeat";
export { GetFloorPlan }                  from "./domain/useCases/GetFloorPlan";
export type { Seat, SeatStatus }         from "./domain/entities/Seat";
export type { Blueprint, LayoutItem }    from "./domain/entities/Blueprint";
export type { SeatReservation, FixedAssignment } from "./domain/entities/SeatReservation";
