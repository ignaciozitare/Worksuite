/**
 * LLM Service — calls the Anthropic or OpenAI API from the browser.
 *
 * NOTE: Calling LLM APIs directly from the frontend exposes the API key.
 * In production, this should be proxied through a backend endpoint that
 * holds the key server-side. For now, the key is stored per-user in
 * vl_ai_settings and sent with CORS-allowed headers.
 */
import type { AIProvider } from '../domain/entities/AI';

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

export class LLMService {
  async chat(
    provider: AIProvider,
    model: string,
    apiKey: string,
    systemPrompt: string,
    messages: ChatMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMResponse> {
    if (provider === 'anthropic') return this.callAnthropic(model, apiKey, systemPrompt, messages, tools);
    return this.callOpenAI(model, apiKey, systemPrompt, messages, tools);
  }

  private async callAnthropic(
    model: string, apiKey: string, systemPrompt: string,
    messages: ChatMessage[], tools: ToolDefinition[],
  ): Promise<LLMResponse> {
    const body = {
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role === 'tool' ? 'user' : m.role, content: m.content })),
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error: ${res.status} ${err}`);
    }

    const data = await res.json();
    const textBlocks = data.content?.filter((b: any) => b.type === 'text') ?? [];
    const toolBlocks = data.content?.filter((b: any) => b.type === 'tool_use') ?? [];
    return {
      content: textBlocks.map((b: any) => b.text).join('\n'),
      toolCalls: toolBlocks.map((b: any) => ({
        id: b.id,
        name: b.name,
        arguments: b.input,
      })),
    };
  }

  private async callOpenAI(
    model: string, apiKey: string, systemPrompt: string,
    messages: ChatMessage[], tools: ToolDefinition[],
  ): Promise<LLMResponse> {
    const body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.role === 'tool' ? 'tool' : m.role,
          content: m.content,
          ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        })),
      ],
      tools: tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      })),
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error: ${res.status} ${err}`);
    }

    const data = await res.json();
    const msg = data.choices?.[0]?.message ?? {};
    const calls = (msg.tool_calls ?? []).map((tc: any) => ({
      id: tc.id,
      name: tc.function?.name,
      arguments: JSON.parse(tc.function?.arguments ?? '{}'),
    }));
    return {
      content: msg.content ?? '',
      toolCalls: calls,
    };
  }
}
