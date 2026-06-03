export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../../../../../db/index.js';
import { barbers } from '../../../../../db/schema.js';
import { json } from '../../../../../lib/api.js';
import { getSession } from '../../../../../lib/session.js';

const BCRYPT_COST = 12;

const bodySchema = z.object({
  password: z.string().min(6).max(200),
});

// POST — troca a senha de um barbeiro. Admin pode trocar a de qualquer um.
// A senha em texto não é logada nem devolvida na resposta.
export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: 'A senha precisa ter ao menos 6 caracteres' }, 400);

  const target = db.select({ id: barbers.id }).from(barbers).where(eq(barbers.id, id)).all()[0];
  if (!target) return json({ error: 'Barbeiro não encontrado' }, 404);

  const passwordHash = await hash(parsed.data.password, BCRYPT_COST);
  db.update(barbers).set({ passwordHash }).where(eq(barbers.id, id)).run();

  return json({ ok: true });
};
