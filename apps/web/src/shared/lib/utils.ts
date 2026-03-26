// ─── Shared utility functions ────────────────────────────────────────────────
import { supabase } from './supabaseClient';

export async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

export function makeAvatar(name: string): string {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

export function firstMonday(y: number, m: number): number {
  return (new Date(y, m, 1).getDay() + 6) % 7;
}

export function isoFromYMD(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function fmtMonthYear(y: number, m: number, lang: string): string {
  const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const MONTHS_EN = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  return lang === 'es' ? `${MONTHS_ES[m]} ${y}` : `${MONTHS_EN[m]} ${y}`;
}

export function formatFullDate(iso: string, lang: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const MONTHS_EN = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  return lang === 'es'
    ? `${d} de ${MONTHS_ES[(m ?? 1) - 1]} de ${y}`
    : `${MONTHS_EN[(m ?? 1) - 1]} ${d}, ${y}`;
}

export function buildCalGrid(year: number, month: number) {
  const first = firstMonday(year, month);
  const days  = daysInMonth(year, month);
  const prev  = daysInMonth(year, month - 1);
  const cells = [];
  for (let i = 0; i < first; i++) {
    cells.push({ day: prev - first + i + 1, isCurrentMonth: false, date: isoFromYMD(year, month - 1, prev - first + i + 1) });
  }
  for (let d = 1; d <= days; d++) {
    const today = new Date().toISOString().slice(0, 10);
    const date  = isoFromYMD(year, month, d);
    cells.push({ day: d, isCurrentMonth: true, isToday: date === today, date });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: nextDay++, isCurrentMonth: false, date: isoFromYMD(year, month + 1, nextDay - 1) });
  }
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
