import type { Vacacion, SaldoVacaciones } from '../../../chrono/domain/entities/Vacacion';

export interface IAdminVacacionRepository {
  getPendientes(): Promise<(Vacacion & { userName: string })[]>;
  getTodas(filtros?: { userId?: string; anyo?: number }): Promise<(Vacacion & { userName: string })[]>;
  aprobar(vacacionId: string, aprobadoPorId: string): Promise<Vacacion>;
  rechazar(vacacionId: string, aprobadoPorId: string, razon: string): Promise<Vacacion>;
  getSaldoEmpleado(userId: string, anyo: number): Promise<SaldoVacaciones>;
  ajustarSaldo(userId: string, anyo: number, diasExtra: number, motivo: string): Promise<void>;
  ajustarBolsaHoras(userId: string, minutos: number, motivo: string): Promise<void>;
}
