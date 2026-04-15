// ─────────────────────────────────────────────────────────────────────────────
// Domain port: LLM service
// Abstracts calls to Anthropic, OpenAI, or any other provider.
// Infrastructure adapters implement this interface.
// ─────────────────────────────────────────────────────────────────────────────

export type LLMProvider = 'anthropic' | 'openai' | 'google';

export interface LLMToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: LLMToolCall[];
}

export interface LLMResponse {
  content: string;
  toolCalls: LLMToolCall[];
}

export interface LLMChatRequest {
  provider: LLMProvider;
  model: string;
  apiKey: string;
  systemPrompt: string;
  messages: LLMMessage[];
  tools: LLMToolDefinition[];
}

export interface LLMModel {
  id: string;
  name: string;
}

export interface ILLMService {
  chat(req: LLMChatRequest): Promise<LLMResponse>;
  listModels(provider: LLMProvider, apiKey: string): Promise<LLMModel[]>;
}
