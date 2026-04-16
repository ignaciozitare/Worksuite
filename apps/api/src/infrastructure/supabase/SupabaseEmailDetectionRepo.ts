import type { SupabaseClient } from '@supabase/supabase-js';
import type { IEmailDetectionRepo } from '../../domain/emailIntel/IEmailIntelRepos.js';
import type { EmailDetection, EmailDetectionStatus } from '../../domain/emailIntel/types.js';

export class SupabaseEmailDetectionRepo implements IEmailDetectionRepo {
  constructor(private readonly db: SupabaseClient) {}

  async list(userId: string, status?: EmailDetectionStatus): Promise<EmailDetection[]> {
    let q = this.db
      .from('vl_email_detections')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw new Error(`Failed to list detections: ${error.message}`);
    return (data ?? []) as EmailDetection[];
  }

  async findById(id: string): Promise<EmailDetection | null> {
    const { data, error } = await this.db
      .from('vl_email_detections')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return data as EmailDetection;
  }

  async create(draft: Omit<EmailDetection, 'id' | 'created_at' | 'updated_at'>): Promise<EmailDetection> {
    const { data, error } = await this.db
      .from('vl_email_detections')
      .insert(draft)
      .select()
      .single();
    if (error) throw new Error(`Failed to create detection: ${error.message}`);
    return data as EmailDetection;
  }

  async update(id: string, patch: Partial<EmailDetection>): Promise<void> {
    const { error } = await this.db
      .from('vl_email_detections')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Failed to update detection: ${error.message}`);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from('vl_email_detections').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete detection: ${error.message}`);
  }
}
