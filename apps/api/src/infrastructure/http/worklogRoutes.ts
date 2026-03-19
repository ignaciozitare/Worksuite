// ─────────────────────────────────────────────────────────────────────────────
// HTTP — Worklog Routes
// POST   /worklogs
// DELETE /worklogs/:id
// GET    /worklogs?from=&to=&authorId=&projectKeys=
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { LogWorklog } from '../../application/worklog/LogWorklog.js';
import { DeleteWorklog } from '../../application/worklog/DeleteWorklog.js';
import type { IWorklogRepository } from '../../domain/worklog/IWorklogRepository.js';

const LogSchema = z.object({
  issueKey:     z.string().min(1),
  issueSummary: z.string().default(''),
  issueType:    z.string().default('Task'),
  epicKey:      z.string().default('—'),
  epicName:     z.string().default('—'),
  projectKey:   z.string().default('—'),
  date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startedAt:    z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  timeRaw:      z.string().min(1),
  description:  z.string().default(''),
});

interface WorklogPluginOptions extends FastifyPluginOptions {
  worklogRepo: IWorklogRepository;
}

export async function worklogRoutes(
  app: FastifyInstance,
  opts: WorklogPluginOptions,
): Promise<void> {
  const { worklogRepo } = opts;
  const auth = { preHandler: [app.authenticate] };

  // POST /worklogs — guardar worklog
  app.post('/', auth, async (request, reply) => {
    const user = request.user as { sub: string; name: string };
    const result = LogSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: result.error.message },
      });
    }

    try {
      const useCase = new LogWorklog(worklogRepo);
      const output = await useCase.execute({
        ...result.data,
        authorId:   user.sub,
        authorName: user.name,
      });
      return reply.status(201).send({ ok: true, data: output });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(422).send({
        ok: false,
        error: { code: 'DOMAIN_ERROR', message: msg },
      });
    }
  });

  // DELETE /worklogs/:id
  app.delete('/:id', auth, async (request, reply) => {
    const user = request.user as { sub: string; role: string };
    const { id } = request.params as { id: string };

    try {
      const useCase = new DeleteWorklog(worklogRepo);
      await useCase.execute({ worklogId: id, requesterId: user.sub, requesterRole: user.role });
      return reply.status(204).send();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const status = msg.includes('not found') ? 404 : msg.includes('permission') ? 403 : 422;
      return reply.status(status).send({
        ok: false,
        error: { code: 'DOMAIN_ERROR', message: msg },
      });
    }
  });

  // GET /worklogs?from=&to=&authorId=&projectKeys=
  app.get('/', auth, async (request, reply) => {
    const user = request.user as { sub: string; role: string };
    const q = request.query as Record<string, string>;

    const filters = {
      from:        q['from'] ?? new Date().toISOString().slice(0, 7) + '-01',
      to:          q['to']   ?? new Date().toISOString().slice(0, 10),
      authorId:    user.role === 'admin' ? (q['authorId'] ?? undefined) : user.sub,
      projectKeys: q['projectKeys'] ? q['projectKeys'].split(',') : undefined,
    };

    const worklogs = await worklogRepo.findByFilters(filters);
    return reply.send({ ok: true, data: worklogs.map(w => w.toSnapshot()) });
  });
}
