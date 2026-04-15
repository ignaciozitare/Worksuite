import type { AIProvider } from '../entities/AI';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  toolCalls: ToolCall[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface LLMModel {
  id: string;
  name: string;
}

export interface ILLMService {
  chat(
    provider: AIProvider,
    model: string,
    apiKey: string,
    systemPrompt: string,
    messages: ChatMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMResponse>;
  listModels(provider: AIProvider, apiKey: string): Promise<LLMModel[]>;
}
