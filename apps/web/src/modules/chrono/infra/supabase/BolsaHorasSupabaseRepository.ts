import type { SupabaseClient } from '@supabase/supabase-js';
import type { IBolsaHorasRepository } from '../../domain/ports/IBolsaHorasRepository';
import type { SaldoBolsa, BolsaHorasEntry } from '../../domain/entities/BolsaHoras';

function toBolsaHorasEntry(row: any): BolsaHorasEntry {
  return {
    id: row.id, userId: row.user_id, fecha: row.fecha,
    minutos: row.minutos, concepto: row.concepto,
    fichajeId: row.fichaje_id, ajusteRrhh: row.ajuste_rrhh,
  };
}

export class BolsaHorasSupabaseRepository implements IBolsaHorasRepository {
  constructor(private db: SupabaseClient) {}

  async getSaldo(userId: string): Promise<SaldoBolsa> {
    const { data, error } = await this.db
      .from('ch_bolsa_horas').select('minutos')
      .eq('user_id', userId);
    if (error) throw error;
    const saldoNeto = (data ?? []).reduce((acc, r) => acc + (r.minutos ?? 0), 0);
    return { saldoNeto };
  }

  async getHistorial(userId: string, anyo: number): Promise<BolsaHorasEntry[]> {
    const { data, error } = await this.db.from('ch_bolsa_horas').select('*')
      .eq('user_id', userId)
      .gte('fecha', `${anyo}-01-01`)
      .lte('fecha', `${anyo}-12-31`)
      .order('fecha', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toBolsaHorasEntry);
  }
}
