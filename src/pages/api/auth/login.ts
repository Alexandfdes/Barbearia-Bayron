export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { barbers } from '../../../db/schema.js';
import { json } from '../../../lib/api.js';
import { makeSessionCookie } from '../../../lib/session.js';
import { checkRateLimit, resetRateLimit } from '../../../lib/rateLimit.js';

const bodySchema = z.object({
  slug:     z.string().min(1).max(50),
  password: z.string().min(1).max(200),
});

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Campos obrigatórios' }, 400);

  const { slug, password } = parsed.data;

  let ip = 'unknown';
  try { ip = clientAddress; } catch { /* noop */ }

  const rlKey = `${ip}:${slug}`;
  const rl    = checkRateLimit(rlKey);
  if (!rl.ok) {
    return json({ error: `Muitas tentativas. Tente em ${rl.retryAfterSecs}s` }, 429);
  }

  const rows = db
    .select({ id: barbers.id, role: barbers.role, passwordHash: barbers.passwordHash, active: barbers.active })
    .from(barbers)
    .where(eq(barbers.slug, slug))
    .all();

  const barber  = rows[0];
  const isValid = barber?.active && barber.passwordHash
    ? await compare(password, barber.passwordHash)
    : false;

  if (!isValid) {
    return json({ error: 'Usuário ou senha inválidos' }, 401);
  }

  resetRateLimit(rlKey);

  const cookie = await makeSessionCookie({
    barberId: barber.id,
    role:     barber.role as 'admin' | 'barber',
  });

  return new Response(JSON.stringify({ ok: true }), {
    status:  200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie },
  });
};
