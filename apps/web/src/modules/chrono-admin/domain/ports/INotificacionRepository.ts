import type { Notificacion } from '../entities/Notificacion';

export interface INotificacionRepository {
  enviar(userId: string, data: { tipo: string; titulo: string; mensaje: string; link?: string }): Promise<Notificacion>;
  enviarMasivo(userIds: string[], data: { tipo: string; titulo: string; mensaje: string; link?: string }): Promise<void>;
  getByUser(userId: string): Promise<Notificacion[]>;
  marcarLeida(id: string): Promise<void>;
  getNoLeidas(userId: string): Promise<number>;
}
