import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/shared/lib/supabaseClient';

export interface ChronoNotif {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  link: string | null;
  createdAt: string;
}

function toNotif(row: any): ChronoNotif {
  return {
    id: row.id, tipo: row.tipo, titulo: row.titulo, mensaje: row.mensaje,
    leida: row.leida, link: row.link, createdAt: row.created_at,
  };
}

export function useNotificaciones(userId: string) {
  const [notifs, setNotifs] = useState<ChronoNotif[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('ch_notificaciones')
      .select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
    if (data) {
      setNotifs(data.map(toNotif));
      setUnread(data.filter((n: any) => !n.leida).length);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const marcarLeida = async (id: string) => {
    await supabase.from('ch_notificaciones').update({ leida: true }).eq('id', id);
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n));
    setUnread(prev => Math.max(0, prev - 1));
  };

  return { notifs, unread, marcarLeida, reload: load };
}
