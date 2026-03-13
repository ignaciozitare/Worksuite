// ─────────────────────────────────────────────────────────────────────────────
// API Client
// All HTTP calls go through here. Token is injected automatically.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = import.meta.env['VITE_API_URL'] ?? '/api';

function getToken(): string | null {
  return localStorage.getItem('ws_token');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json() as { ok: boolean; data?: T; error?: { message: string } };

  if (!data.ok) {
    throw new Error(data.error?.message ?? `Request failed: ${res.status}`);
  }

  return data.data as T;
}

export const api = {
  // Auth
  login:   (email: string, password: string) =>
    request<{ token: string; user: unknown }>('POST', '/auth/login', { email, password }),
  me:      () => request<unknown>('GET', '/auth/me'),

  // Worklogs
  getWorklogs: (params: Record<string, string>) =>
    request<unknown[]>('GET', `/worklogs?${new URLSearchParams(params)}`),
  logWork:     (body: unknown) => request<unknown>('POST', '/worklogs', body),
  deleteWorklog: (id: string) => request<void>('DELETE', `/worklogs/${id}`),

  // HotDesk
  getMap:       (date: string) => request<unknown>('GET', `/hotdesk/map?date=${date}`),
  getTable:     (year: number, month: number) =>
    request<unknown>('GET', `/hotdesk/table?year=${year}&month=${month}`),
  reserve:      (body: unknown) => request<unknown>('POST', '/hotdesk/reservations', body),
  release:      (seatId: string, date: string) =>
    request<void>('DELETE', `/hotdesk/reservations/${seatId}/${date}`),
};
