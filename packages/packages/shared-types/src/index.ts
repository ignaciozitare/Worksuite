// ─────────────────────────────────────────────
// @worksuite/shared-types
// Single source of truth for domain types.
// Used by both apps/api and apps/web.
// ─────────────────────────────────────────────

// ── Auth ──────────────────────────────────────
export type UserRole = 'admin' | 'user';
export type DeskType = 'none' | 'hotdesk' | 'fixed';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  deskType: DeskType;
  avatar: string;
  active: boolean;
  createdAt: string; // ISO date
}

// ── Jira Tracker ──────────────────────────────
export interface Worklog {
  id: string;
  issueKey: string;
  issueSummary: string;
  issueType: string;
  epicKey: string;
  epicName: string;
  projectKey: string;
  authorId: string;
  authorName: string;
  date: string;       // YYYY-MM-DD
  startedAt: string;  // HH:mm
  seconds: number;
  description: string;
  syncedToJira: boolean;
  jiraWorklogId?: string;
}

export interface JiraIssue {
  key: string;
  summary: string;
  type: string;
  status: string;
  priority: string;
  epicKey: string;
  epicName: string;
  projectKey: string;
  assignee: string;
  labels: string[];
  estimatedHours: number;
}

export interface WorklogFilters {
  from: string;       // YYYY-MM-DD
  to: string;         // YYYY-MM-DD
  authorId?: string;
  projectKeys?: string[];
}

// ── HotDesk ───────────────────────────────────
export type SeatStatus = 'free' | 'occupied' | 'fixed';

export interface Seat {
  id: string;         // e.g. "A1"
  zone: string;       // e.g. "A"
  label: string;
  x: number;          // SVG coordinate
  y: number;          // SVG coordinate
}

export interface SeatReservation {
  id: string;
  seatId: string;
  userId: string;
  userName: string;
  date: string;       // YYYY-MM-DD
  createdAt: string;
}

export interface FixedAssignment {
  seatId: string;
  userId: string;
  userName: string;
}

export interface HotDeskMapState {
  seats: Seat[];
  reservations: SeatReservation[];
  fixedAssignments: FixedAssignment[];
  date: string;
}

// ── API Responses ─────────────────────────────
export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
