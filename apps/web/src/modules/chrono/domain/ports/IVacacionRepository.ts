import type { Vacacion, SaldoVacaciones } from '../entities/Vacacion';

export interface IVacacionRepository {
  getVacaciones(userId: string): Promise<Vacacion[]>;
  getSaldo(userId: string, anyo: number): Promise<SaldoVacaciones>;
  solicitar(
    data: Omit<
      Vacacion,
      'id' | 'estado' | 'aprobadoPor' | 'aprobadoAt' | 'rechazadoRazon'
    >,
  ): Promise<Vacacion>;
  cancelar(vacacionId: string): Promise<void>;
}
