// @ts-nocheck
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationPort, Notification, NotificationInput } from '../domain/ports/NotificationPort';

function toEntity(row: any): Notification {
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

  async unreadCount(userId: string): Promise<number> {
    const { count, error } = await this.db
      .from('ch_notificaciones')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('leida', false);
    if (error) throw error;
    return count ?? 0;
  }

  async send(userId: string, data: NotificationInput): Promise<Notification> {
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

  async sendBulk(userIds: string[], data: NotificationInput): Promise<void> {
    if (userIds.length === 0) return;
    const rows = userIds.map(uid => ({
      user_id: uid,
      tipo: data.tipo,
      titulo: data.titulo,
      mensaje: data.mensaje,
      link: data.link ?? null,
      leida: false,
    }));
    const { error } = await this.db.from('ch_notificaciones').insert(rows);
    if (error) throw error;
  }
}
