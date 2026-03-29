
export type EnvironmentId = string;

export interface Environment {
  id:                     EnvironmentId;
  name:                   string;
  category:               "DEV" | "PRE" | "STAGING" | string;
  color:                  string;
  url:                    string | null;
  is_locked:              boolean;
  max_reservation_duration: number | null; // hours, null = unlimited
}

export function environmentFromRow(row: Record<string, unknown>): Environment {
  return {
    id:                      row.id as string,
    name:                    row.name as string ?? "",
    category:                row.category as string ?? "DEV",
    color:                   row.color as string ?? "#6366f1",
    url:                     row.url as string | null,
    is_locked:               row.is_locked as boolean ?? false,
    max_reservation_duration: row.max_reservation_duration as number | null,
  };
=======
export type EnvCategory = 'DEV' | 'PRE' | 'STAGING';

export interface Environment {
  id:                     string;
  name:                   string;
  category:               EnvCategory;
  isLocked:               boolean;
  isArchived:             boolean;
  maxReservationDuration: number;   // hours
  color:                  string | null;
  url:                    string | null;

}
