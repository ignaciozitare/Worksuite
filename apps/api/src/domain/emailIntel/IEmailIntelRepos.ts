import type { EmailRule, EmailDetection, GmailConnection, EmailDetectionStatus } from './types.js';

export interface IGmailConnectionRepo {
  findByUserId(userId: string): Promise<GmailConnection | null>;
  upsert(conn: Omit<GmailConnection, 'id' | 'created_at' | 'updated_at'>): Promise<void>;
  updateSettings(userId: string, patch: {
    polling_interval_minutes?: number;
    confidence_threshold?: number;
    default_priority_id?: string | null;
    default_task_type_id?: string | null;
    is_active?: boolean;
    last_polled_at?: string;
    last_message_timestamp?: string;
  }): Promise<void>;
  deleteByUserId(userId: string): Promise<void>;
}

export interface IEmailRuleRepo {
  list(userId: string): Promise<EmailRule[]>;
  findById(id: string): Promise<EmailRule | null>;
  create(draft: Omit<EmailRule, 'id' | 'created_at' | 'updated_at'>): Promise<EmailRule>;
  update(id: string, patch: Partial<Omit<EmailRule, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface IEmailDetectionRepo {
  list(userId: string, status?: EmailDetectionStatus): Promise<EmailDetection[]>;
  findById(id: string): Promise<EmailDetection | null>;
  create(draft: Omit<EmailDetection, 'id' | 'created_at' | 'updated_at'>): Promise<EmailDetection>;
  update(id: string, patch: Partial<Omit<EmailDetection, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<void>;
  remove(id: string): Promise<void>;
}
