// @ts-nocheck
// apps/web/src/modules/environments/index.tsx
// Public API of the Environments module — import from here, not from subfolders

// ── Default export: main UI ────────────────────────────────────────────────
export { default } from "./ui/EnvironmentsModule";

// ── Admin sections (used by WorkSuiteApp AdminShell) ─────────────────────
export { AdminEnvEnvironments } from "./ui/admin/AdminEnvEnvironments";
export { AdminEnvRepositories } from "./ui/admin/AdminEnvRepositories";
export { AdminEnvPolicy }       from "./ui/admin/AdminEnvPolicy";

// ── Domain types (used by shared-types or other modules) ─────────────────
export type { Environment }   from "./domain/entities/Environment";
export type { Repository }    from "./domain/entities/Repository";
export type { Reservation, ReservationStatus, UsageSession } from "./domain/entities/Reservation";
export type { Policy }        from "./domain/entities/Policy";

// ── Use cases (available for testing or external orchestration) ───────────
export { CreateReservation }                            from "./domain/useCases/CreateReservation";
export { CheckIn, CheckOut, CancelReservation, AddBranch } from "./domain/useCases/ReservationLifecycle";

// ── Infra (Supabase implementations) ─────────────────────────────────────
export {
  SupabaseEnvironmentRepository,
  SupabaseRepositoryRepository,
  SupabaseReservationRepository,
  SupabasePolicyRepository,
} from "./infra/supabase";
