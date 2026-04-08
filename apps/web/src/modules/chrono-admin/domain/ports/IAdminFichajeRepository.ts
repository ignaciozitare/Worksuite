import type { Fichaje, ResumenMes } from '../../../chrono/domain/entities/Fichaje';
import type { EmpleadoResumen } from '../entities/EmpleadoResumen';

export interface IAdminFichajeRepository {
  getEquipoHoy(): Promise<EmpleadoResumen[]>;
  getFichajesEquipo(mes: string, userId?: string): Promise<(Fichaje & { userName: string; userEmail: string })[]>;
  getPendientesAprobacion(): Promise<(Fichaje & { userName: string })[]>;
  aprobar(fichajeId: string, aprobadoPorId: string): Promise<Fichaje>;
  rechazar(fichajeId: string, aprobadoPorId: string, razon: string): Promise<Fichaje>;
  getResumenPorEmpleado(mes: string): Promise<{ userId: string; userName: string; resumen: ResumenMes }[]>;
}
