export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { barbers, barberServices, services } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';

function slugify(str: string): string {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const createSchema = z.object({
  name:       z.string().min(2).max(100),
  priceCents: z.number().int().positive(),
});

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const includeInactive = url.searchParams.get('all') === 'true' && session.role === 'admin';

  const baseQuery = db
    .select({
      id:         services.id,
      name:       services.name,
      slug:       services.slug,
      priceCents: services.priceCents,
      active:     services.active,
      bsActive:   barberServices.active,
      bsDuration: barberServices.durationMinutes,
    })
    .from(services)
    .leftJoin(
      barberServices,
      and(eq(barberServices.serviceId, services.id), eq(barberServices.barberId, session.barberId))
    );

  const rows = includeInactive
    ? baseQuery.orderBy(services.name).all()
    : baseQuery.where(eq(services.active, true)).orderBy(services.name).all();

  return json(rows);
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const { name, priceCents } = parsed.data;
  let slug = slugify(name);

  // Garantir slug único
  const existing = db.select({ slug: services.slug }).from(services)
    .where(eq(services.slug, slug)).all();
  if (existing.length > 0) slug = `${slug}-${Date.now()}`;

  const result = db.insert(services).values({ name, slug, priceCents }).run();
  return json({ ok: true, id: result.lastInsertRowid, slug }, 201);
};
