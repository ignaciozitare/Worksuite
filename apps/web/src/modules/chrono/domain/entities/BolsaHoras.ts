export interface BolsaHorasEntry {
  id: string; userId: string; fecha: string; minutos: number; concepto: string | null;
  fichajeId: string | null; ajusteRrhh: boolean;
}
export interface SaldoBolsa { saldoNeto: number; }
