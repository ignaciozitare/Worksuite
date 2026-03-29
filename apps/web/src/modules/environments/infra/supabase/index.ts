// @ts-nocheck
// Supabase implementations — one file per port, all in infra/supabase
import type {
  IEnvironmentRepository,
  IRepositoryRepository,
  IReservationRepository,
  IPolicyRepository,
  CreateReservationInput,
} from "../../domain/ports";
import type { Environment }   from "../../domain/entities/Environment";
import type { Repository }    from "../../domain/entities/Repository";
import type { Reservation, ReservationStatus } from "../../domain/entities/Reservation";
import type { Policy }        from "../../domain/entities/Policy";
import { environmentFromRow } from "../../domain/entities/Environment";
import { repositoryFromRow }  from "../../domain/entities/Repository";
import { reservationFromRow } from "../../domain/entities/Reservation";
import { policyFromRow, DEFAULT_POLICY } from "../../domain/entities/Policy";

// ── SupabaseEnvironmentRepository ────────────────────────────────────────────
export class SupabaseEnvironmentRepository implements IEnvironmentRepository {
  constructor(private supabase: unknown) {}

  async findAll(): Promise<Environment[]> {
    const { data, error } = await (this.supabase as any)
      .from("syn_environments")
      .select("*")
      .order("name");
    if (error) throw error;
    return (data ?? []).map(environmentFromRow);
  }

  async create(env: Omit<Environment, "id">): Promise<Environment> {
    const { data, error } = await (this.supabase as any)
      .from("syn_environments")
      .insert(env)
      .select()
      .single();
    if (error) throw error;
    return environmentFromRow(data);
  }

  async update(id: string, patch: Partial<Environment>): Promise<Environment> {
    const { data, error } = await (this.supabase as any)
      .from("syn_environments")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return environmentFromRow(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from("syn_environments")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }
}

// ── SupabaseRepositoryRepository ──────────────────────────────────────────────
export class SupabaseRepositoryRepository implements IRepositoryRepository {
  constructor(private supabase: unknown) {}

  async findAll(): Promise<Repository[]> {
    const { data, error } = await (this.supabase as any)
      .from("syn_repositories")
      .select("*")
      .order("name");
    if (error) throw error;
    return (data ?? []).map(repositoryFromRow);
  }

  async create(repo: Omit<Repository, "id">): Promise<Repository> {
    const { data, error } = await (this.supabase as any)
      .from("syn_repositories")
      .insert(repo)
      .select()
      .single();
    if (error) throw error;
    return repositoryFromRow(data);
  }

  async update(id: string, patch: Partial<Repository>): Promise<Repository> {
    const { data, error } = await (this.supabase as any)
      .from("syn_repositories")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return repositoryFromRow(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from("syn_repositories")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }
}

// ── SupabaseReservationRepository ─────────────────────────────────────────────
export class SupabaseReservationRepository implements IReservationRepository {
  constructor(private supabase: unknown) {}

  async findAll(): Promise<Reservation[]> {
    const { data, error } = await (this.supabase as any)
      .from("syn_reservations")
      .select("*");
    if (error) throw error;
    return (data ?? []).map(reservationFromRow);
  }

  async create(input: CreateReservationInput): Promise<Reservation> {
    const { data, error } = await (this.supabase as any)
      .from("syn_reservations")
      .insert({
        environment_id:          input.environment_id,
        reserved_by_user_id:     input.reserved_by_user_id,
        reserved_by_name:        input.reserved_by_name,
        jira_issue_keys:         input.jira_issue_keys,
        planned_start:           input.planned_start,
        planned_end:             input.planned_end,
        status:                  "Reserved",
        selected_repository_ids: input.selected_repository_ids,
        usage_session:           null,
        policy_flags:            input.policy_flags,
        notes:                   input.notes,
      })
      .select()
      .single();
    if (error) throw error;
    return reservationFromRow(data);
  }

  async update(id: string, patch: Partial<Reservation>): Promise<Reservation> {
    const { data, error } = await (this.supabase as any)
      .from("syn_reservations")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return reservationFromRow(data);
  }

  async updateStatus(id: string, status: ReservationStatus): Promise<void> {
    const { error } = await (this.supabase as any)
      .from("syn_reservations")
      .update({ status })
      .eq("id", id);
    if (error) throw error;
  }

  async addBranch(id: string, branch: string): Promise<void> {
    // Read current session, push branch, write back
    const { data, error: readErr } = await (this.supabase as any)
      .from("syn_reservations")
      .select("usage_session")
      .eq("id", id)
      .single();
    if (readErr) throw readErr;
    const session = data.usage_session ?? { actual_start: null, actual_end: null, branches: [] };
    const { error } = await (this.supabase as any)
      .from("syn_reservations")
      .update({ usage_session: { ...session, branches: [...(session.branches ?? []), branch] } })
      .eq("id", id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from("syn_reservations")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }
}

// ── SupabasePolicyRepository ──────────────────────────────────────────────────
export class SupabasePolicyRepository implements IPolicyRepository {
  constructor(private supabase: unknown) {}

  async get(): Promise<Policy> {
    const { data, error } = await (this.supabase as any)
      .from("syn_policy")
      .select("*")
      .eq("id", 1)
      .single();
    if (error) return DEFAULT_POLICY;
    return policyFromRow(data);
  }

  async save(policy: Omit<Policy, "id">): Promise<Policy> {
    const { data, error } = await (this.supabase as any)
      .from("syn_policy")
      .upsert({ ...policy, id: 1 })
      .select()
      .single();
    if (error) throw error;
    return policyFromRow(data);
  }
}
