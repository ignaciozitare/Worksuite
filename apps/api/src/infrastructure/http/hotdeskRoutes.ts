// ─────────────────────────────────────────────────────────────────────────────
// HTTP — HotDesk Routes
// GET  /hotdesk/map?date=YYYY-MM-DD
// POST /hotdesk/reservations
// DELETE /hotdesk/reservations/:seatId/:date
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { MakeReservation } from '../../application/hotdesk/MakeReservation.js';
import { ReleaseReservation } from '../../application/hotdesk/ReleaseReservation.js';
import type { IHotDeskRepository } from '../../domain/hotdesk/IHotDeskRepository.js';

const ReserveSchema = z.object({
  seatId: z.string().min(1),
  dates:  z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
});

interface HotDeskPluginOptions extends FastifyPluginOptions {
  hotdeskRepo: IHotDeskRepository;
}

export async function hotdeskRoutes(
  app: FastifyInstance,
  opts: HotDeskPluginOptions,
): Promise<void> {
  const { hotdeskRepo } = opts;
  const auth = { preHandler: [app.authenticate] };

  // GET /hotdesk/map?date=
  app.get('/map', auth, async (request, reply) => {
    const q = request.query as Record<string, string>;
    const date = q['date'] ?? new Date().toISOString().slice(0, 10);

    const [seats, reservations, fixedAssignments] = await Promise.all([
      hotdeskRepo.getSeats(),
      hotdeskRepo.getReservations(date, date),
      hotdeskRepo.getFixedAssignments(),
    ]);

    return reply.send({ ok: true, data: { seats, reservations, fixedAssignments, date } });
  });

  // GET /hotdesk/table?year=&month= (1-indexed)
  app.get('/table', auth, async (request, reply) => {
    const q = request.query as Record<string, string>;
    const year  = parseInt(q['year']  ?? String(new Date().getFullYear()));
    const month = parseInt(q['month'] ?? String(new Date().getMonth() + 1));
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const to   = new Date(year, month, 0).toISOString().slice(0, 10);

    const [seats, reservations, fixedAssignments] = await Promise.all([
      hotdeskRepo.getSeats(),
      hotdeskRepo.getReservations(from, to),
      hotdeskRepo.getFixedAssignments(),
    ]);

    return reply.send({ ok: true, data: { seats, reservations, fixedAssignments, from, to } });
  });

  // POST /hotdesk/reservations
  app.post('/reservations', auth, async (request, reply) => {
    const user = request.user as { sub: string; name: string };
    const result = ReserveSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: result.error.message },
      });
    }

    const useCase = new MakeReservation(hotdeskRepo);
    const output = await useCase.execute({
      seatId: result.data.seatId,
      dates: result.data.dates,
      userId: user.sub,
      userName: user.name,
    });

    return reply.status(201).send({ ok: true, data: output });
  });

  // DELETE /hotdesk/reservations/:seatId/:date
  app.delete('/reservations/:seatId/:date', auth, async (request, reply) => {
    const user = request.user as { sub: string; role: string };
    const { seatId, date } = request.params as { seatId: string; date: string };

    try {
      const useCase = new ReleaseReservation(hotdeskRepo);
      await useCase.execute({ seatId, date, requesterId: user.sub, requesterRole: user.role });
      return reply.status(204).send();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const status = msg.includes('not found') ? 404 : msg.includes('own') ? 403 : 422;
      return reply.status(status).send({
        ok: false,
        error: { code: 'DOMAIN_ERROR', message: msg },
      });
    }
  });
}
