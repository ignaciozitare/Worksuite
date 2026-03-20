// ─────────────────────────────────────────────────────────────────────────────
// WorkSuite API — Fastify app factory
// ─────────────────────────────────────────────────────────────────────────────

import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
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

// ── Augment Fastify types ────────────────────────────────────────────────────
declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  if (_app) return _app;

  const app = Fastify({ logger: { level: 'info' } });

  // ── CORS ──────────────────────────────────────────────────────────────────
  await app.register(cors, {
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    origin: (origin, cb) => {
      const allowed =
        !origin ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
        /^https:\/\/worksuite(-[a-z0-9]+)*(-ignaciozitare-9429s-projects)?\.vercel\.app$/.test(origin) ||
        origin === ALLOWED_ORIGIN;
      cb(allowed ? null : new Error(`CORS: origin not allowed — ${origin}`), allowed);
    },
  });

  await app.register(jwt, { secret: JWT_SECRET });

  // ── authenticate: decodifica el Supabase access_token del frontend ────────
  // El frontend usa supabase.auth.signInWithPassword() directamente y envía
  // el access_token de Supabase. Lo decodificamos (base64) para extraer el sub
  // y verificamos que no esté expirado — luego buscamos el perfil en Supabase.
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' } });
      return;
    }

    const token = authHeader.slice(7);
    const parts = token.split('.');

    if (parts.length !== 3) {
      reply.status(401).send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' } });
      return;
    }

    let payload: { sub?: string; email?: string; exp?: number };
    try {
      // Decode JWT payload (middle part) — base64url
      const raw = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
      payload = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sub?: string; email?: string; exp?: number };
    } catch {
      reply.status(401).send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' } });
      return;
    }

    // Verificar expiración
    if (!payload.sub || (payload.exp !== undefined && payload.exp * 1000 < Date.now())) {
      reply.status(401).send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Token expired or invalid' } });
      return;
    }

    // Obtener perfil (rol y nombre) con service_role — bypasea RLS
    const { data: profile } = await supabase
      .from('users')
      .select('role, name')
      .eq('id', payload.sub)
      .single();

    (request as any).user = {
      sub:   payload.sub,
      email: payload.email ?? '',
      role:  profile?.role  ?? 'user',
      name:  profile?.name  ?? '',
    };
  });

  await app.register(authRoutes,    { prefix: '/auth',     supabase });
  await app.register(worklogRoutes, { prefix: '/worklogs', worklogRepo });
  await app.register(hotdeskRoutes, { prefix: '/hotdesk',  hotdeskRepo });
  await app.register(jiraRoutes,    { prefix: '/jira',     supabase });

  app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

  _app = app;
  return app;
}
