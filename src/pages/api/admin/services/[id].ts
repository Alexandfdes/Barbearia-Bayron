export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { services } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';

const updateSchema = z.object({
  name:       z.string().min(2).max(100).optional(),
  priceCents: z.number().int().positive().optional(),
  active:     z.boolean().optional(),
});

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const updates: Record<string, unknown> = {};
  if (parsed.data.name       !== undefined) updates.name       = parsed.data.name;
  if (parsed.data.priceCents !== undefined) updates.priceCents = parsed.data.priceCents;
  if (parsed.data.active     !== undefined) updates.active     = parsed.data.active;

  if (Object.keys(updates).length === 0) return json({ error: 'Nenhum campo para atualizar' }, 400);

  const rows = db.select({ id: services.id }).from(services).where(eq(services.id, id)).all();
  if (rows.length === 0) return json({ error: 'Serviço não encontrado' }, 404);

  db.update(services).set(updates).where(eq(services.id, id)).run();
  return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  const rows = db.select({ id: services.id }).from(services).where(eq(services.id, id)).all();
  if (rows.length === 0) return json({ error: 'Serviço não encontrado' }, 404);

  db.update(services).set({ active: false }).where(eq(services.id, id)).run();
  return json({ ok: true });
};
