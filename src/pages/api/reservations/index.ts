export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { products, reservations } from '../../../db/schema.js';
import { json } from '../../../lib/api.js';
import { checkRateLimit } from '../../../lib/rateLimit.js';
import { normalizePhone } from '../../../lib/phone.js';

const bodySchema = z.object({
  productId:     z.number().int().positive(),
  quantity:      z.number().int().min(1).max(20),
  customerName:  z.string().trim().min(2).max(100),
  customerPhone: z.string().min(8).max(25),
});

// Reserva pública de produto (cliente reserva pra retirar na barbearia).
export const POST: APIRoute = async ({ request, clientAddress }) => {
  let ip = 'unknown';
  try {
    ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      ?? request.headers.get('x-real-ip')
      ?? clientAddress ?? 'unknown';
  } catch { /* noop */ }

  const ipRl = checkRateLimit(`reservation-ip:${ip}`, { maxTries: 10 });
  if (!ipRl.ok) return json({ error: `Muitas reservas deste dispositivo. Tente em ${ipRl.retryAfterSecs}s.` }, 429);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const phone = normalizePhone(parsed.data.customerPhone);
  if (!phone) return json({ error: 'Telefone inválido — informe DDD + número' }, 400);

  const phoneRl = checkRateLimit(`reservation-phone:${ip}:${phone.slice(-11)}`, { maxTries: 5 });
  if (!phoneRl.ok) return json({ error: 'Muitas reservas para este telefone. Tente mais tarde.' }, 429);

  const product = db
    .select({ id: products.id, name: products.name, priceCents: products.priceCents, active: products.active })
    .from(products).where(eq(products.id, parsed.data.productId)).all()[0];
  if (!product || !product.active) return json({ error: 'Produto indisponível' }, 400);

  db.insert(reservations).values({
    productId:     product.id,
    productName:   product.name,
    priceCents:    product.priceCents,
    quantity:      parsed.data.quantity,
    customerName:  parsed.data.customerName.trim(),
    customerPhone: phone,
  }).run();

  return json({ ok: true }, 201);
};
