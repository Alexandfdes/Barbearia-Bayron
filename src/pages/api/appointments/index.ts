export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { addMinutes } from 'date-fns';
import { json } from '../../../lib/api.js';
import { bookAppointment } from '../../../lib/bookAppointment.js';

const bodySchema = z.object({
  barberId:      z.number().int().positive(),
  serviceId:     z.number().int().positive(),
  customerName:  z.string().min(2).max(100),
  customerPhone: z.string().min(8).max(20),
  startsAt:      z.string().refine(s => !isNaN(new Date(s).getTime()), 'Data/hora inválida'),
});

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
  }

  const { barberId, serviceId, customerName, customerPhone, startsAt: startsAtStr } = parsed.data;
  const startsAt = new Date(startsAtStr);

  if (startsAt < new Date()) {
    return json({ error: 'Horário no passado' }, 400);
  }

  const maxDate = addMinutes(new Date(), 30 * 24 * 60);
  if (startsAt > maxDate) {
    return json({ error: 'Horário além do limite de 30 dias' }, 400);
  }

  try {
    const result = bookAppointment({ barberId, serviceId, customerName, customerPhone, startsAt, createdBy: 'customer' });
    if (!result.ok) return json({ error: result.error }, result.httpStatus);
    return json(result, 201);
  } catch (err) {
    console.error('[api/appointments POST]', err);
    return json({ error: 'Erro interno ao criar agendamento' }, 500);
  }
};
