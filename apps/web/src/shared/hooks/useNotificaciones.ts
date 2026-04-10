import { useState, useEffect, useCallback } from 'react';
import type { NotificationPort, Notification } from '../domain/ports/NotificationPort';

export type ChronoNotif = Notification;

export function useNotificaciones(repo: NotificationPort, userId: string) {
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await repo.listByUser(userId);
      setNotifs(data);
      setUnread(data.filter(n => !n.leida).length);
    } catch (err) {
      console.error('Error loading notifications:', err);
    }
  }, [repo, userId]);

  useEffect(() => { load(); }, [load]);

  const marcarLeida = async (id: string) => {
    await repo.markAsRead(id);
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n));
    setUnread(prev => Math.max(0, prev - 1));
  };

  return { notifs, unread, marcarLeida, reload: load };
}
