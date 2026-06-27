export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { fromZonedTime } from 'date-fns-tz';
import { db } from '../../../../db/index.js';
import { barbers, productSales } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';

const TZ = 'America/Fortaleza';

const bodySchema = z.object({
  // Admin pode lançar para outro barbeiro; barbeiro lança sempre pra si.
  barberId:       z.number().int().positive().optional(),
  name:           z.string().trim().min(1).max(100),
  quantity:       z.number().int().min(1).max(99),
  unitPriceCents: z.number().int().min(0).max(1_000_000),
  // Dia (YYYY-MM-DD) ao qual a venda pertence — usado pra cair no faturamento certo.
  date:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const { name, quantity, unitPriceCents, date } = parsed.data;

  // Barbeiro a creditar: admin escolhe; barbeiro é sempre ele mesmo.
  const barberId = session.role === 'admin' && parsed.data.barberId
    ? parsed.data.barberId
    : session.barberId;

  const barber = db.select({ id: barbers.id, name: barbers.name, active: barbers.active })
    .from(barbers).where(eq(barbers.id, barberId)).all()[0];
  if (!barber) return json({ error: 'Barbeiro não encontrado' }, 404);

  // soldAt: meio-dia do dia informado (evita virar o dia por fuso); senão, agora.
  const soldAt = date
    ? fromZonedTime(`${date}T12:00:00`, TZ).toISOString()
    : new Date().toISOString();

  const priceCents = quantity * unitPriceCents;

  const res = db.insert(productSales).values({
    barberId,
    name,
    quantity,
    priceCents,
    soldAt,
    createdById: session.barberId,
  }).run();

  return json({
    ok: true,
    sale: {
      id:         Number(res.lastInsertRowid),
      barberId,
      barberName: barber.name,
      name,
      quantity,
      priceCents,
      soldAt,
    },
  }, 201);
};
