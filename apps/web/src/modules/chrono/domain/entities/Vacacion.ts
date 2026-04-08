export type TipoVacacion = 'vacaciones' | 'asunto_propio' | 'baja_medica' | 'maternidad' | 'paternidad';
export type EstadoVacacion = 'pendiente' | 'aprobado' | 'rechazado' | 'cancelado';
export interface Vacacion {
  id: string; userId: string; tipo: TipoVacacion; fechaInicio: string; fechaFin: string;
  diasHabiles: number; estado: EstadoVacacion; motivo: string | null;
  aprobadoPor: string | null; aprobadoAt: string | null; rechazadoRazon: string | null;
}
export interface SaldoVacaciones {
  diasTotales: number; diasExtra: number; diasDisfrutados: number; diasAprobadosFuturos: number; diasDisponibles: number;
}
