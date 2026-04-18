// HotDesk module barrel

// Domain
export { ReserveSeat }                   from "./domain/useCases/ReserveSeat";
export { GetFloorPlan }                  from "./domain/useCases/GetFloorPlan";
export type { Seat, SeatStatus }         from "./domain/entities/Seat";
export type { Blueprint, LayoutItem }    from "./domain/entities/Blueprint";
export type { SeatReservation, FixedAssignment, ReservationStatus } from "./domain/entities/SeatReservation";
export type { HotDeskConfig }            from "./domain/entities/HotDeskConfig";

// Infrastructure
export { SupabaseSeatRepository }        from "./infra/SupabaseSeatRepository";
export { SupabaseReservationRepository } from "./infra/SupabaseReservationRepository";
export { SupabaseConfigRepository }      from "./infra/SupabaseConfigRepository";

// UI
export { OfficeSVG }        from "./ui/OfficeSVG";
export { BlueprintMiniMap } from "./ui/BlueprintMiniMap";
export { SeatTooltip }      from "./ui/SeatTooltip";
export { HDMapView }        from "./ui/HDMapView";
export { HDTableView }      from "./ui/HDTableView";
export { HDReserveModal }   from "./ui/HDReserveModal";
export { BlueprintHDMap }   from "./ui/BlueprintHDMap";
