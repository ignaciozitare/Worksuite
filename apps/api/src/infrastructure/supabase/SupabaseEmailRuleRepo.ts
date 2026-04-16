import type { SupabaseClient } from '@supabase/supabase-js';
import type { IEmailRuleRepo } from '../../domain/emailIntel/IEmailIntelRepos.js';
import type { EmailRule } from '../../domain/emailIntel/types.js';

export class SupabaseEmailRuleRepo implements IEmailRuleRepo {
  constructor(private readonly db: SupabaseClient) {}

  async list(userId: string): Promise<EmailRule[]> {
    const { data, error } = await this.db
      .from('vl_email_rules')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`Failed to list email rules: ${error.message}`);
    return (data ?? []) as EmailRule[];
  }

  async findById(id: string): Promise<EmailRule | null> {
    const { data, error } = await this.db
      .from('vl_email_rules')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return data as EmailRule;
  }

  async create(draft: Omit<EmailRule, 'id' | 'created_at' | 'updated_at'>): Promise<EmailRule> {
    const { data, error } = await this.db
      .from('vl_email_rules')
      .insert(draft)
      .select()
      .single();
    if (error) throw new Error(`Failed to create email rule: ${error.message}`);
    return data as EmailRule;
  }

  async update(id: string, patch: Partial<EmailRule>): Promise<void> {
    const { error } = await this.db
      .from('vl_email_rules')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Failed to update email rule: ${error.message}`);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from('vl_email_rules').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete email rule: ${error.message}`);
  }
}
