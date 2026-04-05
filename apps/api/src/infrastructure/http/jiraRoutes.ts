import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import type { IJiraConnectionRepository } from '../../domain/jira/IJiraConnectionRepository.js';
import type { IUserRepository } from '../../domain/user/IUserRepository.js';
import type { IWorklogRepository } from '../../domain/worklog/IWorklogRepository.js';
import { JiraCloudAdapter } from '../jira/JiraCloudAdapter.js';

interface JiraRoutesOptions extends FastifyPluginOptions {
  jiraConnectionRepo: IJiraConnectionRepository;
  userRepo:           IUserRepository;
  worklogRepo:        IWorklogRepository;
}

async function adapterForUser(repo: IJiraConnectionRepository, userId: string): Promise<JiraCloudAdapter> {
  const conn = await repo.findByUserId(userId);
  if (!conn) {
    throw Object.assign(new Error('Jira no configurado para este usuario'), { statusCode: 404 });
  }
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
  const { jiraConnectionRepo, userRepo, worklogRepo } = opts;

  app.addHook('preHandler', app.authenticate);

  // ── GET /jira/connection ──────────────────────────────────────────────────
  app.get('/connection', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    try {
      const summary = await jiraConnectionRepo.findSummaryByUserId(userId);
      return reply.send({ ok: true, data: summary ?? null });
    } catch (err: unknown) {
      return reply.status(500).send({ ok: false, error: { code: 'DB_ERROR', message: String(err) } });
    }
  });

  // ── POST /jira/connection ─────────────────────────────────────────────────
  app.post<{ Body: { baseUrl: string; email: string; apiToken: string } }>(
    '/connection',
    { schema: { body: saveConnectionSchema } },
    async (req, reply) => {
      const userId = (req.user as { sub: string }).sub;
      const { baseUrl, email, apiToken } = req.body;
      const normalizedUrl = baseUrl.trim().replace(/\/$/, '');

      try {
        if (apiToken.trim() === '__keep__') {
          await jiraConnectionRepo.updateUrlAndEmail(userId, normalizedUrl, email.trim());
        } else {
          await jiraConnectionRepo.upsert({
            user_id:   userId,
            base_url:  normalizedUrl,
            email:     email.trim(),
            api_token: apiToken.trim(),
          });
        }
        return reply.send({ ok: true });
      } catch (err: unknown) {
        return reply.status(500).send({ ok: false, error: { code: 'DB_ERROR', message: String(err) } });
      }
    },
  );

  // ── DELETE /jira/connection ───────────────────────────────────────────────
  app.delete('/connection', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    await jiraConnectionRepo.deleteByUserId(userId);
    return reply.send({ ok: true });
  });

  // ── GET /jira/projects ────────────────────────────────────────────────────
  app.get('/projects', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    try {
      const adapter = await adapterForUser(jiraConnectionRepo, userId);
      const projects = await adapter.getProjects();
      return reply.send({ ok: true, data: projects });
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode ?? 502;
      return reply.status(status).send({ ok: false, error: { code: 'JIRA_ERROR', message: String(err) } });
    }
  });

  // ── GET /jira/issues?project=X&extraFields=...&userFilter=email ──
  app.get<{ Querystring: { project: string; extraFields?: string; userFilter?: string } }>(
    '/issues',
    async (req, reply) => {
      const userId = (req.user as { sub: string }).sub;
      const extraFields = req.query.extraFields?.split(',').filter(Boolean);
      const userFilter = req.query.userFilter || undefined;
      try {
        const adapter = await adapterForUser(jiraConnectionRepo, userId);
        const issues = await adapter.getIssues(req.query.project, extraFields, userFilter);
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
        const userProfile = await userRepo.findById(user.sub);

        let adapter: JiraCloudAdapter;
        let commentPrefix = '';

        if (userProfile?.jira_api_token) {
          const adminConn = await jiraConnectionRepo.findAny();
          if (!adminConn) {
            throw Object.assign(new Error('Jira no configurado — el admin debe configurar la conexión en Settings'), { statusCode: 404 });
          }
          const userEmail = userProfile.email ?? user.email;
          adapter = new JiraCloudAdapter(adminConn.base_url, userEmail, userProfile.jira_api_token);
          app.log.info({ userId: user.sub, userEmail }, 'Jira sync con token personal del usuario');
        } else {
          adapter = await adapterForUser(jiraConnectionRepo, user.sub);
          const userEmail = userProfile?.email ?? user.email;
          commentPrefix = `[Imputado por: ${userEmail}] `;
          app.log.info({ userId: user.sub, userEmail: userProfile?.email }, 'Jira sync con token admin (fallback)');
        }

        const finalComment = commentPrefix + (description ?? '');

        const result = await adapter.addWorklog(
          issueKey,
          seconds,
          startedAt,
          finalComment || undefined,
        );

        // Marcar worklog como sincronizado en la base de datos
        try {
          await worklogRepo.markSyncedToJira(worklogId, result.id);
        } catch (dbErr) {
          app.log.warn({ dbErr, worklogId }, 'Jira sync OK pero fallo update en DB');
        }

        return reply.send({ ok: true, data: result });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode ?? 502;
        return reply.status(status).send({ ok: false, error: { code: 'JIRA_SYNC_ERROR', message: String(err) } });
      }
    },
  );

  // ── GET /jira/issuetypes ──────────────────────────────────────────────────
  app.get('/issuetypes', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    try {
      const adapter = await adapterForUser(jiraConnectionRepo, userId);
      const issueTypes = await adapter.getIssueTypes();
      return reply.send({ ok: true, issueTypes });
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode ?? 502;
      return reply.status(status).send({ ok: false, error: String(err) });
    }
  });

  // ── GET /jira/fields ──────────────────────────────────────────────────────
  app.get('/fields', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    try {
      const adapter = await adapterForUser(jiraConnectionRepo, userId);
      const fields = await adapter.getFields();
      return reply.send({ ok: true, fields });
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode ?? 502;
      return reply.status(status).send({ ok: false, error: String(err) });
    }
  });

  // ── GET /jira/statuses ────────────────────────────────────────────────────
  app.get('/statuses', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    try {
      const adapter = await adapterForUser(jiraConnectionRepo, userId);
      const statuses = await adapter.getStatuses();
      return reply.send({ ok: true, statuses });
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode ?? 502;
      return reply.status(status).send({ ok: false, error: String(err) });
    }
  });

  // ── GET /jira/search?jql=...&maxResults=...&fields=... ────────────────────
  app.get<{ Querystring: { jql: string; maxResults?: string; fields?: string } }>(
    '/search',
    async (req, reply) => {
      const { jql, maxResults = '50', fields } = req.query;
      if (!jql) return reply.status(400).send({ ok: false, error: 'jql required' });
      const userId = (req.user as { sub: string }).sub;
      try {
        const adapter = await adapterForUser(jiraConnectionRepo, userId);
        const data = await adapter.searchIssues(jql, parseInt(maxResults), fields);
        return reply.send({ ok: true, ...data });
      } catch (err: unknown) {
        app.log.error({ err, jql, fields }, 'jira/search error');
        const status = (err as { statusCode?: number }).statusCode ?? 502;
        return reply.status(status).send({ ok: false, error: String(err) });
      }
    }
  );

  // ── GET /jira/subtasks?parents=AND-7,AND-8 ────────────────────────────────
  app.get<{ Querystring: { parents: string } }>(
    '/subtasks',
    async (req, reply) => {
      const { parents } = req.query;
      if (!parents) return reply.status(400).send({ ok: false, error: 'parents required' });
      const userId = (req.user as { sub: string }).sub;
      const parentKeys = parents.split(',').map(k => k.trim()).filter(Boolean);
      try {
        const adapter = await adapterForUser(jiraConnectionRepo, userId);
        const subtasks = await adapter.getSubtasks(parentKeys);
        return reply.send({ ok: true, subtasks });
      } catch (err: unknown) {
        app.log.error({ err, parents }, 'jira/subtasks error');
        const status = (err as { statusCode?: number }).statusCode ?? 502;
        return reply.status(status).send({ ok: false, error: String(err) });
      }
    }
  );
}
