export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, gte, lt } from 'drizzle-orm';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { db } from '../../../../db/index.js';
import { appointments, barbers, services } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { bookAppointment } from '../../../../lib/bookAppointment.js';

const TZ = 'America/Fortaleza';

const createSchema = z.object({
  barberId:      z.number().int().positive(),
  serviceId:     z.number().int().positive(),
  customerName:  z.string().min(2).max(100),
  customerPhone: z.string().min(8).max(20),
  startsAt:      z.string().refine(s => !isNaN(new Date(s).getTime()), 'Data/hora inválida'),
});

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const date         = url.searchParams.get('date');
  const barberIdParam = url.searchParams.get('barberId');

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: 'Parâmetro date obrigatório (YYYY-MM-DD)' }, 400);
  }

  let filterBarberId: number | null = null;
  if (session.role === 'admin') {
    if (barberIdParam) {
      const n = parseInt(barberIdParam, 10);
      if (!isNaN(n)) filterBarberId = n;
    }
  } else {
    filterBarberId = session.barberId;
  }

  const dayStart = fromZonedTime(`${date}T00:00:00`, TZ).toISOString();
  const dayEnd   = fromZonedTime(`${date}T23:59:59`, TZ).toISOString();

  const rows = db
    .select({
      id:              appointments.id,
      status:          appointments.status,
      startsAt:        appointments.startsAt,
      endsAt:          appointments.endsAt,
      durationMinutes: appointments.durationMinutes,
      priceCents:      appointments.priceCents,
      customerName:    appointments.customerName,
      customerPhone:   appointments.customerPhone,
      notes:           appointments.notes,
      barberId:        appointments.barberId,
      barberName:      barbers.name,
      serviceName:     services.name,
    })
    .from(appointments)
    .innerJoin(barbers,  eq(barbers.id,  appointments.barberId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(
      filterBarberId !== null
        ? and(gte(appointments.startsAt, dayStart), lt(appointments.startsAt, dayEnd), eq(appointments.barberId, filterBarberId))
        : and(gte(appointments.startsAt, dayStart), lt(appointments.startsAt, dayEnd))
    )
    .orderBy(appointments.startsAt)
    .all();

  return json(rows.map(r => ({
    ...r,
    timeLocal: formatInTimeZone(new Date(r.startsAt), TZ, 'HH:mm'),
    price:     `R$ ${(r.priceCents / 100).toFixed(0)}`,
  })));
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const { barberId, serviceId, customerName, customerPhone, startsAt: startsAtStr } = parsed.data;

  if (session.role !== 'admin' && barberId !== session.barberId) {
    return json({ error: 'Sem permissão para este barbeiro' }, 403);
  }

  const startsAt = new Date(startsAtStr);

  try {
    const result = bookAppointment({ barberId, serviceId, customerName, customerPhone, startsAt, createdBy: 'barber' });
    if (!result.ok) return json({ error: result.error }, result.httpStatus);
    return json(result, 201);
  } catch (err) {
    console.error('[api/admin/appointments POST]', err);
    return json({ error: 'Erro interno' }, 500);
  }
};
