import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { IAuthService } from '../../domain/auth/IAuthService.js';
import type { IUserRepository } from '../../domain/user/IUserRepository.js';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

interface AuthPluginOptions extends FastifyPluginOptions {
  authService: IAuthService;
  userRepo:    IUserRepository;
}

export async function authRoutes(app: FastifyInstance, opts: AuthPluginOptions): Promise<void> {
  const { authService, userRepo } = opts;

  app.post('/login', async (request, reply) => {
    const result = LoginSchema.safeParse(request.body);
    if (!result.success) return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: result.error.message } });

    let authResult;
    try {
      authResult = await authService.signIn({ email: result.data.email, password: result.data.password });
    } catch {
      return reply.status(401).send({ ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }

    const profile = await userRepo.findById(authResult.userId);
    if (!profile?.active) return reply.status(403).send({ ok: false, error: { code: 'ACCOUNT_DISABLED', message: 'Account is disabled' } });

    const token = app.jwt.sign(
      { sub: authResult.userId, email: authResult.email, role: profile.role, name: profile.name, avatar: profile.avatar },
      { expiresIn: '7d' },
    );
    return reply.send({ ok: true, data: { token, user: profile } });
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const payload = request.user as { sub: string };
    const profile = await userRepo.findById(payload.sub);
    if (!profile) return reply.status(404).send({ ok: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    return reply.send({ ok: true, data: profile });
  });
}
