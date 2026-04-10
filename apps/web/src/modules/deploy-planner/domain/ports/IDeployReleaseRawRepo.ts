/**
 * Raw read/write port for the `dp_releases` table.
 *
 * The legacy DeployPlanner UI consumes release rows in snake_case (the
 * columns coming straight from Supabase). This port mirrors that shape so
 * the UI doesn't need a heavy refactor while keeping all DB access inside
 * `/infra/`. Newer code should prefer the camelCase `IReleaseRepo`.
 */
export interface DeployReleaseRow {
  id: string;
  release_number: string;
  description: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  ticket_ids: string[];
  ticket_statuses: Record<string, string>;
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface IDeployReleaseRawRepo {
  /** List all releases ordered by start_date asc. */
  listRaw(): Promise<DeployReleaseRow[]>;
  /** Insert a new release row and return the inserted row. */
  insertRaw(row: Partial<DeployReleaseRow>): Promise<DeployReleaseRow | null>;
  /** Patch an existing release with snake_case fields. */
  updateRaw(id: string, patch: Partial<DeployReleaseRow>): Promise<void>;
  /** Delete a release. */
  deleteRaw(id: string): Promise<void>;
}
