import type { SupabaseClient } from '@supabase/supabase-js';
import type { IFichajeRepository } from '../../domain/ports/IFichajeRepository';
import type { Fichaje, GeoData, ResumenMes } from '../../domain/entities/Fichaje';

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

function calcMinutos(row: any, salidaAt: string): number {
  if (!row?.entrada_at) return 0;
  const totalMs = new Date(salidaAt).getTime() - new Date(row.entrada_at).getTime();
  const pausaMs = row.comida_ini_at && row.comida_fin_at
    ? new Date(row.comida_fin_at).getTime() - new Date(row.comida_ini_at).getTime() : 0;
  return Math.round((totalMs - pausaMs) / 60000);
}

export class FichajeSupabaseRepository implements IFichajeRepository {
  constructor(private db: SupabaseClient) {}

  async getFichajeHoy(userId: string): Promise<Fichaje | null> {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await this.db.from('ch_fichajes').select('*')
      .eq('user_id', userId).eq('fecha', today).maybeSingle();
    if (error) throw error;
    return data ? toFichaje(data) : null;
  }

  async getFichajesMes(userId: string, mes: string): Promise<Fichaje[]> {
    const { data, error } = await this.db.from('ch_fichajes').select('*')
      .eq('user_id', userId).gte('fecha', `${mes}-01`).lte('fecha', `${mes}-31`)
      .order('fecha', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toFichaje);
  }

  async getResumenMes(userId: string, mes: string): Promise<ResumenMes> {
    const fichajes = await this.getFichajesMes(userId, mes);
    const JORNADA = 480;
    const completos = fichajes.filter(f => f.estado === 'completo' || f.estado === 'aprobado');
    const minutosTotales = completos.reduce((acc, f) => acc + (f.minutosTrabajados ?? 0), 0);
    return {
      diasTrabajados: completos.length, minutosTotales,
      minutosExtra: minutosTotales - completos.length * JORNADA,
      incidencias: fichajes.filter(f => f.tipo !== 'normal').length,
      incompletos: fichajes.filter(f => f.estado === 'incompleto').length,
    };
  }

  async getFichajesIncompletos(userId: string): Promise<Fichaje[]> {
    const { data, error } = await this.db.from('ch_fichajes').select('*')
      .eq('user_id', userId).in('estado', ['incompleto', 'pendiente_aprobacion'])
      .order('fecha', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toFichaje);
  }

  async ficharEntrada(userId: string, geo?: GeoData): Promise<Fichaje> {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await this.db.from('ch_fichajes').insert({
      user_id: userId, fecha: today, entrada_at: new Date().toISOString(),
      estado: 'abierto', geo_entrada: geo ?? null,
    }).select().single();
    if (error) throw error;
    return toFichaje(data);
  }

  async ficharSalida(fichajeId: string, geo?: GeoData): Promise<Fichaje> {
    const salidaAt = new Date().toISOString();
    const { data: current } = await this.db.from('ch_fichajes')
      .select('entrada_at, comida_ini_at, comida_fin_at').eq('id', fichajeId).single();
    const minutos = calcMinutos(current, salidaAt);
    const { data, error } = await this.db.from('ch_fichajes').update({
      salida_at: salidaAt, estado: 'completo', geo_salida: geo ?? null, minutos_trabajados: minutos,
    }).eq('id', fichajeId).select().single();
    if (error) throw error;
    return toFichaje(data);
  }

  async iniciarComida(fichajeId: string): Promise<Fichaje> {
    const { data, error } = await this.db.from('ch_fichajes')
      .update({ comida_ini_at: new Date().toISOString() }).eq('id', fichajeId).select().single();
    if (error) throw error;
    return toFichaje(data);
  }

  async finalizarComida(fichajeId: string): Promise<Fichaje> {
    const { data, error } = await this.db.from('ch_fichajes')
      .update({ comida_fin_at: new Date().toISOString() }).eq('id', fichajeId).select().single();
    if (error) throw error;
    return toFichaje(data);
  }

  async completarFichaje(fichajeId: string, campos: Partial<Pick<Fichaje, 'entradaAt' | 'comidaIniAt' | 'comidaFinAt' | 'salidaAt'>>, justificacion: string): Promise<Fichaje> {
    const updates: Record<string, unknown> = { justificacion, estado: 'pendiente_aprobacion' };
    if (campos.entradaAt) updates.entrada_at = campos.entradaAt;
    if (campos.comidaIniAt) updates.comida_ini_at = campos.comidaIniAt;
    if (campos.comidaFinAt) updates.comida_fin_at = campos.comidaFinAt;
    if (campos.salidaAt) updates.salida_at = campos.salidaAt;
    const { data, error } = await this.db.from('ch_fichajes')
      .update(updates).eq('id', fichajeId).select().single();
    if (error) throw error;
    return toFichaje(data);
  }
}
