// ─────────────────────────────────────────────────────────────────────────────
// WorkSuite API — Fastify server
// ─────────────────────────────────────────────────────────────────────────────

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { createClient } from '@supabase/supabase-js';

import { authRoutes }    from './infrastructure/http/authRoutes.js';
import { worklogRoutes } from './infrastructure/http/worklogRoutes.js';
import { hotdeskRoutes } from './infrastructure/http/hotdeskRoutes.js';
import { jiraRoutes }    from './infrastructure/http/jiraRoutes.js';
import { SupabaseWorklogRepo } from './infrastructure/supabase/SupabaseWorklogRepo.js';
import { SupabaseHotDeskRepo } from './infrastructure/supabase/SupabaseHotDeskRepo.js';

// ── Env validation ────────────────────────────────────────────────────────────
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  JWT_SECRET,
  PORT = '3001',
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !JWT_SECRET) {
  throw new Error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET');
}

// ── Infrastructure ────────────────────────────────────────────────────────────
const supabase    = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const worklogRepo = new SupabaseWorklogRepo(supabase);
const hotdeskRepo = new SupabaseHotDeskRepo(supabase);

// ── Fastify ───────────────────────────────────────────────────────────────────
const app = Fastify({ logger: { level: 'info' } });

await app.register(cors, {
  origin: process.env['ALLOWED_ORIGIN'] ?? 'http://localhost:5173',
  credentials: true,
});

await app.register(jwt, { secret: JWT_SECRET });

// ── Auth decorator ────────────────────────────────────────────────────────────
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

// ── Routes ────────────────────────────────────────────────────────────────────
await app.register(authRoutes,    { prefix: '/auth',     supabase });
await app.register(worklogRoutes, { prefix: '/worklogs', worklogRepo });
await app.register(hotdeskRoutes, { prefix: '/hotdesk',  hotdeskRepo });
await app.register(jiraRoutes,    { prefix: '/jira',     supabase });   // ← solo supabase, sin credenciales hardcodeadas

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

// ── Start ─────────────────────────────────────────────────────────────────────
try {
  await app.listen({ port: parseInt(PORT), host: '0.0.0.0' });
  console.log(`WorkSuite API running on port ${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
