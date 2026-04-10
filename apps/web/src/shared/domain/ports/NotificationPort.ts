export interface Notification {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  link: string | null;
  createdAt: string;
}

export interface NotificationPort {
  listByUser(userId: string, limit?: number): Promise<Notification[]>;
  markAsRead(id: string): Promise<void>;
}
