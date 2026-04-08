export type EstadoPresencia = 'oficina' | 'teletrabajo' | 'vacaciones' | 'medico' | 'ausente' | 'sin_fichar';

export interface EmpleadoResumen {
  userId: string;
  nombre: string;
  email: string;
  estadoHoy: EstadoPresencia;
  fichajeHoyId: string | null;
  minutosHoy: number | null;
  fichajesIncompletos: number;
  saldoVacacionesDias: number;
  saldoBolsaMinutos: number;
}
