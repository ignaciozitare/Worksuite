// @ts-nocheck
// Deploy Planner API Routes — scaffold
// Uses the same @worksuite/jira-client as jira-tracker/routes.ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveJiraClient } from '../shared/jiraConnection.js';

interface DeployPlannerRoutesOptions extends FastifyPluginOptions {
  supabase: SupabaseClient;
}

export async function deployPlannerRoutes(
  app: FastifyInstance,
  opts: DeployPlannerRoutesOptions,
): Promise<void> {
  const { supabase } = opts;

  app.addHook('preHandler', app.authenticate);

  // GET /deploy-planner/deployments
  app.get('/deployments', async (req, reply) => {
    // TODO: fetch from deployments table
    return reply.send({ ok: true, data: [] });
  });

  // POST /deploy-planner/deployments
  app.post('/deployments', async (req, reply) => {
    // TODO: insert deployment
    return reply.send({ ok: true, data: { id: crypto.randomUUID() } });
  });

  // POST /deploy-planner/deployments/:id/link-issues
  // Uses the SAME Jira client as jira-tracker — no extra config needed
  app.post<{ Params: { id: string }; Body: { issueKeys: string[] } }>(
    '/deployments/:id/link-issues',
    async (req, reply) => {
      const userId = (req.user as { sub: string }).sub;
      const { issueKeys } = req.body;

      try {
        const { client } = await resolveJiraClient(userId, supabase);
        // Validate all issues exist in Jira
        const issues = await Promise.all(
          issueKeys.map(key => client.getIssue(key).catch(() => null))
        );
        const valid = issues.filter(Boolean).map(i => i!.key);

        // TODO: update deployment.jiraIssues in DB
        return reply.send({ ok: true, data: { linked: valid } });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode ?? 502;
        return reply.status(status).send({ ok: false, error: String(err) });
      }
    }
  );
}
