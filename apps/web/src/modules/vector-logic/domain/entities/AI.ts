export type AIProvider = 'anthropic' | 'openai';

export interface AISettings {
  id: string;
  userId: string;
  provider: AIProvider;
  model: string;
  apiKey: string | null;
  systemPrompt: string | null;
  mcpEndpoint: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AIConversation {
  id: string;
  userId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AIMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface AIMessage {
  id: string;
  conversationId: string;
  role: AIMessageRole;
  content: string;
  toolCalls: unknown[] | null;
  createdAt: string;
}

export interface AIRule {
  id: string;
  userId: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_SYSTEM_PROMPT = `You are the Vector Logic AI assistant. You help users manage tasks, read emails via MCP tools, and create actionable items in their workspace.

When you detect action items in emails or when users request task creation, use the create_task tool with the appropriate task_type and relevant details.

Be concise, practical, and always confirm before creating tasks.`;
