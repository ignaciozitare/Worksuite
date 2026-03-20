export type UserRole = 'admin' | 'user';
export type DeskType = 'none' | 'hotdesk' | 'fixed';

export interface User {
  id: string; name: string; email: string; role: UserRole;
  deskType: DeskType; avatar: string; active: boolean; createdAt: string;
}

export interface JiraIssue {
  key: string; summary: string; type: string; status: string; priority: string;
  epicKey: string; epicName: string; projectKey: string; assignee: string;
  labels: string[]; estimatedHours: number;
}

export interface WorklogFilters {
  from: string; to: string; authorId?: string; projectKeys?: string[];
}

export type SeatStatus = 'free' | 'occupied' | 'fixed';

export interface Seat { id: string; zone: string; label: string; x: number; y: number; }

export interface SeatReservation {
  id: string; seatId: string; userId: string; userName: string; date: string; createdAt: string;
}

export interface FixedAssignment { seatId: string; userId: string; userName: string; }

export interface ApiSuccess<T> { ok: true; data: T; }
export interface ApiError { ok: false; error: { code: string; message: string; details?: unknown; }; }
export type ApiResponse<T> = ApiSuccess<T> | ApiError;
