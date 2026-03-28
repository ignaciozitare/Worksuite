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
  status:                ReservationStatus;
  selectedRepositoryIds: string[];
  usageSession:          UsageSession | null;
  policyFlags:           { exceedsMaxDuration: boolean };
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
