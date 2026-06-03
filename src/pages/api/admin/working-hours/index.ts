export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { sqlite, db } from '../../../../db/index.js';
import { barbers, workingHours } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';

// Validação de cada entrada de horário
const daySchema = z.object({
  weekday:   z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  endTime:   z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
}).refine(d => d.startTime < d.endTime, {
  message: 'Horário de início deve ser antes do fim',
});

const putSchema = z.object({
  barberId: z.number().int().positive(),
  hours:    z.array(daySchema).max(7),
});

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const barberIdParam = url.searchParams.get('barberId');
  if (!barberIdParam) return json({ error: 'barberId obrigatório' }, 400);

  const barberId = parseInt(barberIdParam, 10);
  if (isNaN(barberId)) return json({ error: 'barberId inválido' }, 400);

  // Barbeiro só pode ver os próprios horários
  if (session.role !== 'admin' && session.barberId !== barberId) {
    return json({ error: 'Acesso negado' }, 403);
  }

  const rows = db.select({
    id:        workingHours.id,
    weekday:   workingHours.weekday,
    startTime: workingHours.startTime,
    endTime:   workingHours.endTime,
  })
    .from(workingHours)
    .where(eq(workingHours.barberId, barberId))
    .orderBy(workingHours.weekday)
    .all();

  return json({ barberId, hours: rows });
};

export const PUT: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
  }

  const { barberId, hours } = parsed.data;

  // Barbeiro só pode editar os próprios horários
  if (session.role !== 'admin' && session.barberId !== barberId) {
    return json({ error: 'Acesso negado' }, 403);
  }

  // Verifica se o barbeiro existe
  const barberExists = db.select({ id: barbers.id })
    .from(barbers).where(eq(barbers.id, barberId)).all();
  if (barberExists.length === 0) {
    return json({ error: 'Barbeiro não encontrado' }, 404);
  }

  // Verifica weekdays únicos no payload
  const weekdays = hours.map(h => h.weekday);
  if (new Set(weekdays).size !== weekdays.length) {
    return json({ error: 'Dias duplicados no payload' }, 400);
  }

  // Replace atômico: deleta os antigos e insere os novos
  const replaceStmt = sqlite.transaction(() => {
    // Deleta todos os working_hours deste barbeiro
    db.delete(workingHours).where(eq(workingHours.barberId, barberId)).run();

    // Insere os novos (se houver — dias desabilitados simplesmente não são enviados)
    for (const h of hours) {
      db.insert(workingHours).values({
        barberId,
        weekday:   h.weekday,
        startTime: h.startTime,
        endTime:   h.endTime,
      }).run();
    }
  });

  replaceStmt();

  return json({ ok: true, barberId, saved: hours.length });
};
