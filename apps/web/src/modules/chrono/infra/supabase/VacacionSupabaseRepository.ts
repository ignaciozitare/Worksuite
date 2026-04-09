import type { SupabaseClient } from '@supabase/supabase-js';
import type { IVacacionRepository } from '../../domain/ports/IVacacionRepository';
import type { Vacacion, SaldoVacaciones } from '../../domain/entities/Vacacion';

function toVacacion(row: any): Vacacion {
  return {
    id: row.id, userId: row.user_id, tipo: row.tipo,
    fechaInicio: row.fecha_inicio, fechaFin: row.fecha_fin,
    diasHabiles: row.dias_habiles, estado: row.estado, motivo: row.motivo,
    aprobadoPor: row.aprobado_por, aprobadoAt: row.aprobado_at,
    rechazadoRazon: row.rechazado_razon,
  };
}

export class VacacionSupabaseRepository implements IVacacionRepository {
  constructor(private db: SupabaseClient) {}

  async getVacaciones(userId: string): Promise<Vacacion[]> {
    const { data, error } = await this.db.from('ch_vacaciones').select('*')
      .eq('user_id', userId)
      .order('fecha_inicio', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toVacacion);
  }

  async getSaldo(userId: string, anyo: number): Promise<SaldoVacaciones> {
    // 1. Read base entitlement from saldo table
    const { data: saldoRow, error: saldoErr } = await this.db
      .from('ch_saldo_vacaciones').select('*')
      .eq('user_id', userId).eq('anyo', anyo).maybeSingle();
    if (saldoErr) throw saldoErr;

    const diasTotales = saldoRow?.dias_totales ?? 0;
    const diasExtra = saldoRow?.dias_extra ?? 0;

    // 2. Get approved vacation days for the year
    const { data: vacaciones, error: vacErr } = await this.db
      .from('ch_vacaciones').select('fecha_inicio, fecha_fin, dias_habiles')
      .eq('user_id', userId).eq('estado', 'aprobado')
      .gte('fecha_inicio', `${anyo}-01-01`)
      .lte('fecha_inicio', `${anyo}-12-31`);
    if (vacErr) throw vacErr;

    const today = new Date().toISOString().split('T')[0];
    let diasDisfrutados = 0;
    let diasAprobadosFuturos = 0;

    for (const v of vacaciones ?? []) {
      if (v.fecha_fin <= today) {
        diasDisfrutados += v.dias_habiles ?? 0;
      } else {
        diasAprobadosFuturos += v.dias_habiles ?? 0;
      }
    }

    const diasDisponibles = diasTotales + diasExtra - diasDisfrutados - diasAprobadosFuturos;

    return { diasTotales, diasExtra, diasDisfrutados, diasAprobadosFuturos, diasDisponibles };
  }

  async solicitar(
    data: Omit<Vacacion, 'id' | 'estado' | 'aprobadoPor' | 'aprobadoAt' | 'rechazadoRazon'>,
  ): Promise<Vacacion> {
    // Validate: only current year or next year allowed
    const currentYear = new Date().getFullYear();
    const requestYear = new Date(data.fechaInicio).getFullYear();
    if (requestYear < currentYear || requestYear > currentYear + 1) {
      throw new Error('Solo se pueden solicitar vacaciones del año en curso o el siguiente.');
    }
    const { data: row, error } = await this.db.from('ch_vacaciones').insert({
      user_id: data.userId,
      tipo: data.tipo,
      fecha_inicio: data.fechaInicio,
      fecha_fin: data.fechaFin,
      dias_habiles: data.diasHabiles,
      motivo: data.motivo ?? null,
    }).select().single();
    if (error) throw error;
    return toVacacion(row);
  }

  async cancelar(vacacionId: string): Promise<void> {
    const { error } = await this.db.from('ch_vacaciones')
      .update({ estado: 'cancelado' }).eq('id', vacacionId);
    if (error) throw error;
  }
}
