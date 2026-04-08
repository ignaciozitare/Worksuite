import type { SupabaseClient } from '@supabase/supabase-js';
import type { IAlarmaRepository } from '../../domain/ports/IAlarmaRepository';
import type { Alarma } from '../../domain/entities/Alarma';

function toAlarma(row: any): Alarma {
  return {
    id: row.id, userId: row.user_id, label: row.label,
    hora: row.hora, dias: row.dias, activa: row.activa,
    tipo: row.tipo, sonido: row.sonido, canales: row.canales,
  };
}

export class AlarmaSupabaseRepository implements IAlarmaRepository {
  constructor(private db: SupabaseClient) {}

  async getAlarmas(userId: string): Promise<Alarma[]> {
    const { data, error } = await this.db.from('ch_alarmas').select('*')
      .eq('user_id', userId)
      .order('hora', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toAlarma);
  }

  async crear(data: Omit<Alarma, 'id'>): Promise<Alarma> {
    const { data: row, error } = await this.db.from('ch_alarmas').insert({
      user_id: data.userId,
      label: data.label,
      hora: data.hora,
      dias: data.dias,
      activa: data.activa,
      tipo: data.tipo,
      sonido: data.sonido,
      canales: data.canales,
    }).select().single();
    if (error) throw error;
    return toAlarma(row);
  }

  async actualizar(
    id: string,
    data: Partial<Omit<Alarma, 'id' | 'userId'>>,
  ): Promise<Alarma> {
    const updates: Record<string, unknown> = {};
    if (data.label !== undefined) updates.label = data.label;
    if (data.hora !== undefined) updates.hora = data.hora;
    if (data.dias !== undefined) updates.dias = data.dias;
    if (data.activa !== undefined) updates.activa = data.activa;
    if (data.tipo !== undefined) updates.tipo = data.tipo;
    if (data.sonido !== undefined) updates.sonido = data.sonido;
    if (data.canales !== undefined) updates.canales = data.canales;
    const { data: row, error } = await this.db.from('ch_alarmas')
      .update(updates).eq('id', id).select().single();
    if (error) throw error;
    return toAlarma(row);
  }

  async eliminar(id: string): Promise<void> {
    const { error } = await this.db.from('ch_alarmas').delete().eq('id', id);
    if (error) throw error;
  }

  async toggle(id: string, activa: boolean): Promise<Alarma> {
    const { data: row, error } = await this.db.from('ch_alarmas')
      .update({ activa }).eq('id', id).select().single();
    if (error) throw error;
    return toAlarma(row);
  }
}
