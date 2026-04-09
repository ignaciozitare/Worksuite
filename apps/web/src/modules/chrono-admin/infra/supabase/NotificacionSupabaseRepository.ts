// @ts-nocheck
import type { SupabaseClient } from '@supabase/supabase-js';
import type { INotificacionRepository } from '../../domain/ports/INotificacionRepository';
import type { Notificacion } from '../../domain/entities/Notificacion';

function toEntity(row: any): Notificacion {
  return {
    id: row.id,
    userId: row.user_id,
    tipo: row.tipo,
    titulo: row.titulo,
    mensaje: row.mensaje,
    leida: row.leida,
    link: row.link ?? null,
    createdAt: row.created_at,
  };
}

export class NotificacionSupabaseRepository implements INotificacionRepository {
  constructor(private db: SupabaseClient) {}

  async enviar(
    userId: string,
    data: { tipo: string; titulo: string; mensaje: string; link?: string },
  ): Promise<Notificacion> {
    const { data: row, error } = await this.db
      .from('ch_notificaciones')
      .insert({
        user_id: userId,
        tipo: data.tipo,
        titulo: data.titulo,
        mensaje: data.mensaje,
        link: data.link ?? null,
        leida: false,
      })
      .select()
      .single();
    if (error) throw error;
    return toEntity(row);
  }

  async enviarMasivo(
    userIds: string[],
    data: { tipo: string; titulo: string; mensaje: string; link?: string },
  ): Promise<void> {
    const rows = userIds.map((uid) => ({
      user_id: uid,
      tipo: data.tipo,
      titulo: data.titulo,
      mensaje: data.mensaje,
      link: data.link ?? null,
      leida: false,
    }));

    const { error } = await this.db
      .from('ch_notificaciones')
      .insert(rows);
    if (error) throw error;
  }

  async getByUser(userId: string): Promise<Notificacion[]> {
    const { data, error } = await this.db
      .from('ch_notificaciones')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toEntity);
  }

  async marcarLeida(id: string): Promise<void> {
    const { error } = await this.db
      .from('ch_notificaciones')
      .update({ leida: true })
      .eq('id', id);
    if (error) throw error;
  }

  async getNoLeidas(userId: string): Promise<number> {
    const { count, error } = await this.db
      .from('ch_notificaciones')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('leida', false);
    if (error) throw error;
    return count ?? 0;
  }
}
