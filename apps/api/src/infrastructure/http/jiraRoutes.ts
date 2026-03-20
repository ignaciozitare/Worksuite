import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JiraCloudAdapter } from '../jira/JiraCloudAdapter.js';

interface JiraRoutesOptions extends FastifyPluginOptions {
  supabase: SupabaseClient;
}

interface JiraConnection {
  user_id:  string;
  base_url: string;
  email:    string;
  api_token: string;
}

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

  app.post<{ Body: { baseUrl: string; email: string; apiToken: string } }>(
    '/connection',
    { schema: { body: saveConnectionSchema } },
    async (req, reply) => {
      const userId = (req.user as { sub: string }).sub;
      const { baseUrl, email, apiToken } = req.body;

      try {
        const adapter = new JiraCloudAdapter(baseUrl, email, apiToken);
        await adapter.getProjects();
      } catch {
        return reply.status(400).send({
          ok: false,
          error: { code: 'JIRA_AUTH_FAILED', message: 'No se puede conectar con Jira. Verifica la URL, el email y el token.' },
        });
      }

      // FIX: onConflict debe ser string, no array en esta versión del cliente
      const { error } = await supabase
        .from('jira_connections')
        .upsert(
          { user_id: userId, base_url: baseUrl, email, api_token: apiToken },
          { onConflict: 'user_id' }
        );

      if (error) return reply.status(500).send({ ok: false, error: { code: 'DB_ERROR', message: error.message } });
      return reply.send({ ok: true });
    },
  );

  app.delete('/connection', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    await supabase.from('jira_connections').delete().eq('user_id', userId);
    return reply.send({ ok: true });
  });

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

  app.post<{
    Params: { issueKey: string };
    Body:   { worklogId: string; seconds: number; startedAt: string; description?: string };
  }>(
    '/worklogs/:issueKey/sync',
    { schema: { body: syncBodySchema } },
    async (req, reply) => {
      const userId   = (req.user as { sub: string }).sub;
      const { issueKey } = req.params;
      const { worklogId, seconds, startedAt, description } = req.body;

      try {
        const adapter = await adapterForUser(supabase, userId);
        const result  = await adapter.addWorklog(issueKey, seconds, startedAt, description);

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
