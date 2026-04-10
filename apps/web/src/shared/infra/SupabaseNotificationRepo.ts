// @ts-nocheck
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationPort, Notification } from '../domain/ports/NotificationPort';

function toEntity(row: any): Notification {
  return {
    id: row.id,
    tipo: row.tipo,
    titulo: row.titulo,
    mensaje: row.mensaje,
    leida: row.leida,
    link: row.link ?? null,
    createdAt: row.created_at,
  };
}

export class SupabaseNotificationRepo implements NotificationPort {
  constructor(private db: SupabaseClient) {}

  async listByUser(userId: string, limit = 20): Promise<Notification[]> {
    const { data, error } = await this.db
      .from('ch_notificaciones')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(toEntity);
  }

  async markAsRead(id: string): Promise<void> {
    const { error } = await this.db
      .from('ch_notificaciones')
      .update({ leida: true })
      .eq('id', id);
    if (error) throw error;
  }
}
