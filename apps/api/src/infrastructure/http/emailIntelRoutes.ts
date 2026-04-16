// ─────────────────────────────────────────────────────────────────────────────
// Email Intelligence — HTTP routes
// Mounted under /email-intel in app.ts
//
// Exposes:
//   GET    /connection                      — get current user's Gmail connection summary
//   DELETE /connection                      — disconnect Gmail
//   PATCH  /connection/settings             — update polling/threshold/defaults
//   GET    /oauth/start                     — begin OAuth; returns { url } to redirect the browser to
//   GET    /oauth/callback                  — OAuth callback (exchanges code, persists tokens, redirects back to app)
//   GET    /rules                           — list user's rules
//   POST   /rules                           — create rule
//   PATCH  /rules/:id                       — update rule
//   DELETE /rules/:id                       — delete rule
//   GET    /detections                      — list detections, optional ?status= filter
//   POST   /detections/:id/approve          — create a task from the proposed fields (optionally override fields in body)
//   POST   /detections/:id/reject           — mark as rejected
//
// Auth: every route requires Supabase Bearer token; userId = request.user.sub
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IGmailConnectionRepo, IEmailRuleRepo, IEmailDetectionRepo } from '../../domain/emailIntel/IEmailIntelRepos.js';
import type { EmailRuleFilter, EmailDetectionStatus } from '../../domain/emailIntel/types.js';
import type { ILLMService } from '../../domain/ai/ILLMService.js';
import { GmailOAuthService } from '../gmail/GmailOAuthService.js';
import { GmailProvider } from '../gmail/GmailProvider.js';
import { encryptToken } from '../gmail/tokenCrypto.js';
import { pollInboxForUser } from '../../application/emailIntel/PollInboxForUser.js';
import { randomBytes } from 'node:crypto';

interface EmailIntelRoutesOptions extends FastifyPluginOptions {
  gmailConnectionRepo: IGmailConnectionRepo;
  emailRuleRepo:       IEmailRuleRepo;
  emailDetectionRepo:  IEmailDetectionRepo;
  oauthService:        GmailOAuthService;
  llm:                 ILLMService;
  supabase:            SupabaseClient;
}

// Short-lived in-memory OAuth state → userId map. In a distributed deploy
// this would need Redis or a DB table. For Vercel serverless this works
// within a single cold-start; for now, OAuth completions across cold starts
// are tolerated because we also verify the logged-in user on callback.
const pendingStates = new Map<string, { userId: string; expiresAt: number }>();
function gcStates(): void {
  const now = Date.now();
  for (const [k, v] of pendingStates) if (v.expiresAt < now) pendingStates.delete(k);
}

export async function emailIntelRoutes(app: FastifyInstance, opts: EmailIntelRoutesOptions): Promise<void> {
  const { gmailConnectionRepo, emailRuleRepo, emailDetectionRepo, oauthService, llm, supabase } = opts;
  const gmail = new GmailProvider();

  // Most routes need auth — but the OAuth callback is hit by Google's redirect
  // so we register auth per-route instead of globally.
  const authHook = { preHandler: app.authenticate };

  // ── Connection ────────────────────────────────────────────────────────────
  app.get('/connection', authHook, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const conn = await gmailConnectionRepo.findByUserId(userId);
    if (!conn) return reply.send({ ok: true, data: null, oauthConfigured: oauthService.isConfigured() });
    return reply.send({
      ok: true,
      oauthConfigured: oauthService.isConfigured(),
      data: {
        email: conn.email,
        is_active: conn.is_active,
        polling_interval_minutes: conn.polling_interval_minutes,
        confidence_threshold: conn.confidence_threshold,
        default_priority_id: conn.default_priority_id,
        default_task_type_id: conn.default_task_type_id,
        last_polled_at: conn.last_polled_at,
        created_at: conn.created_at,
      },
    });
  });

  app.delete('/connection', authHook, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    await gmailConnectionRepo.deleteByUserId(userId);
    return reply.send({ ok: true });
  });

  app.patch<{
    Body: {
      polling_interval_minutes?: number;
      confidence_threshold?: number;
      default_priority_id?: string | null;
      default_task_type_id?: string | null;
      is_active?: boolean;
    };
  }>('/connection/settings', authHook, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    try {
      await gmailConnectionRepo.updateSettings(userId, req.body ?? {});
      return reply.send({ ok: true });
    } catch (err) {
      return reply.status(500).send({ ok: false, error: { code: 'DB_ERROR', message: String(err) } });
    }
  });

  // ── OAuth ─────────────────────────────────────────────────────────────────
  app.get('/oauth/start', authHook, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!oauthService.isConfigured()) {
      return reply.status(503).send({
        ok: false,
        error: {
          code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
          message: 'Google OAuth credentials are not set on the server. Contact the admin.',
        },
      });
    }
    const userId = (req.user as { sub: string }).sub;
    gcStates();
    const state = randomBytes(24).toString('base64url');
    pendingStates.set(state, { userId, expiresAt: Date.now() + 10 * 60 * 1000 });
    const url = oauthService.buildAuthUrl(state);
    return reply.send({ ok: true, url });
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/oauth/callback',
    async (req, reply) => {
      const { code, state, error } = req.query ?? {};
      const appOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
      if (error) {
        return reply.redirect(`${appOrigin}/vector-logic?gmail=denied`);
      }
      if (!code || !state) {
        return reply.status(400).send({ ok: false, error: { code: 'BAD_REQUEST', message: 'Missing code or state' } });
      }
      gcStates();
      const pending = pendingStates.get(state);
      pendingStates.delete(state);
      if (!pending) {
        return reply.status(400).send({ ok: false, error: { code: 'INVALID_STATE', message: 'State expired or unknown' } });
      }
      try {
        const tokens = await oauthService.exchangeCodeForTokens(code);
        if (!tokens.refresh_token) {
          return reply.status(400).send({
            ok: false,
            error: { code: 'NO_REFRESH_TOKEN', message: 'Google did not return a refresh token. Revoke access and retry with prompt=consent.' },
          });
        }
        const gmailEmail = await oauthService.fetchUserEmail(tokens.access_token);
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
        await gmailConnectionRepo.upsert({
          user_id: pending.userId,
          email: gmailEmail,
          refresh_token: encryptToken(tokens.refresh_token),
          access_token: encryptToken(tokens.access_token),
          token_expires_at: expiresAt,
          is_active: true,
          polling_interval_minutes: 5,
          confidence_threshold: 0.85,
          default_priority_id: null,
          default_task_type_id: null,
          last_polled_at: null,
          last_message_timestamp: null,
        });
        return reply.redirect(`${appOrigin}/vector-logic?gmail=connected`);
      } catch (err) {
        app.log.error({ err }, 'Gmail OAuth callback failed');
        return reply.redirect(`${appOrigin}/vector-logic?gmail=error`);
      }
    },
  );

  // ── Rules CRUD ────────────────────────────────────────────────────────────
  app.get('/rules', authHook, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    try {
      const rules = await emailRuleRepo.list(userId);
      return reply.send({ ok: true, data: rules });
    } catch (err) {
      return reply.status(500).send({ ok: false, error: { code: 'DB_ERROR', message: String(err) } });
    }
  });

  app.post<{
    Body: {
      name: string;
      filters: EmailRuleFilter[];
      action_task_type_id?: string | null;
      action_priority_name?: string | null;
      action_assignee_id?: string | null;
      sort_order?: number;
      is_active?: boolean;
    };
  }>('/rules', authHook, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const body = req.body;
    if (!body?.name?.trim() || !Array.isArray(body.filters)) {
      return reply.status(400).send({ ok: false, error: { code: 'BAD_REQUEST', message: 'name and filters are required' } });
    }
    try {
      const rule = await emailRuleRepo.create({
        user_id: userId,
        name: body.name.trim(),
        is_active: body.is_active ?? true,
        filters: body.filters,
        action_task_type_id: body.action_task_type_id ?? null,
        action_priority_name: body.action_priority_name ?? null,
        action_assignee_id: body.action_assignee_id ?? null,
        sort_order: body.sort_order ?? 0,
      });
      return reply.send({ ok: true, data: rule });
    } catch (err) {
      return reply.status(500).send({ ok: false, error: { code: 'DB_ERROR', message: String(err) } });
    }
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/rules/:id',
    authHook,
    async (req, reply) => {
      const userId = (req.user as { sub: string }).sub;
      const existing = await emailRuleRepo.findById(req.params.id);
      if (!existing || existing.user_id !== userId) {
        return reply.status(404).send({ ok: false, error: { code: 'NOT_FOUND' } });
      }
      try {
        await emailRuleRepo.update(req.params.id, req.body as any);
        return reply.send({ ok: true });
      } catch (err) {
        return reply.status(500).send({ ok: false, error: { code: 'DB_ERROR', message: String(err) } });
      }
    },
  );

  app.delete<{ Params: { id: string } }>('/rules/:id', authHook, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const existing = await emailRuleRepo.findById(req.params.id);
    if (!existing || existing.user_id !== userId) {
      return reply.status(404).send({ ok: false, error: { code: 'NOT_FOUND' } });
    }
    try {
      await emailRuleRepo.remove(req.params.id);
      return reply.send({ ok: true });
    } catch (err) {
      return reply.status(500).send({ ok: false, error: { code: 'DB_ERROR', message: String(err) } });
    }
  });

  // ── Detections ────────────────────────────────────────────────────────────
  app.get<{ Querystring: { status?: EmailDetectionStatus } }>(
    '/detections',
    authHook,
    async (req, reply) => {
      const userId = (req.user as { sub: string }).sub;
      try {
        const list = await emailDetectionRepo.list(userId, req.query?.status);
        return reply.send({ ok: true, data: list });
      } catch (err) {
        return reply.status(500).send({ ok: false, error: { code: 'DB_ERROR', message: String(err) } });
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body?: {
      title?: string;
      description?: string;
      task_type_id?: string;
      priority?: string;
      due_date?: string | null;
    };
  }>('/detections/:id/approve', authHook, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const detection = await emailDetectionRepo.findById(req.params.id);
    if (!detection || detection.user_id !== userId) {
      return reply.status(404).send({ ok: false, error: { code: 'NOT_FOUND' } });
    }
    if (detection.status !== 'pending_review') {
      return reply.status(409).send({ ok: false, error: { code: 'INVALID_STATE', message: 'Detection is not pending review' } });
    }

    // Override detection's proposed fields with any provided in the body
    const title       = req.body?.title       ?? detection.proposed_title       ?? detection.subject ?? 'Untitled';
    const description = req.body?.description ?? detection.proposed_description ?? '';
    const taskTypeId  = req.body?.task_type_id ?? detection.proposed_task_type_id;
    const priority    = req.body?.priority    ?? detection.proposed_priority;
    const dueDate     = req.body?.due_date    !== undefined ? req.body.due_date : detection.proposed_due_date;

    if (!taskTypeId) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'MISSING_TASK_TYPE', message: 'A task type is required to create the task' },
      });
    }

    // Look up the initial (OPEN) state of the task type's workflow
    const { data: taskType } = await supabase
      .from('vl_task_types')
      .select('workflow_id')
      .eq('id', taskTypeId)
      .single();
    const workflowId: string | null = (taskType as any)?.workflow_id ?? null;

    let initialStateId: string | null = null;
    if (workflowId) {
      const { data: states } = await supabase
        .from('vl_workflow_states')
        .select('state_id, is_initial, vl_states!inner(category)')
        .eq('workflow_id', workflowId);
      const ws = (states ?? []) as any[];
      initialStateId =
        ws.find(s => s.vl_states?.category === 'OPEN')?.state_id ??
        ws.find(s => s.is_initial)?.state_id ??
        ws[0]?.state_id ??
        null;
    }

    // Create the task
    const { data: task, error: taskErr } = await supabase
      .from('vl_tasks')
      .insert({
        task_type_id: taskTypeId,
        state_id: initialStateId,
        title,
        data: description ? { description } : {},
        assignee_id: userId,
        priority,
        sort_order: 0,
        created_by: userId,
        gmail_message_id: detection.gmail_message_id,
        gmail_thread_id: detection.gmail_thread_id,
        created_by_ai: true,
      })
      .select()
      .single();
    if (taskErr || !task) {
      return reply.status(500).send({ ok: false, error: { code: 'TASK_CREATE_FAILED', message: taskErr?.message ?? 'unknown' } });
    }

    await emailDetectionRepo.update(detection.id, {
      status: 'approved',
      task_id: (task as any).id,
      proposed_title: title,
      proposed_description: description,
      proposed_task_type_id: taskTypeId,
      proposed_priority: priority ?? null,
      proposed_due_date: dueDate ?? null,
    });

    return reply.send({ ok: true, data: { task_id: (task as any).id } });
  });

  app.post<{ Params: { id: string } }>('/detections/:id/reject', authHook, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const detection = await emailDetectionRepo.findById(req.params.id);
    if (!detection || detection.user_id !== userId) {
      return reply.status(404).send({ ok: false, error: { code: 'NOT_FOUND' } });
    }
    await emailDetectionRepo.update(req.params.id, { status: 'rejected' });
    return reply.send({ ok: true });
  });

  // ── Manual ingestion trigger (authenticated user polls their own inbox) ───
  app.post('/ingest', authHook, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    try {
      const result = await pollInboxForUser(userId, {
        supabase, gmailConnectionRepo, emailRuleRepo, emailDetectionRepo, oauthService, llm, gmail,
      });
      return reply.send({ ok: true, data: result });
    } catch (err) {
      app.log.error({ err }, 'Ingest failed');
      return reply.status(500).send({ ok: false, error: { code: 'INGEST_FAILED', message: String(err) } });
    }
  });

  // ── Cron trigger — iterates ALL active Gmail connections ──────────────────
  // Vercel Cron sends GET requests with Authorization: Bearer <CRON_SECRET>.
  // Any other caller is rejected. Not protected by the Supabase auth hook.
  app.get('/ingest/cron', async (req: FastifyRequest, reply: FastifyReply) => {
    const expected = process.env.CRON_SECRET;
    const header = req.headers['authorization'];
    if (!expected || !header || header !== `Bearer ${expected}`) {
      return reply.status(401).send({ ok: false, error: { code: 'UNAUTHORIZED' } });
    }
    // Pull active connections from DB directly (service role client bypasses RLS)
    const { data, error } = await supabase
      .from('vl_gmail_connections')
      .select('user_id')
      .eq('is_active', true);
    if (error) {
      return reply.status(500).send({ ok: false, error: { code: 'DB_ERROR', message: error.message } });
    }
    const userIds = (data ?? []).map((r: any) => r.user_id as string);
    const results: unknown[] = [];
    for (const uid of userIds) {
      try {
        const r = await pollInboxForUser(uid, {
          supabase, gmailConnectionRepo, emailRuleRepo, emailDetectionRepo, oauthService, llm, gmail,
        });
        results.push(r);
      } catch (err) {
        results.push({ user_id: uid, error: String(err) });
      }
    }
    return reply.send({ ok: true, data: { processed: userIds.length, results } });
  });
}
