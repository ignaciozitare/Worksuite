import type { ReservationStatusCategory } from './ReservationStatus';

/**
 * Legacy text value kept on the table for backwards-compatibility during the
 * transition to dynamic statuses. Current code should only read `statusId` /
 * `statusCategory`.
 * @deprecated use `statusCategory` instead.
 */
export type ReservationStatus =
  | 'Reserved'
  | 'InUse'
  | 'Completed'
  | 'Cancelled'
  | 'PolicyViolation';

export interface UsageSession {
  actual_start: string;
  actual_end:   string | null;
  branches:     string[];
}

export interface Reservation {
  id:                    string;
  environmentId:         string;
  reservedByUserId:      string;
  jiraIssueKeys:         string[];
  description:           string | null;
  plannedStart:          string;  // ISO
  plannedEnd:            string;  // ISO
  /** FK to syn_reservation_statuses.id (dynamic catalog, admin-configurable). */
  statusId:              string;
  /** Resolved category from the status catalog — drives behavior. */
  statusCategory:        ReservationStatusCategory;
  /** Resolved display name for the status (may be customized by admin). */
  statusName:            string;
  selectedRepositoryIds: string[];
  usageSession:          UsageSession | null;
  policyFlags:           { exceedsMaxDuration: boolean };
  extractedRepos?:       string[];      // repos auto-extraídos del ticket Jira
}

export interface Repository {
  id:         string;
  name:       string;
  isArchived: boolean;
}

export interface EnvPolicy {
  bookingWindowDays:  number;
  minDurationHours:   number;
  allowPastStart:     boolean;
  businessHoursOnly:  boolean;
  businessHoursStart: number;
  businessHoursEnd:   number;
}
