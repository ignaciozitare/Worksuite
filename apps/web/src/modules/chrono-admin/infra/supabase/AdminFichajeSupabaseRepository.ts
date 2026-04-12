import type { SupabaseClient } from '@supabase/supabase-js';
import type { IAdminFichajeRepository } from '../../domain/ports/IAdminFichajeRepository';
import type { EmpleadoResumen, EstadoPresencia } from '../../domain/entities/EmpleadoResumen';
import type { Fichaje, ResumenMes } from '../../../chrono/domain/entities/Fichaje';

function lastDayOfMonth(mes: string): string {
  const [y, m] = mes.split('-').map(Number) as [number, number];
  return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

function toFichaje(row: any): Fichaje {
  return {
    id: row.id, userId: row.user_id, fecha: row.fecha,
    entradaAt: row.entrada_at, comidaIniAt: row.comida_ini_at,
    comidaFinAt: row.comida_fin_at, salidaAt: row.salida_at,
    minutosTrabajados: row.minutos_trabajados, tipo: row.tipo, estado: row.estado,
    justificacion: row.justificacion, geoEntrada: row.geo_entrada, geoSalida: row.geo_salida,
    aprobadoPor: row.aprobado_por, aprobadoAt: row.aprobado_at, rechazadoRazon: row.rechazado_razon,
  };
}

function resolveEstado(
  fichaje: any | undefined,
  onVacation: boolean,
): EstadoPresencia {
  if (onVacation) return 'vacaciones';
  if (!fichaje) return 'sin_fichar';
  if (fichaje.tipo === 'teletrabajo') return 'teletrabajo';
  if (fichaje.tipo === 'medico') return 'medico';
  // 'abierto' means still clocked in today; any other state (completo,
  // incompleto, aprobado...) still counts as "in office today".
  return 'oficina';
}

export class AdminFichajeSupabaseRepository implements IAdminFichajeRepository {
  constructor(private db: SupabaseClient) {}

  async getEquipoHoy(): Promise<EmpleadoResumen[]> {
    const today = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear();
    const yearStart = `${currentYear}-01-01`;
    const yearEnd   = `${currentYear}-12-31`;

    const [usersRes, fichajesRes, saldosRes, bolsaRes, incompletosRes, vacResRes, vacTodayRes] = await Promise.all([
      this.db.from('users').select('id, name, email'),
      this.db.from('ch_fichajes').select('*').eq('fecha', today),
      this.db.from('ch_saldo_vacaciones').select('*').eq('anyo', currentYear),
      this.db.from('ch_bolsa_horas').select('user_id, minutos'),
      this.db.from('ch_fichajes').select('user_id').in('estado', ['incompleto', 'pendiente_aprobacion']),
      // Days already used this year via approved vacations. `ch_saldo_vacaciones`
      // has no `dias_disfrutados` column, so we derive it from actual approved
      // vacation rows that fall inside the current year.
      this.db.from('ch_vacaciones').select('user_id, dias_habiles, estado, fecha_inicio, fecha_fin')
        .eq('estado', 'aprobada')
        .gte('fecha_inicio', yearStart)
        .lte('fecha_fin', yearEnd),
      // Users currently on vacation TODAY — used to render the "vacaciones"
      // presence state in the admin employees table.
      this.db.from('ch_vacaciones').select('user_id')
        .eq('estado', 'aprobada')
        .lte('fecha_inicio', today)
        .gte('fecha_fin', today),
    ]);

    if (usersRes.error) throw usersRes.error;
    if (fichajesRes.error) throw fichajesRes.error;

    const users = usersRes.data ?? [];
    const fichajes = fichajesRes.data ?? [];
    const saldos = saldosRes.data ?? [];
    const bolsa = bolsaRes.data ?? [];
    const incompletos = incompletosRes.data ?? [];
    const vacacionesAprobadas = vacResRes.data ?? [];
    const onVacationToday = new Set<string>((vacTodayRes.data ?? []).map((v: any) => v.user_id));

    const fichajeByUser = new Map(fichajes.map((f: any) => [f.user_id, f]));
    const saldoByUser = new Map(saldos.map((s: any) => [s.user_id, s]));

    const bolsaByUser = new Map<string, number>();
    for (const b of bolsa) {
      bolsaByUser.set(b.user_id, (bolsaByUser.get(b.user_id) ?? 0) + b.minutos);
    }

    const incompletosByUser = new Map<string, number>();
    for (const i of incompletos) {
      incompletosByUser.set(i.user_id, (incompletosByUser.get(i.user_id) ?? 0) + 1);
    }

    const diasDisfrutadosByUser = new Map<string, number>();
    for (const v of vacacionesAprobadas) {
      diasDisfrutadosByUser.set(
        v.user_id,
        (diasDisfrutadosByUser.get(v.user_id) ?? 0) + (v.dias_habiles ?? 0),
      );
    }

    return users.map((u: any) => {
      const f = fichajeByUser.get(u.id);
      const s = saldoByUser.get(u.id);
      const disfrutados = diasDisfrutadosByUser.get(u.id) ?? 0;
      return {
        userId: u.id,
        nombre: u.name ?? u.email,
        email: u.email,
        estadoHoy: resolveEstado(f, onVacationToday.has(u.id)),
        fichajeHoyId: f?.id ?? null,
        minutosHoy: f?.minutos_trabajados ?? null,
        fichajesIncompletos: incompletosByUser.get(u.id) ?? 0,
        saldoVacacionesDias: s ? Math.max(0, s.dias_totales + s.dias_extra - disfrutados) : 0,
        saldoBolsaMinutos: bolsaByUser.get(u.id) ?? 0,
      };
    });
  }

  async getFichajesEquipo(
    mes: string,
    userId?: string,
  ): Promise<(Fichaje & { userName: string; userEmail: string })[]> {
    let query = this.db.from('ch_fichajes').select('*')
      .gte('fecha', `${mes}-01`).lte('fecha', lastDayOfMonth(mes))
      .order('fecha', { ascending: false });

    if (userId) query = query.eq('user_id', userId);

    const { data: fichajes, error } = await query;
    if (error) throw error;

    const userIds = [...new Set((fichajes ?? []).map((f: any) => f.user_id))];
    if (userIds.length === 0) return [];

    const { data: users, error: usersErr } = await this.db
      .from('users').select('id, name, email').in('id', userIds);
    if (usersErr) throw usersErr;

    const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));

    return (fichajes ?? []).map((row: any) => {
      const user = userMap.get(row.user_id);
      return {
        ...toFichaje(row),
        userName: user?.name ?? user?.email ?? 'Desconocido',
        userEmail: user?.email ?? '',
      };
    });
  }

  async getPendientesAprobacion(): Promise<(Fichaje & { userName: string })[]> {
    const { data: fichajes, error } = await this.db.from('ch_fichajes').select('*')
      .eq('estado', 'pendiente_aprobacion')
      .order('fecha', { ascending: false });
    if (error) throw error;

    const userIds = [...new Set((fichajes ?? []).map((f: any) => f.user_id))];
    if (userIds.length === 0) return [];

    const { data: users, error: usersErr } = await this.db
      .from('users').select('id, name, email').in('id', userIds);
    if (usersErr) throw usersErr;

    const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));

    return (fichajes ?? []).map((row: any) => {
      const user = userMap.get(row.user_id);
      return {
        ...toFichaje(row),
        userName: user?.name ?? user?.email ?? 'Desconocido',
      };
    });
  }

  async aprobar(fichajeId: string, aprobadoPorId: string): Promise<Fichaje> {
    const { data, error } = await this.db.from('ch_fichajes').update({
      estado: 'aprobado',
      aprobado_por: aprobadoPorId,
      aprobado_at: new Date().toISOString(),
    }).eq('id', fichajeId).select().single();
    if (error) throw error;
    return toFichaje(data);
  }

  async rechazar(fichajeId: string, aprobadoPorId: string, razon: string): Promise<Fichaje> {
    const { data, error } = await this.db.from('ch_fichajes').update({
      estado: 'rechazado',
      aprobado_por: aprobadoPorId,
      rechazado_razon: razon,
    }).eq('id', fichajeId).select().single();
    if (error) throw error;
    return toFichaje(data);
  }

  async getResumenPorEmpleado(
    mes: string,
  ): Promise<{ userId: string; userName: string; resumen: ResumenMes }[]> {
    const { data: fichajes, error } = await this.db.from('ch_fichajes').select('*')
      .gte('fecha', `${mes}-01`).lte('fecha', lastDayOfMonth(mes));
    if (error) throw error;

    const userIds = [...new Set((fichajes ?? []).map((f: any) => f.user_id))];
    if (userIds.length === 0) return [];

    const { data: users, error: usersErr } = await this.db
      .from('users').select('id, name, email').in('id', userIds);
    if (usersErr) throw usersErr;

    const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));
    const JORNADA = 480;

    const grouped = new Map<string, any[]>();
    for (const f of fichajes ?? []) {
      const arr = grouped.get(f.user_id) ?? [];
      arr.push(f);
      grouped.set(f.user_id, arr);
    }

    return [...grouped.entries()].map(([uid, rows]) => {
      const user = userMap.get(uid);
      const completos = rows.filter(
        (f: any) => f.estado === 'completo' || f.estado === 'aprobado',
      );
      const minutosTotales = completos.reduce(
        (acc: number, f: any) => acc + (f.minutos_trabajados ?? 0), 0,
      );
      return {
        userId: uid,
        userName: user?.name ?? user?.email ?? 'Desconocido',
        resumen: {
          diasTrabajados: completos.length,
          minutosTotales,
          minutosExtra: minutosTotales - completos.length * JORNADA,
          incidencias: rows.filter((f: any) => f.tipo !== 'normal').length,
          incompletos: rows.filter((f: any) => f.estado === 'incompleto').length,
        },
      };
    });
  }
}
