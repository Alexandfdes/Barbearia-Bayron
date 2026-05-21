export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../../../db/index.js';
import { appointments } from '../../../../../db/schema.js';
import { json } from '../../../../../lib/api.js';

export const POST: APIRoute = ({ params }) => {
  const { token } = params;
  if (!token) return json({ error: 'Token inválido' }, 400);

  try {
    // Busca o agendamento pelo token
    const apptRows = db
      .select({ id: appointments.id, status: appointments.status })
      .from(appointments)
      .where(eq(appointments.manageToken, token))
      .all();

    if (apptRows.length === 0) {
      return json({ error: 'Agendamento não encontrado' }, 404);
    }

    const appt = apptRows[0];

    if (appt.status !== 'confirmed') {
      return json({ error: `Agendamento não pode ser cancelado (status: ${appt.status})` }, 409);
    }

    db.update(appointments)
      .set({
        status:      'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: 'customer',
      })
      .where(
        and(
          eq(appointments.manageToken, token),
          eq(appointments.status, 'confirmed')
        )
      )
      .run();

    return json({ ok: true, message: 'Agendamento cancelado' });
  } catch (err) {
    console.error('[api/appointments/by-token/cancel POST]', err);
    return json({ error: 'Erro interno ao cancelar' }, 500);
  }
};
