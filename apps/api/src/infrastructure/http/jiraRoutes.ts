import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JiraCloudAdapter } from '../jira/JiraCloudAdapter.js';

interface JiraRoutesOptions extends FastifyPluginOptions {
  supabase: SupabaseClient;
}

interface JiraConnection {
  user_id:   string;
  base_url:  string;
  email:     string;
  api_token: string;
}

// Obtiene el adaptador Jira del admin (para leer proyectos/issues)
async function adapterForUser(supabase: SupabaseClient, userId: string): Promise<JiraCloudAdapter> {
  const { data, error } = await supabase
    .from('jira_connections')
    .select('base_url, email, api_token')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    throw Object.assign(new Error('Jira no configurado para este usuario'), { statusCode: 404 });
  }

  const conn = data as JiraConnection;
  return new JiraCloudAdapter(conn.base_url, conn.email, conn.api_token);
}

// Obtiene la conexión admin (cualquier jira_connection existente)
async function getAdminConnection(supabase: SupabaseClient): Promise<JiraConnection | null> {
  const { data } = await supabase
    .from('jira_connections')
    .select('base_url, email, api_token, user_id')
    .limit(1)
    .single();
  return data as JiraConnection | null;
}

const saveConnectionSchema = {
  type: 'object',
  required: ['baseUrl', 'email', 'apiToken'],
  properties: {
    baseUrl:  { type: 'string' },
    email:    { type: 'string' },
    apiToken: { type: 'string', minLength: 10 },
  },
} as const;

const syncBodySchema = {
  type: 'object',
  required: ['worklogId', 'seconds', 'startedAt'],
  properties: {
    worklogId:   { type: 'string' },
    seconds:     { type: 'number', minimum: 60 },
    startedAt:   { type: 'string' },
    description: { type: 'string' },
  },
} as const;

export async function jiraRoutes(app: FastifyInstance, opts: JiraRoutesOptions): Promise<void> {
  const { supabase } = opts;

  app.addHook('preHandler', app.authenticate);

  // ── GET /jira/connection ──────────────────────────────────────────────────
  app.get('/connection', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const { data, error } = await supabase
      .from('jira_connections')
      .select('base_url, email, connected_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return reply.status(500).send({ ok: false, error: { code: 'DB_ERROR', message: error.message } });
    return reply.send({ ok: true, data: data ?? null });
  });

  // ── POST /jira/connection ─────────────────────────────────────────────────
  app.post<{ Body: { baseUrl: string; email: string; apiToken: string } }>(
    '/connection',
    { schema: { body: saveConnectionSchema } },
    async (req, reply) => {
      const userId = (req.user as { sub: string }).sub;
      const { baseUrl, email, apiToken } = req.body;
      const normalizedUrl = baseUrl.trim().replace(/\/$/, '');

      if (apiToken.trim() === '__keep__') {
        const { error } = await supabase
          .from('jira_connections')
          .update({ base_url: normalizedUrl, email: email.trim(), updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        if (error) return reply.status(500).send({ ok: false, error: { code: 'DB_ERROR', message: error.message } });
        return reply.send({ ok: true });
      }

      const { error } = await supabase
        .from('jira_connections')
        .upsert(
          { user_id: userId, base_url: normalizedUrl, email: email.trim(), api_token: apiToken.trim() },
          { onConflict: 'user_id' },
        );

      if (error) {
        return reply.status(500).send({ ok: false, error: { code: 'DB_ERROR', message: error.message } });
      }

      return reply.send({ ok: true });
    },
  );

  // ── DELETE /jira/connection ───────────────────────────────────────────────
  app.delete('/connection', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    await supabase.from('jira_connections').delete().eq('user_id', userId);
    return reply.send({ ok: true });
  });

  // ── GET /jira/projects ────────────────────────────────────────────────────
  app.get('/projects', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    try {
      const adapter = await adapterForUser(supabase, userId);
      const projects = await adapter.getProjects();
      return reply.send({ ok: true, data: projects });
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode ?? 502;
      return reply.status(status).send({ ok: false, error: { code: 'JIRA_ERROR', message: String(err) } });
    }
  });

  // ── GET /jira/issues?project=X ────────────────────────────────────────────
  app.get<{ Querystring: { project: string } }>(
    '/issues',
    { schema: { querystring: { type: 'object', required: ['project'], properties: { project: { type: 'string' } } } } },
    async (req, reply) => {
      const userId = (req.user as { sub: string }).sub;
      try {
        const adapter = await adapterForUser(supabase, userId);
        const issues = await adapter.getIssues(req.query.project);
        return reply.send({ ok: true, data: issues });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode ?? 502;
        return reply.status(status).send({ ok: false, error: { code: 'JIRA_ERROR', message: String(err) } });
      }
    },
  );

  // ── POST /jira/worklogs/:issueKey/sync ────────────────────────────────────
  app.post<{
    Params: { issueKey: string };
    Body:   { worklogId: string; seconds: number; startedAt: string; description?: string };
  }>(
    '/worklogs/:issueKey/sync',
    { schema: { body: syncBodySchema } },
    async (req, reply) => {
      const user    = req.user as { sub: string; email: string };
      const { issueKey } = req.params;
      const { worklogId, seconds, startedAt, description } = req.body;

      try {
        // 1. ¿Tiene el usuario su propio token de Jira?
        const { data: userRow } = await supabase
          .from('users')
          .select('jira_api_token, email')
          .eq('id', user.sub)
          .single();

        let adapter: JiraCloudAdapter;
        let commentPrefix = '';

        if (userRow?.jira_api_token) {
          // ── Opción B: token personal del usuario ─────────────────────────
          // Obtener base_url de la conexión admin (el usuario no tiene su propia conexión)
          const adminConn = await getAdminConnection(supabase);
          if (!adminConn) {
            throw Object.assign(new Error('Jira no configurado — el admin debe configurar la conexión en Settings'), { statusCode: 404 });
          }
          const userEmail = userRow.email ?? user.email;
          adapter = new JiraCloudAdapter(adminConn.base_url, userEmail, userRow.jira_api_token);
          app.log.info({ userId: user.sub, userEmail }, 'Jira sync con token personal del usuario');
        } else {
          // ── Opción C: fallback al token del admin ─────────────────────────
          adapter = await adapterForUser(supabase, user.sub);
          const userEmail = userRow?.email ?? user.email;
          commentPrefix = `[Imputado por: ${userEmail}] `;
          app.log.info({ userId: user.sub, userEmail }, 'Jira sync con token admin (fallback)');
        }

        const finalComment = commentPrefix + (description ?? '');

        const result = await adapter.addWorklog(
          issueKey,
          seconds,
          startedAt,
          finalComment || undefined,
        );

        // Actualizar flag en Supabase
        const { error: dbErr } = await supabase
          .from('worklogs')
          .update({ synced_to_jira: true, jira_worklog_id: result.id })
          .eq('id', worklogId);

        if (dbErr) app.log.warn({ dbErr, worklogId }, 'Jira sync OK pero fallo update Supabase');

        return reply.send({ ok: true, data: result });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode ?? 502;
        return reply.status(status).send({ ok: false, error: { code: 'JIRA_SYNC_ERROR', message: String(err) } });
      }
    },
  );
}
