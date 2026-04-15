import type { AISettings, AIConversation, AIMessage, AIRule } from '../entities/AI';

export interface IAIRepo {
  // Settings
  getSettings(userId: string): Promise<AISettings | null>;
  upsertSettings(settings: Omit<AISettings, 'id' | 'createdAt' | 'updatedAt'>): Promise<AISettings>;

  // Conversations
  listConversations(userId: string): Promise<AIConversation[]>;
  createConversation(userId: string, title: string | null): Promise<AIConversation>;
  deleteConversation(id: string): Promise<void>;

  // Messages
  listMessages(conversationId: string): Promise<AIMessage[]>;
  appendMessage(msg: Omit<AIMessage, 'id' | 'createdAt'>): Promise<AIMessage>;

  // Rules
  listRules(userId: string): Promise<AIRule[]>;
  createRule(rule: Omit<AIRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<AIRule>;
  updateRule(id: string, patch: Partial<AIRule>): Promise<void>;
  deleteRule(id: string): Promise<void>;
}
