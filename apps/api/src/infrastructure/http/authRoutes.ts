// ─────────────────────────────────────────────────────────────────────────────
// HTTP — Auth Routes
// POST /auth/login
// POST /auth/logout
// GET  /auth/me
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

interface AuthPluginOptions extends FastifyPluginOptions {
  supabase: SupabaseClient;
}

export async function authRoutes(
  app: FastifyInstance,
  opts: AuthPluginOptions,
): Promise<void> {
  const { supabase } = opts;

  // POST /auth/login
  app.post('/login', async (request, reply) => {
    const result = LoginSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: result.error.message },
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: result.data.email,
      password: result.data.password,
    });

    if (error || !data.user) {
      return reply.status(401).send({
        ok: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    // Fetch user profile
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (!profile?.active) {
      return reply.status(403).send({
        ok: false,
        error: { code: 'ACCOUNT_DISABLED', message: 'Account is disabled' },
      });
    }

    // Sign our own JWT with user info embedded
    const token = app.jwt.sign(
      {
        sub: data.user.id,
        email: data.user.email,
        role: profile.role,
        name: profile.name,
        avatar: profile.avatar,
      },
      { expiresIn: '7d' },
    );

    return reply.send({
      ok: true,
      data: { token, user: profile },
    });
  });

  // GET /auth/me — returns current user from JWT
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const payload = request.user as { sub: string };

    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', payload.sub)
      .single();

    if (error || !profile) {
      return reply.status(404).send({
        ok: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    return reply.send({ ok: true, data: profile });
  });
}
