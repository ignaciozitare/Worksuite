// ─────────────────────────────────────────────────────────────────────────────
// LLM Service adapter — implements ILLMService for Anthropic and OpenAI.
// Runs server-side so API keys are never exposed to the browser.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ILLMService,
  LLMChatRequest,
  LLMResponse,
  LLMMessage,
  LLMToolDefinition,
  LLMProvider,
  LLMModel,
} from '../../domain/ai/ILLMService.js';

export class LLMServiceAdapter implements ILLMService {
  async chat(req: LLMChatRequest): Promise<LLMResponse> {
    if (req.provider === 'anthropic') return this.callAnthropic(req);
    return this.callOpenAI(req);
  }

  async listModels(provider: LLMProvider, apiKey: string): Promise<LLMModel[]> {
    if (provider === 'anthropic') return this.listAnthropicModels(apiKey);
    return this.listOpenAIModels(apiKey);
  }

  private async listOpenAIModels(apiKey: string): Promise<LLMModel[]> {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI models error ${res.status}: ${err}`);
    }
    const data = await res.json() as { data?: Array<{ id: string }> };
    // Filter to chat-capable models: gpt-* excluding embeddings, dall-e, whisper, tts, etc.
    const ids = (data.data ?? [])
      .map((m) => m.id)
      .filter((id) =>
        /^(gpt|o1|o3|chatgpt)/i.test(id) &&
        !/embedding|whisper|tts|dall-e|moderation|realtime|audio|transcribe/i.test(id),
      )
      .sort();
    return ids.map((id) => ({ id, name: id }));
  }

  private async listAnthropicModels(apiKey: string): Promise<LLMModel[]> {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic models error ${res.status}: ${err}`);
    }
    const data = await res.json() as { data?: Array<{ id: string; display_name?: string }> };
    return (data.data ?? [])
      .map((m) => ({ id: m.id, name: m.display_name ?? m.id }))
      .sort((a, b) => b.id.localeCompare(a.id));
  }

  private async callAnthropic(req: LLMChatRequest): Promise<LLMResponse> {
    const body = {
      model: req.model,
      max_tokens: 4096,
      system: req.systemPrompt,
      messages: this.mapMessagesToAnthropic(req.messages),
      tools: req.tools.map((t: LLMToolDefinition) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': req.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = await res.json() as { content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> };
    const textBlocks = (data.content ?? []).filter((b) => b.type === 'text');
    const toolBlocks = (data.content ?? []).filter((b) => b.type === 'tool_use');
    return {
      content: textBlocks.map((b) => b.text ?? '').join('\n'),
      toolCalls: toolBlocks.map((b) => ({
        id: b.id ?? '',
        name: b.name ?? '',
        arguments: b.input ?? {},
      })),
    };
  }

  private async callOpenAI(req: LLMChatRequest): Promise<LLMResponse> {
    const body = {
      model: req.model,
      messages: [
        { role: 'system', content: req.systemPrompt },
        ...req.messages.map((m: LLMMessage) => ({
          role: m.role === 'tool' ? 'tool' : m.role,
          content: m.content,
          ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        })),
      ],
      tools: req.tools.map((t: LLMToolDefinition) => ({
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
        Authorization: `Bearer ${req.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
    };
    const msg = data.choices?.[0]?.message ?? {};
    const calls = (msg.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function?.name ?? '',
      arguments: JSON.parse(tc.function?.arguments ?? '{}') as Record<string, unknown>,
    }));
    return {
      content: msg.content ?? '',
      toolCalls: calls,
    };
  }

  private mapMessagesToAnthropic(messages: LLMMessage[]): Array<{ role: string; content: string }> {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.content,
      }));
  }
}
