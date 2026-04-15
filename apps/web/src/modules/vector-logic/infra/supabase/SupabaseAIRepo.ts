import type { SupabaseClient } from '@supabase/supabase-js';
import type { IAIRepo } from '../../domain/ports/IAIRepo';
import type { AISettings, AIConversation, AIMessage, AIRule } from '../../domain/entities/AI';

export class SupabaseAIRepo implements IAIRepo {
  constructor(private sb: SupabaseClient) {}

  /* ── Settings ───────────────────────────────────────────────────── */
  async getSettings(userId: string): Promise<AISettings | null> {
    const { data, error } = await this.sb
      .from('vl_ai_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return this.toSettings(data);
  }

  async upsertSettings(settings: Omit<AISettings, 'id' | 'createdAt' | 'updatedAt'>): Promise<AISettings> {
    const { data, error } = await this.sb
      .from('vl_ai_settings')
      .upsert({
        user_id: settings.userId,
        provider: settings.provider,
        model: settings.model,
        api_key: settings.apiKey,
        system_prompt: settings.systemPrompt,
        mcp_endpoint: settings.mcpEndpoint,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw error;
    return this.toSettings(data);
  }

  /* ── Conversations ──────────────────────────────────────────────── */
  async listConversations(userId: string): Promise<AIConversation[]> {
    const { data, error } = await this.sb
      .from('vl_ai_conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(this.toConversation);
  }

  async createConversation(userId: string, title: string | null): Promise<AIConversation> {
    const { data, error } = await this.sb
      .from('vl_ai_conversations')
      .insert({ user_id: userId, title })
      .select()
      .single();
    if (error) throw error;
    return this.toConversation(data);
  }

  async deleteConversation(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_ai_conversations').delete().eq('id', id);
    if (error) throw error;
  }

  /* ── Messages ───────────────────────────────────────────────────── */
  async listMessages(conversationId: string): Promise<AIMessage[]> {
    const { data, error } = await this.sb
      .from('vl_ai_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(this.toMessage);
  }

  async appendMessage(msg: Omit<AIMessage, 'id' | 'createdAt'>): Promise<AIMessage> {
    const { data, error } = await this.sb
      .from('vl_ai_messages')
      .insert({
        conversation_id: msg.conversationId,
        role: msg.role,
        content: msg.content,
        tool_calls: msg.toolCalls,
      })
      .select()
      .single();
    if (error) throw error;
    return this.toMessage(data);
  }

  /* ── Rules ──────────────────────────────────────────────────────── */
  async listRules(userId: string): Promise<AIRule[]> {
    const { data, error } = await this.sb
      .from('vl_ai_rules')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(this.toRule);
  }

  async createRule(rule: Omit<AIRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<AIRule> {
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
    return this.toRule(data);
  }

  async updateRule(id: string, patch: Partial<AIRule>): Promise<void> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.isActive !== undefined) row.is_active = patch.isActive;
    const { error } = await this.sb.from('vl_ai_rules').update(row).eq('id', id);
    if (error) throw error;
  }

  async deleteRule(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_ai_rules').delete().eq('id', id);
    if (error) throw error;
  }

  /* ── Mappers ────────────────────────────────────────────────────── */
  private toSettings(row: any): AISettings {
    return {
      id: row.id,
      userId: row.user_id,
      provider: row.provider,
      model: row.model,
      apiKey: row.api_key,
      systemPrompt: row.system_prompt,
      mcpEndpoint: row.mcp_endpoint,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toConversation(row: any): AIConversation {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toMessage(row: any): AIMessage {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      toolCalls: row.tool_calls,
      createdAt: row.created_at,
    };
  }

  private toRule(row: any): AIRule {
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
