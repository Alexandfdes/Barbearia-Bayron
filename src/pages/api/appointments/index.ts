export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { addMinutes } from 'date-fns';
import { json } from '../../../lib/api.js';
import { bookAppointment } from '../../../lib/bookAppointment.js';

// Idade mínima 5 anos, máxima 100 anos — só sanidade
const MIN_BIRTH_AGE_YEARS = 5;
const MAX_BIRTH_AGE_YEARS = 100;

const bodySchema = z.object({
  barberId:          z.number().int().positive(),
  serviceId:         z.number().int().positive(),
  customerName:      z.string().min(2).max(100),
  customerPhone:     z.string().min(8).max(20),
  customerBirthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento inválida'),
  startsAt:          z.string().refine(s => !isNaN(new Date(s).getTime()), 'Data/hora inválida'),
  idempotencyKey:    z.string().min(8).max(64).optional(),
});

function isPlausibleBirthdate(iso: string): boolean {
  const d = new Date(iso + 'T12:00:00Z');
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const minDate = new Date(now.getFullYear() - MAX_BIRTH_AGE_YEARS, now.getMonth(), now.getDate());
  const maxDate = new Date(now.getFullYear() - MIN_BIRTH_AGE_YEARS, now.getMonth(), now.getDate());
  return d >= minDate && d <= maxDate;
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
  }

  const { barberId, serviceId, customerName, customerPhone, customerBirthdate, startsAt: startsAtStr, idempotencyKey } = parsed.data;

  if (!isPlausibleBirthdate(customerBirthdate)) {
    return json({ error: 'Data de nascimento inválida' }, 400);
  }

  const startsAt = new Date(startsAtStr);

  if (startsAt < new Date()) {
    return json({ error: 'Horário no passado' }, 400);
  }

  const maxDate = addMinutes(new Date(), 30 * 24 * 60);
  if (startsAt > maxDate) {
    return json({ error: 'Horário além do limite de 30 dias' }, 400);
  }

  try {
    const result = bookAppointment({
      barberId,
      serviceId,
      customerName,
      customerPhone,
      customerBirthdate,
      startsAt,
      createdBy: 'customer',
      idempotencyKey: idempotencyKey ?? null,
    });
    if (!result.ok) return json({ error: result.error }, result.httpStatus);
    return json(result, 201);
  } catch (err) {
    console.error('[api/appointments POST]', err);
    return json({ error: 'Erro interno ao criar agendamento' }, 500);
  }
};
