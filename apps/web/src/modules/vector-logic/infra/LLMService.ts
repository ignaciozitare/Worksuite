/**
 * LLM Service — Frontend adapter that proxies through the WorkSuite backend.
 *
 * All LLM calls go through POST /ai/chat so API keys never leave the
 * Supabase/server side. The frontend sends the user's stored API key
 * (fetched from vl_ai_settings) along with the request, but the actual
 * HTTPS call to Anthropic/OpenAI is made by the backend.
 */
import { supabase } from '@/shared/lib/supabaseClient';
import type { AIProvider } from '../domain/entities/AI';
import type {
  ILLMService,
  ToolDefinition,
  LLMResponse,
  ChatMessage,
} from '../domain/ports/ILLMService';

const API_BASE = ((import.meta as any).env?.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export class LLMService implements ILLMService {
  async chat(
    provider: AIProvider,
    model: string,
    apiKey: string,
    systemPrompt: string,
    messages: ChatMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMResponse> {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        provider,
        model,
        apiKey,
        systemPrompt,
        messages,
        tools,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
    }

    const body = await res.json();
    if (!body?.ok) {
      throw new Error(body?.error?.message ?? 'LLM request failed');
    }
    return body.data as LLMResponse;
  }
}
