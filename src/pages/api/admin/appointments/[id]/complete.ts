export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../../../db/index.js';
import { appointments, appointmentItems, services } from '../../../../../db/schema.js';
import { json } from '../../../../../lib/api.js';
import { getSession } from '../../../../../lib/session.js';

// Extras da "comanda": serviços adicionais feitos no balcão (ex.: barba além do corte).
// priceCents vem do fechamento (permite ajuste/desconto); o nome é snapshot do serviço.
const completeSchema = z.object({
  extras: z.array(z.object({
    serviceId:  z.number().int().positive(),
    priceCents: z.number().int().nonnegative().max(1_000_000),
  })).max(20).optional(),
});

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  // Body é opcional (concluir sem extras mantém o comportamento antigo).
  let extras: { serviceId: number; priceCents: number }[] = [];
  const raw = await request.text();
  if (raw.trim()) {
    let body: unknown;
    try { body = JSON.parse(raw); }
    catch { return json({ error: 'JSON inválido' }, 400); }
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);
    extras = parsed.data.extras ?? [];
  }

  const appt = db
    .select({ id: appointments.id, status: appointments.status, barberId: appointments.barberId })
    .from(appointments)
    .where(eq(appointments.id, id))
    .all()[0];

  if (!appt) return json({ error: 'Não encontrado' }, 404);
  if (session.role !== 'admin' && appt.barberId !== session.barberId) {
    return json({ error: 'Sem permissão' }, 403);
  }
  if (appt.status !== 'confirmed') {
    return json({ error: `Não pode concluir (status: ${appt.status})` }, 409);
  }

  // Resolve nome (snapshot) e valida cada serviço extra antes de gravar.
  const items: { serviceId: number; name: string; priceCents: number }[] = [];
  for (const ex of extras) {
    const svc = db.select({ id: services.id, name: services.name })
      .from(services).where(eq(services.id, ex.serviceId)).all()[0];
    if (!svc) return json({ error: `Serviço ${ex.serviceId} não encontrado` }, 400);
    items.push({ serviceId: svc.id, name: svc.name, priceCents: ex.priceCents });
  }

  db.transaction((tx) => {
    tx.update(appointments)
      .set({
        status:           'completed',
        lastModifiedById: session.barberId,
        lastModifiedAt:   new Date().toISOString(),
      })
      .where(eq(appointments.id, id))
      .run();

    for (const it of items) {
      tx.insert(appointmentItems)
        .values({ appointmentId: id, serviceId: it.serviceId, name: it.name, priceCents: it.priceCents })
        .run();
    }
  });

  return json({ ok: true });
};
