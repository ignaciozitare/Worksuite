import type { SupabaseClient } from '@supabase/supabase-js';
import type { IAdminVacacionRepository } from '../../domain/ports/IAdminVacacionRepository';
import type { Vacacion, SaldoVacaciones } from '../../../chrono/domain/entities/Vacacion';

function toVacacion(row: any): Vacacion {
  return {
    id: row.id, userId: row.user_id, tipo: row.tipo,
    fechaInicio: row.fecha_inicio, fechaFin: row.fecha_fin,
    diasHabiles: row.dias_habiles, estado: row.estado, motivo: row.motivo,
    aprobadoPor: row.aprobado_por, aprobadoAt: row.aprobado_at,
    rechazadoRazon: row.rechazado_razon,
  };
}

export class AdminVacacionSupabaseRepository implements IAdminVacacionRepository {
  constructor(private db: SupabaseClient) {}

  async getPendientes(): Promise<(Vacacion & { userName: string })[]> {
    const { data: vacaciones, error } = await this.db.from('ch_vacaciones').select('*')
      .eq('estado', 'pendiente')
      .order('fecha_inicio', { ascending: true });
    if (error) throw error;

    const userIds = [...new Set((vacaciones ?? []).map((v: any) => v.user_id))];
    if (userIds.length === 0) return [];

    const { data: users, error: usersErr } = await this.db
      .from('users').select('id, name, email').in('id', userIds);
    if (usersErr) throw usersErr;

    const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));

    return (vacaciones ?? []).map((row: any) => {
      const user = userMap.get(row.user_id);
      return {
        ...toVacacion(row),
        userName: user?.name ?? user?.email ?? 'Desconocido',
      };
    });
  }

  async getTodas(
    filtros?: { userId?: string; anyo?: number },
  ): Promise<(Vacacion & { userName: string })[]> {
    let query = this.db.from('ch_vacaciones').select('*')
      .order('fecha_inicio', { ascending: false });

    if (filtros?.userId) query = query.eq('user_id', filtros.userId);
    if (filtros?.anyo) {
      query = query
        .gte('fecha_inicio', `${filtros.anyo}-01-01`)
        .lte('fecha_inicio', `${filtros.anyo}-12-31`);
    }

    const { data: vacaciones, error } = await query;
    if (error) throw error;

    const userIds = [...new Set((vacaciones ?? []).map((v: any) => v.user_id))];
    if (userIds.length === 0) return [];

    const { data: users, error: usersErr } = await this.db
      .from('users').select('id, name, email').in('id', userIds);
    if (usersErr) throw usersErr;

    const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));

    return (vacaciones ?? []).map((row: any) => {
      const user = userMap.get(row.user_id);
      return {
        ...toVacacion(row),
        userName: user?.name ?? user?.email ?? 'Desconocido',
      };
    });
  }

  async aprobar(vacacionId: string, aprobadoPorId: string): Promise<Vacacion> {
    const { data, error } = await this.db.from('ch_vacaciones').update({
      estado: 'aprobado',
      aprobado_por: aprobadoPorId,
      aprobado_at: new Date().toISOString(),
    }).eq('id', vacacionId).select().single();
    if (error) throw error;
    return toVacacion(data);
  }

  async rechazar(vacacionId: string, aprobadoPorId: string, razon: string): Promise<Vacacion> {
    const { data, error } = await this.db.from('ch_vacaciones').update({
      estado: 'rechazado',
      aprobado_por: aprobadoPorId,
      rechazado_razon: razon,
    }).eq('id', vacacionId).select().single();
    if (error) throw error;
    return toVacacion(data);
  }

  async getSaldoEmpleado(userId: string, anyo: number): Promise<SaldoVacaciones> {
    const [saldoRes, vacRes] = await Promise.all([
      this.db.from('ch_saldo_vacaciones').select('*')
        .eq('user_id', userId).eq('anyo', anyo).maybeSingle(),
      this.db.from('ch_vacaciones').select('dias_habiles, estado, fecha_inicio')
        .eq('user_id', userId)
        .gte('fecha_inicio', `${anyo}-01-01`)
        .lte('fecha_inicio', `${anyo}-12-31`)
        .in('estado', ['aprobado', 'pendiente']),
    ]);

    if (saldoRes.error) throw saldoRes.error;
    if (vacRes.error) throw vacRes.error;

    const saldo = saldoRes.data;
    const diasTotales = saldo?.dias_totales ?? 0;
    const diasExtra = saldo?.dias_extra ?? 0;

    const today = new Date().toISOString().split('T')[0];
    const vacaciones = vacRes.data ?? [];

    const diasDisfrutados = vacaciones
      .filter((v: any) => v.estado === 'aprobado' && v.fecha_inicio <= today)
      .reduce((acc: number, v: any) => acc + (v.dias_habiles ?? 0), 0);

    const diasAprobadosFuturos = vacaciones
      .filter((v: any) => v.estado === 'aprobado' && v.fecha_inicio > today)
      .reduce((acc: number, v: any) => acc + (v.dias_habiles ?? 0), 0);

    const diasDisponibles = diasTotales + diasExtra - diasDisfrutados - diasAprobadosFuturos;

    return { diasTotales, diasExtra, diasDisfrutados, diasAprobadosFuturos, diasDisponibles };
  }

  async ajustarSaldo(
    userId: string,
    anyo: number,
    diasExtra: number,
    motivo: string,
  ): Promise<void> {
    const { data: existing } = await this.db.from('ch_saldo_vacaciones')
      .select('id, dias_extra').eq('user_id', userId).eq('anyo', anyo).maybeSingle();

    if (existing) {
      const { error } = await this.db.from('ch_saldo_vacaciones').update({
        dias_extra: (existing.dias_extra ?? 0) + diasExtra,
        motivo_ajuste: motivo,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await this.db.from('ch_saldo_vacaciones').insert({
        user_id: userId,
        anyo,
        dias_totales: 0,
        dias_extra: diasExtra,
        dias_disfrutados: 0,
        motivo_ajuste: motivo,
      });
      if (error) throw error;
    }
  }

  async ajustarBolsaHoras(
    userId: string,
    minutos: number,
    motivo: string,
  ): Promise<void> {
    const { error } = await this.db.from('ch_bolsa_horas').insert({
      user_id: userId,
      minutos,
      motivo,
      ajuste_rrhh: true,
    });
    if (error) throw error;
  }
}
