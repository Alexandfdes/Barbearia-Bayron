export const prerender = false;

import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../../../db/index.js';
import { appointments } from '../../../../../db/schema.js';
import { json } from '../../../../../lib/api.js';
import { getSession } from '../../../../../lib/session.js';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  const rows = db
    .select({ id: appointments.id, status: appointments.status, barberId: appointments.barberId })
    .from(appointments)
    .where(eq(appointments.id, id))
    .all();

  if (rows.length === 0) return json({ error: 'Não encontrado' }, 404);

  const appt = rows[0];
  if (session.role !== 'admin' && appt.barberId !== session.barberId) {
    return json({ error: 'Sem permissão' }, 403);
  }
  if (appt.status !== 'confirmed') {
    return json({ error: `Não pode marcar no-show (status: ${appt.status})` }, 409);
  }

  db.update(appointments)
    .set({ status: 'no_show' })
    .where(eq(appointments.id, id))
    .run();

  return json({ ok: true });
};
