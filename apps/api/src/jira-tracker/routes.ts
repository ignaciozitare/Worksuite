import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JiraClient, type JiraClientConfig } from '@worksuite/jira-client';

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
async function adapterForUser(supabase: SupabaseClient, userId: string): Promise<JiraClient> {
  const { data, error } = await supabase
    .from('jira_connections')
    .select('base_url, email, api_token')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    throw Object.assign(new Error('Jira no configurado para este usuario'), { statusCode: 404 });
  }

  const conn = data as JiraConnection;
  return new JiraClient(conn.base_url, conn.email, conn.api_token);
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

  // ── GET /jira/search?jql=...&maxResults=... ────────────────────────────────
  // Usado por Deploy Planner para traer tickets por JQL
  app.get<{ Querystring: { jql: string; maxResults?: string } }>(
    '/search',
    async (req, reply) => {
      const { jql, maxResults = '100' } = req.query;
      if (!jql) return reply.status(400).send({ ok: false, error: 'jql required' });

      try {
        // Use the admin connection (shared across the org)
        const conn = await getAdminConnection(supabase);
        if (!conn) return reply.status(404).send({ ok: false, error: 'Jira no configurado. Ve a Admin → SSO y conecta Jira.' });

        const auth = Buffer.from(`${conn.email}:${conn.api_token}`).toString('base64');
        const base = conn.base_url.replace(/\/$/, '');
        const url  = `${base}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=summary,assignee,priority,issuetype,labels,customfield_10014,status,components`;

        const res = await fetch(url, {
          headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
        });

        if (!res.ok) {
          const body = await res.text();
          app.log.error({ status: res.status, body }, 'Jira search error');
          return reply.status(res.status).send({ ok: false, error: `Jira ${res.status}: ${body.slice(0, 200)}` });
        }

        const data = await res.json();
        return reply.send({ ok: true, ...data });
      } catch (err: unknown) {
        app.log.error(err, 'jira/search error');
        return reply.status(502).send({ ok: false, error: String(err) });
      }
    }
  );

  // ── GET /jira/statuses ─────────────────────────────────────────────────────
  // Devuelve todos los estados de la instancia Jira (para Admin → Deploy Config)
  app.get('/statuses', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const conn = await getAdminConnection(supabase);
      if (!conn) return reply.status(404).send({ ok: false, error: 'Jira no configurado.' });

      const auth = Buffer.from(`${conn.email}:${conn.api_token}`).toString('base64');
      const base = conn.base_url.replace(/\/$/, '');

      const res = await fetch(`${base}/rest/api/3/status`, {
        headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
      });

      if (!res.ok) return reply.status(res.status).send({ ok: false, error: `Jira ${res.status}` });

      const data = await res.json() as Array<{ id: string; name: string; statusCategory: { name: string } }>;
      return reply.send({
        ok: true,
        statuses: data.map(s => ({ id: s.id, name: s.name, category: s.statusCategory?.name }))
      });
    } catch (err: unknown) {
      return reply.status(502).send({ ok: false, error: String(err) });
    }
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
  // Calls Jira API directly to include 'components' field (needed by Deploy Planner)
  app.get<{ Querystring: { project: string } }>(
    '/issues',
    { schema: { querystring: { type: 'object', required: ['project'], properties: { project: { type: 'string' } } } } },
    async (req, reply) => {
      try {
        const conn = await getAdminConnection(supabase);
        if (!conn) return reply.status(404).send({ ok: false, error: 'Jira no configurado' });

        const auth   = Buffer.from(`${conn.email}:${conn.api_token}`).toString('base64');
        const base   = conn.base_url.replace(/\/$/, '');
        const fields = 'summary,assignee,priority,issuetype,labels,customfield_10014,status,components,parent';
        const jql    = encodeURIComponent(`project="${req.query.project}" ORDER BY updated DESC`);
        const url    = `${base}/rest/api/3/search?jql=${jql}&maxResults=200&fields=${fields}`;

        const res  = await fetch(url, { headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' } });
        if (!res.ok) {
          const body = await res.text();
          return reply.status(res.status).send({ ok: false, error: `Jira ${res.status}: ${body.slice(0, 200)}` });
        }

        const data = await res.json() as { issues?: Array<Record<string, unknown>> };
        // Normalise to flat format expected by frontend
        const issues = (data.issues || []).map((i: Record<string, unknown>) => {
          const f = (i.fields || {}) as Record<string, unknown>;
          return {
            id:        i.key,
            key:       i.key,
            summary:   (f.summary as string) || '',
            status:    ((f.status as Record<string, unknown>)?.name as string) || '',
            assignee:  ((f.assignee as Record<string, unknown>)?.displayName as string) || '—',
            priority:  ((f.priority as Record<string, unknown>)?.name as string) || 'Medium',
            type:      ((f.issuetype as Record<string, unknown>)?.name as string) || 'Task',
            components: ((f.components as Array<Record<string, unknown>>) || []).map(c => c.name as string).filter(Boolean),
            labels:    (f.labels as string[]) || [],
            customfield_10014: (f.customfield_10014 as string) || '',
            // keep raw fields for any other consumer
            fields: f,
          };
        });

        return reply.send({ ok: true, data: issues });
      } catch (err: unknown) {
        app.log.error(err, 'jira/issues error');
        return reply.status(502).send({ ok: false, error: String(err) });
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

        let adapter: JiraClient;
        let commentPrefix = '';

        if (userRow?.jira_api_token) {
          // ── Opción B: token personal del usuario ─────────────────────────
          // Obtener base_url de la conexión admin (el usuario no tiene su propia conexión)
          const adminConn = await getAdminConnection(supabase);
          if (!adminConn) {
            throw Object.assign(new Error('Jira no configurado — el admin debe configurar la conexión en Settings'), { statusCode: 404 });
          }
          const userEmail = userRow.email ?? user.email;
          adapter = new JiraClient(adminConn.base_url, userEmail, userRow.jira_api_token);
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

  // ─── POST /jira/issue/:key/transition ─────────────────────────────────────
  // Usado por Deploy Planner para sincronizar el estado de tickets con Jira.
  app.post<{ Params: { key: string }; Body: { targetStatus: string } }>(
    '/issue/:key/transition',
    async (req, reply) => {
      const userId = (req.user as { sub: string }).sub;
      const { key } = req.params;
      const { targetStatus } = req.body;

      if (!key || !targetStatus) {
        return reply.status(400).send({ ok: false, error: 'key and targetStatus required' });
      }

      try {
        const { client } = await resolveJiraClient(userId, supabase);

        // 1. Obtener transiciones disponibles para el issue
        const transRes = await (client as unknown as { request: (method: string, path: string) => Promise<unknown> });
        // Llamada directa a Jira con fetch usando las credenciales del cliente
        const baseUrl = (client as unknown as { base: string }).base;
        const auth    = (client as unknown as { auth: string }).auth;

        const listRes = await fetch(`${baseUrl}/rest/api/3/issue/${key}/transitions`, {
          headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
        });

        if (!listRes.ok) {
          return reply.status(listRes.status).send({ ok: false, error: `Jira error listing transitions: ${listRes.status}` });
        }

        const { transitions } = await listRes.json() as { transitions: Array<{ id: string; name: string; to: { name: string } }> };

        // 2. Buscar la transición que coincida con targetStatus (case-insensitive, coincidencia parcial)
        const match =
          transitions.find(t => t.name.toLowerCase() === targetStatus.toLowerCase()) ||
          transitions.find(t => t.to?.name?.toLowerCase() === targetStatus.toLowerCase()) ||
          transitions.find(t => t.name.toLowerCase().includes(targetStatus.toLowerCase()));

        if (!match) {
          return reply.status(422).send({
            ok: false,
            error: `Transición "${targetStatus}" no encontrada. Disponibles: ${transitions.map(t => t.name).join(', ')}`,
          });
        }

        // 3. Aplicar la transición
        const applyRes = await fetch(`${baseUrl}/rest/api/3/issue/${key}/transitions`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ transition: { id: match.id } }),
        });

        if (!applyRes.ok && applyRes.status !== 204) {
          return reply.status(applyRes.status).send({ ok: false, error: `Jira transition error: ${applyRes.status}` });
        }

        return reply.send({ ok: true, appliedTransition: match.name, issueKey: key });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode ?? 502;
        return reply.status(status).send({ ok: false, error: String(err) });
      }
    },
  );
}
