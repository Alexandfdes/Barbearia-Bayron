export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq, isNull, or } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '../../../../db/index.js';
import { barbers, timeOff } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';

const TZ = 'America/Fortaleza';

const createSchema = z.object({
  barberId: z.number().int().positive().nullable().optional(),
  startsAt: z.string().refine(s => !isNaN(new Date(s).getTime()), 'Data inválida'),
  endsAt:   z.string().refine(s => !isNaN(new Date(s).getTime()), 'Data inválida'),
  reason:   z.string().max(200).optional(),
});

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const baseQuery = db
    .select({
      id:        timeOff.id,
      barberId:  timeOff.barberId,
      barberName: barbers.name,
      startsAt:  timeOff.startsAt,
      endsAt:    timeOff.endsAt,
      reason:    timeOff.reason,
      createdAt: timeOff.createdAt,
    })
    .from(timeOff)
    .leftJoin(barbers, eq(barbers.id, timeOff.barberId));

  const rows = session.role === 'admin'
    ? baseQuery.orderBy(timeOff.startsAt).all()
    : baseQuery
        .where(or(eq(timeOff.barberId, session.barberId), isNull(timeOff.barberId)))
        .orderBy(timeOff.startsAt)
        .all();

  const now = new Date();
  return json(rows.map(r => ({
    ...r,
    barberName:    r.barberName ?? 'Todos',
    dateLabel:     formatInTimeZone(new Date(r.startsAt), TZ, 'dd/MM'),
    startsAtLocal: formatInTimeZone(new Date(r.startsAt), TZ, 'HH:mm'),
    endsAtLocal:   formatInTimeZone(new Date(r.endsAt),   TZ, 'HH:mm'),
    isPast:        new Date(r.endsAt) < now,
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

  const { barberId: reqBarberId, startsAt, endsAt, reason } = parsed.data;

  const effectiveBarberId: number | null =
    session.role === 'admin' ? (reqBarberId ?? null) : session.barberId;

  if (new Date(startsAt) >= new Date(endsAt)) {
    return json({ error: 'Horário de início deve ser antes do fim' }, 400);
  }

  const result = db.insert(timeOff).values({
    barberId:  effectiveBarberId,
    startsAt:  new Date(startsAt).toISOString(),
    endsAt:    new Date(endsAt).toISOString(),
    reason:    reason ?? null,
    createdBy: session.barberId,
  }).run();

  return json({ ok: true, id: result.lastInsertRowid }, 201);
};

export const DELETE: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const idParam = url.searchParams.get('id');
  const id = parseInt(idParam ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  const rows = db
    .select({ id: timeOff.id, barberId: timeOff.barberId })
    .from(timeOff)
    .where(eq(timeOff.id, id))
    .all();

  if (rows.length === 0) return json({ error: 'Não encontrado' }, 404);

  if (session.role !== 'admin' && rows[0].barberId !== session.barberId) {
    return json({ error: 'Sem permissão' }, 403);
  }

  db.delete(timeOff).where(eq(timeOff.id, id)).run();
  return json({ ok: true });
};
