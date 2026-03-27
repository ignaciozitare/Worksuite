export type ReservationId = string;

export type ReservationStatus =
  | "Reserved"
  | "InUse"
  | "Completed"
  | "Cancelled"
  | "PolicyViolation";

export interface UsageSession {
  actual_start: string | null;  // ISO
  actual_end:   string | null;  // ISO
  branches:     string[];
}

export interface Reservation {
  id:                      ReservationId;
  environment_id:          string;
  reserved_by_user_id:     string;
  reserved_by_name:        string;
  jira_issue_keys:         string[];
  planned_start:           string;  // ISO
  planned_end:             string;  // ISO
  status:                  ReservationStatus;
  selected_repository_ids: string[];
  usage_session:           UsageSession | null;
  policy_flags:            Record<string, unknown>;
  notes:                   string;
}

export function reservationFromRow(row: Record<string, unknown>): Reservation {
  return {
    id:                      row.id as string,
    environment_id:          row.environment_id as string,
    reserved_by_user_id:     row.reserved_by_user_id as string ?? "",
    reserved_by_name:        row.reserved_by_name as string ?? "",
    jira_issue_keys:         (row.jira_issue_keys as string[]) ?? [],
    planned_start:           row.planned_start as string,
    planned_end:             row.planned_end as string,
    status:                  row.status as ReservationStatus ?? "Reserved",
    selected_repository_ids: (row.selected_repository_ids as string[]) ?? [],
    usage_session:           row.usage_session as UsageSession | null,
    policy_flags:            (row.policy_flags as Record<string, unknown>) ?? {},
    notes:                   row.notes as string ?? "",
  };
}

/** Returns true if two time ranges overlap (exclusive boundaries). */
export function reservationsOverlap(
  s1: string, e1: string,
  s2: string, e2: string,
): boolean {
  return new Date(s1) < new Date(e2) && new Date(s2) < new Date(e1);
}

/** Duration in hours between two ISO strings. */
export function durationHours(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
}

/** Returns reservations that conflict with [start, end] for a given environment. */
export function findConflicts(
  reservations: Reservation[],
  environmentId: string,
  start: string,
  end: string,
  excludeId?: string,
): Reservation[] {
  return reservations.filter(r =>
    r.environment_id === environmentId &&
    r.id !== excludeId &&
    ["Reserved", "InUse", "PolicyViolation"].includes(r.status) &&
    reservationsOverlap(start, end, r.planned_start, r.planned_end),
  );
}

/** Auto-complete reservations whose planned_end has passed. Pure function. */
export function autoRelease(reservations: Reservation[]): Reservation[] {
  const now = new Date();
  return reservations.map(r => {
    if (
      ["Reserved", "InUse"].includes(r.status) &&
      new Date(r.planned_end) <= now
    ) {
      return {
        ...r,
        status: "Completed" as ReservationStatus,
        usage_session: r.usage_session
          ? { ...r.usage_session, actual_end: r.planned_end }
          : { actual_start: r.planned_start, actual_end: r.planned_end, branches: [] },
      };
    }
    return r;
  });
}
