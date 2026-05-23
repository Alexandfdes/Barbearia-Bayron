export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../../../db/index.js';
import { appointments } from '../../../../../db/schema.js';
import { json } from '../../../../../lib/api.js';
import { getSession } from '../../../../../lib/session.js';

const bodySchema = z.object({
  notes: z.string().max(1000).nullable(),
});

export const PATCH: APIRoute = async ({ params, request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const apptRows = db
    .select({ id: appointments.id, barberId: appointments.barberId })
    .from(appointments)
    .where(eq(appointments.id, id))
    .all();

  if (apptRows.length === 0) return json({ error: 'Agendamento não encontrado' }, 404);

  if (session.role !== 'admin' && apptRows[0].barberId !== session.barberId) {
    return json({ error: 'Sem permissão' }, 403);
  }

  // String vazia vira null pra manter NULL coerente
  const normalizedNotes = (parsed.data.notes ?? '').trim() === '' ? null : parsed.data.notes!.trim();

  db.update(appointments)
    .set({
      notes:            normalizedNotes,
      lastModifiedById: session.barberId,
      lastModifiedAt:   new Date().toISOString(),
    })
    .where(eq(appointments.id, id))
    .run();

  return json({ ok: true, notes: normalizedNotes });
};
