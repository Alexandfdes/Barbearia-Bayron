export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { barbers } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';

// Slug NÃO é editável: ele é o identificador de login (ver /api/auth/login).
// Mudá-lo trocaria o usuário de acesso do barbeiro. Por isso fica fora do schema.
const updateSchema = z.object({
  name:   z.string().min(2).max(80).optional(),
  role:   z.enum(['admin', 'barber']).optional(),
  active: z.boolean().optional(),
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

  const { name, role, active } = parsed.data;
  if (name === undefined && role === undefined && active === undefined) {
    return json({ error: 'Nenhum campo para atualizar' }, 400);
  }

  const target = db.select({ id: barbers.id, role: barbers.role })
    .from(barbers).where(eq(barbers.id, id)).all()[0];
  if (!target) return json({ error: 'Barbeiro não encontrado' }, 404);

  // Proteções: o admin logado não pode se trancar pra fora do sistema.
  // (Estas regras garantem que sempre exista ao menos 1 admin ativo.)
  const isSelf = id === session.barberId;
  if (isSelf && active === false) {
    return json({ error: 'Você não pode desativar a si mesmo.' }, 403);
  }
  if (isSelf && role === 'barber') {
    return json({ error: 'Você não pode rebaixar o seu próprio acesso de admin.' }, 403);
  }

  const updates: Record<string, unknown> = {};
  if (name   !== undefined) updates.name   = name;
  if (role   !== undefined) updates.role   = role;
  if (active !== undefined) updates.active = active;

  db.update(barbers).set(updates).where(eq(barbers.id, id)).run();
  return json({ ok: true });
};
