// ─────────────────────────────────────────────────────────────────────────────
// WorkSuite API — Fastify app factory
// Separado de server.ts para poder importarlo desde el handler de Vercel
// ─────────────────────────────────────────────────────────────────────────────

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { createClient } from '@supabase/supabase-js';

import { authRoutes }    from './infrastructure/http/authRoutes.js';
import { worklogRoutes } from './infrastructure/http/worklogRoutes.js';
import { hotdeskRoutes } from './infrastructure/http/hotdeskRoutes.js';
import { jiraRoutes }    from './infrastructure/http/jiraRoutes.js';
import { SupabaseWorklogRepo } from './infrastructure/supabase/SupabaseWorklogRepo.js';
import { SupabaseHotDeskRepo } from './infrastructure/supabase/SupabaseHotDeskRepo.js';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  JWT_SECRET,
  ALLOWED_ORIGIN = 'http://localhost:5173',
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !JWT_SECRET) {
  throw new Error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET');
}

const supabase    = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const worklogRepo = new SupabaseWorklogRepo(supabase);
const hotdeskRepo = new SupabaseHotDeskRepo(supabase);

let _app: FastifyInstance | null = null;

export async function buildApp(): Promise<FastifyInstance> {
  if (_app) return _app;

  const app = Fastify({ logger: { level: 'info' } });

  await app.register(cors, {
    origin: ALLOWED_ORIGIN,
    credentials: true,
  });

  await app.register(jwt, { secret: JWT_SECRET });

  app.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' },
      });
    }
  });

  await app.register(authRoutes,    { prefix: '/auth',     supabase });
  await app.register(worklogRoutes, { prefix: '/worklogs', worklogRepo });
  await app.register(hotdeskRoutes, { prefix: '/hotdesk',  hotdeskRepo });
  await app.register(jiraRoutes,    { prefix: '/jira',     supabase });

  app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

  _app = app;
  return app;
}
