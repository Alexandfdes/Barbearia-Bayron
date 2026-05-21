export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { barberServices } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';

const updateSchema = z.object({
  active:          z.boolean(),
  durationMinutes: z.number().int().positive().max(480),
  barberId:        z.number().int().positive().optional(),
});

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const serviceId = parseInt(params.serviceId ?? '', 10);
  if (isNaN(serviceId)) return json({ error: 'serviceId inválido' }, 400);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const { active, durationMinutes, barberId: reqBarberId } = parsed.data;

  // Barber can only update own settings; admin can target any barber
  const targetBarberId = session.role === 'admin' && reqBarberId
    ? reqBarberId
    : session.barberId;

  if (session.role !== 'admin' && reqBarberId && reqBarberId !== session.barberId) {
    return json({ error: 'Sem permissão' }, 403);
  }

  db.insert(barberServices)
    .values({ barberId: targetBarberId, serviceId, durationMinutes, active })
    .onConflictDoUpdate({
      target: [barberServices.barberId, barberServices.serviceId],
      set:    { durationMinutes, active },
    })
    .run();

  return json({ ok: true });
};
