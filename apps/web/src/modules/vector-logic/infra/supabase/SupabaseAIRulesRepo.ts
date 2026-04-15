import type { SupabaseClient } from '@supabase/supabase-js';
import type { IAIRulesRepo } from '../../domain/ports/IAIRulesRepo';
import type { AIRule } from '../../domain/entities/AI';

export class SupabaseAIRulesRepo implements IAIRulesRepo {
  constructor(private sb: SupabaseClient) {}

  async list(userId: string): Promise<AIRule[]> {
    const { data, error } = await this.sb
      .from('vl_ai_rules')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(this.toDomain);
  }

  async create(rule: Omit<AIRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<AIRule> {
    const { data, error } = await this.sb
      .from('vl_ai_rules')
      .insert({
        user_id: rule.userId,
        name: rule.name,
        description: rule.description,
        is_active: rule.isActive,
      })
      .select()
      .single();
    if (error) throw error;
    return this.toDomain(data);
  }

  async update(id: string, patch: Partial<AIRule>): Promise<void> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.isActive !== undefined) row.is_active = patch.isActive;
    const { error } = await this.sb.from('vl_ai_rules').update(row).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_ai_rules').delete().eq('id', id);
    if (error) throw error;
  }

  private toDomain(row: any): AIRule {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
