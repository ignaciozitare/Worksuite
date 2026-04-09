export type TipoNotificacion = 'info' | 'warning' | 'action';

export interface Notificacion {
  id: string;
  userId: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  leida: boolean;
  link: string | null;
  createdAt: string;
}
