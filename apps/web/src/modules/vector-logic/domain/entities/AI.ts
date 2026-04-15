/**
 * Vector Logic — AI domain entities
 *
 * The AI module supports two modes:
 * - 'embedded'  — chat lives inside Vector Logic, talks to the configured
 *                 provider (Google Gemini free tier, OpenAI, or Anthropic)
 *                 via the WorkSuite backend proxy at /ai/chat
 * - 'external'  — no embedded chat. The user uses Claude Desktop or
 *                 Claude Code as their AI client and connects to the
 *                 Vector Logic MCP server. The Chat tab is hidden.
 */
export type AIMode = 'embedded' | 'external';

export type AIProvider = 'anthropic' | 'openai' | 'google';

export interface AISettings {
  id: string;
  userId: string;
  mode: AIMode;
  provider: AIProvider;
  model: string | null;
  apiKey: string | null;
  systemPrompt: string | null;
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

export const DEFAULT_SYSTEM_PROMPT = `You are the Vector Logic AI assistant. You help the user manage tasks, workflows, and schemas in their Vector Logic workspace.

You have tools to list workflows/states/task types, list tasks, create tasks, update tasks, move tasks between states, and delete tasks. Use them whenever the user asks you to look up or modify their workspace.

Be concise, practical, and always confirm before destructive actions.`;
