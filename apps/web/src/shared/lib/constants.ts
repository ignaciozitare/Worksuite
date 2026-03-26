// ─── Shared constants used across modules ────────────────────────────────────

export const TODAY = new Date().toISOString().slice(0, 10);

export const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001')
  .replace(/\/$/, '');

export const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
export const MONTHS_EN = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
export const DAYS_ES = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
export const DAYS_EN = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
