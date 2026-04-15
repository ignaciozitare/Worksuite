// ─────────────────────────────────────────────────────────────────────────────
// AI routes — proxy LLM calls through backend to keep API keys server-side
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import type { ILLMService, LLMProvider, LLMMessage, LLMToolDefinition } from '../../domain/ai/ILLMService.js';

interface AIRoutesOptions extends FastifyPluginOptions {
  llmService: ILLMService;
}

interface ChatRequestBody {
  provider: LLMProvider;
  model: string;
  apiKey: string;
  systemPrompt: string;
  messages: LLMMessage[];
  tools: LLMToolDefinition[];
}

const chatBodySchema = {
  type: 'object',
  required: ['provider', 'model', 'apiKey', 'systemPrompt', 'messages'],
  properties: {
    provider:     { type: 'string', enum: ['anthropic', 'openai'] },
    model:        { type: 'string', minLength: 1 },
    apiKey:       { type: 'string', minLength: 1 },
    systemPrompt: { type: 'string' },
    messages:     { type: 'array' },
    tools:        { type: 'array' },
  },
} as const;

export async function aiRoutes(app: FastifyInstance, opts: AIRoutesOptions): Promise<void> {
  const { llmService } = opts;

  app.addHook('preHandler', app.authenticate);

  // ── POST /ai/chat ───────────────────────────────────────────────────────
  // Proxies a chat request to the configured LLM provider.
  // The API key lives in the request body (frontend reads from vl_ai_settings
  // and forwards it here). This avoids exposing it cross-origin to the LLM
  // provider's CORS-restricted endpoints from the browser.
  app.post<{ Body: ChatRequestBody }>(
    '/chat',
    { schema: { body: chatBodySchema } },
    async (req: FastifyRequest<{ Body: ChatRequestBody }>, reply: FastifyReply) => {
      try {
        const response = await llmService.chat({
          provider: req.body.provider,
          model: req.body.model,
          apiKey: req.body.apiKey,
          systemPrompt: req.body.systemPrompt,
          messages: req.body.messages,
          tools: req.body.tools ?? [],
        });
        return reply.send({ ok: true, data: response });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({ ok: false, error: { code: 'LLM_ERROR', message: msg } });
      }
    },
  );
}
