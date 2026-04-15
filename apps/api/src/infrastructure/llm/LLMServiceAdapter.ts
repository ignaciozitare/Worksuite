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

    // OpenAI's /v1/models does not indicate capability, so we filter by name.
    // Keep only models compatible with /v1/chat/completions.
    const EXCLUDE = [
      'instruct',         // gpt-3.5-turbo-instruct (legacy /v1/completions)
      'embedding',        // text-embedding-*
      'whisper',          // audio transcription
      'tts',              // text-to-speech
      'dall-e',           // image generation
      'moderation',       // classification, not chat
      'davinci',          // legacy base models
      'babbage',          // legacy base models
      'gpt-base',         // base model, not chat
      'realtime',         // WebSocket-only realtime API
      'audio-preview',    // audio input/output, not chat
      'transcribe',       // speech-to-text
      'search',           // search models, different endpoint
      'computer-use',     // separate API
      'image',            // image generation variants
    ];

    const ids = (data.data ?? [])
      .map((m) => m.id)
      .filter((id) => {
        // Must match one of the chat-capable families
        const isChat = /^(gpt-4|gpt-3\.5-turbo|o1|o3|o4|chatgpt)/i.test(id);
        if (!isChat) return false;
        // Reject any model whose id contains a known non-chat keyword
        const lower = id.toLowerCase();
        return !EXCLUDE.some((k) => lower.includes(k));
      })
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
