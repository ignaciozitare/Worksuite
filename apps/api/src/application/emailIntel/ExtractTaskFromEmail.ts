// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ExtractTaskFromEmail — LLM-powered structured extraction.
// Uses the user's existing vl_ai_settings (provider + apiKey) to call the LLM.
// Returns a proposal with a confidence score. The LLM is constrained with a
// tool-schema prompt so output is always JSON.
// ─────────────────────────────────────────────────────────────────────────────

import type { ILLMService } from '../../domain/ai/ILLMService.js';
import type { ParsedEmail } from '../../infrastructure/gmail/GmailProvider.js';

export interface TaskTypeCatalog { id: string; name: string }
export interface PriorityCatalog { name: string }

export interface ExtractedTask {
  title: string;
  description: string;
  task_type_id: string | null;
  priority: string | null;
  due_date: string | null; // YYYY-MM-DD
  confidence: number;      // 0..1
  rationale?: string;
  is_actionable: boolean;  // false → the LLM thinks this is not a task-worthy email
}

interface Args {
  email: ParsedEmail;
  taskTypes: TaskTypeCatalog[];
  priorities: PriorityCatalog[];
  llm: ILLMService;
  provider: 'anthropic' | 'openai' | 'google';
  model: string;
  apiKey: string;
}

const EXTRACTION_TOOL_NAME = 'propose_task';

const SYSTEM_PROMPT = `You are an assistant that reads an email and decides whether it describes an actionable task.
If it is actionable, propose a concise task (title, description, task type, priority, optional due date) and a confidence score between 0 and 1.
If it is NOT actionable (newsletter, marketing, notification, auto-reply, receipt, etc.), return is_actionable=false and leave the other fields empty.
Be conservative: if the email just says "FYI" or shares information without a clear ask, mark is_actionable=false.
Use short, imperative task titles ("Fix login bug", not "There is a login bug").
Base due_date on explicit wording in the email only ("before Friday", "by 2026-05-20"). If nothing explicit, leave null.
Always output JSON that matches the tool schema exactly.`;

export async function extractTaskFromEmail(args: Args): Promise<ExtractedTask | null> {
  const { email, taskTypes, priorities, llm, provider, model, apiKey } = args;

  const toolSchema = {
    type: 'object',
    properties: {
      is_actionable: { type: 'boolean' },
      title:         { type: 'string' },
      description:   { type: 'string' },
      task_type_id:  { type: ['string', 'null'], enum: [null, ...taskTypes.map(t => t.id)] },
      priority:      { type: ['string', 'null'], enum: [null, ...priorities.map(p => p.name)] },
      due_date:      { type: ['string', 'null'], description: 'YYYY-MM-DD or null' },
      confidence:    { type: 'number', minimum: 0, maximum: 1 },
      rationale:     { type: 'string' },
    },
    required: ['is_actionable', 'title', 'description', 'task_type_id', 'priority', 'due_date', 'confidence'],
  };

  const userContext = [
    `From: ${email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}`,
    `Subject: ${email.subject || '(no subject)'}`,
    `Received: ${email.receivedAt}`,
    '',
    `Available task types: ${taskTypes.map(t => `${t.name} (${t.id})`).join(', ') || '(none)'}`,
    `Available priorities: ${priorities.map(p => p.name).join(', ') || '(none)'}`,
    '',
    'Email body:',
    email.bodyText.slice(0, 8000),
  ].join('\n');

  let raw: unknown = null;
  try {
    const res = await llm.chat({
      provider,
      model,
      apiKey,
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContext }],
      tools: [
        {
          name: EXTRACTION_TOOL_NAME,
          description: 'Propose a task extracted from the email (or mark it not actionable).',
          input_schema: toolSchema,
        },
      ],
    });

    // LLMResponse shape (from ai chat route): { content: Array<{ type, text?, tool_use? }>, ... }
    const toolUse = (res?.content ?? []).find((c: any) => c.type === 'tool_use' && c.name === EXTRACTION_TOOL_NAME);
    if (toolUse?.input) {
      raw = toolUse.input;
    } else {
      // Some providers return JSON text. Try to parse first text block.
      const textBlock = (res?.content ?? []).find((c: any) => c.type === 'text' && c.text);
      if (textBlock?.text) {
        const match = textBlock.text.match(/\{[\s\S]*\}/);
        if (match) raw = JSON.parse(match[0]);
      }
    }
  } catch (err) {
    throw new Error(`LLM extraction failed: ${(err as Error).message}`);
  }

  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const isActionable = Boolean(r.is_actionable);
  return {
    is_actionable: isActionable,
    title: (r.title as string) ?? '',
    description: (r.description as string) ?? '',
    task_type_id: (r.task_type_id as string | null) ?? null,
    priority: (r.priority as string | null) ?? null,
    due_date: (r.due_date as string | null) ?? null,
    confidence: typeof r.confidence === 'number' ? r.confidence : 0,
    rationale: r.rationale as string | undefined,
  };
}
