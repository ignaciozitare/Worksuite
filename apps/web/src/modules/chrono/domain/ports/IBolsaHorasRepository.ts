import type { SaldoBolsa, BolsaHorasEntry } from '../entities/BolsaHoras';

export interface IBolsaHorasRepository {
  getSaldo(userId: string): Promise<SaldoBolsa>;
  getHistorial(userId: string, anyo: number): Promise<BolsaHorasEntry[]>;
}
