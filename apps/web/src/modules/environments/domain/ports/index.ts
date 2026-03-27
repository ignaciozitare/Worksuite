import type { Environment }  from "../entities/Environment";
import type { Repository }   from "../entities/Repository";
import type { Reservation, ReservationStatus } from "../entities/Reservation";
import type { Policy }       from "../entities/Policy";

// ── IEnvironmentRepository ────────────────────────────────────────────────────
export interface IEnvironmentRepository {
  findAll(): Promise<Environment[]>;
  create(env: Omit<Environment, "id">): Promise<Environment>;
  update(id: string, patch: Partial<Environment>): Promise<Environment>;
  delete(id: string): Promise<void>;
}

// ── IRepositoryRepository ─────────────────────────────────────────────────────
export interface IRepositoryRepository {
  findAll(): Promise<Repository[]>;
  create(repo: Omit<Repository, "id">): Promise<Repository>;
  update(id: string, patch: Partial<Repository>): Promise<Repository>;
  delete(id: string): Promise<void>;
}

// ── IReservationRepository ────────────────────────────────────────────────────
export interface CreateReservationInput {
  environment_id:          string;
  reserved_by_user_id:     string;
  reserved_by_name:        string;
  jira_issue_keys:         string[];
  planned_start:           string;
  planned_end:             string;
  selected_repository_ids: string[];
  notes:                   string;
  policy_flags:            Record<string, unknown>;
}

export interface IReservationRepository {
  findAll(): Promise<Reservation[]>;
  create(input: CreateReservationInput): Promise<Reservation>;
  update(id: string, patch: Partial<Reservation>): Promise<Reservation>;
  updateStatus(id: string, status: ReservationStatus): Promise<void>;
  addBranch(id: string, branch: string): Promise<void>;
  delete(id: string): Promise<void>;
}

// ── IPolicyRepository ─────────────────────────────────────────────────────────
export interface IPolicyRepository {
  get(): Promise<Policy>;
  save(policy: Omit<Policy, "id">): Promise<Policy>;
}
