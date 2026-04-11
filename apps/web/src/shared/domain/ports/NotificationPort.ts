export type NotificationType = 'info' | 'warning' | 'action' | string;

export interface Notification {
  id: string;
  userId?: string;
  tipo: NotificationType;
  titulo: string;
  mensaje: string;
  leida: boolean;
  link: string | null;
  createdAt: string;
}

export interface NotificationInput {
  tipo: NotificationType;
  titulo: string;
  mensaje: string;
  link?: string;
}

export interface NotificationPort {
  /** Read the latest notifications of a user (default limit 20). */
  listByUser(userId: string, limit?: number): Promise<Notification[]>;
  /** Mark a single notification as read. */
  markAsRead(id: string): Promise<void>;
  /** Count unread notifications of a user. */
  unreadCount(userId: string): Promise<number>;
  /** Create one notification for one user. */
  send(userId: string, data: NotificationInput): Promise<Notification>;
  /** Create the same notification for many users at once. */
  sendBulk(userIds: string[], data: NotificationInput): Promise<void>;
}
