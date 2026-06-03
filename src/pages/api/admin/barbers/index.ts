export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { barbers, barberServices, services, workingHours } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';

const BCRYPT_COST = 12;

function slugify(str: string): string {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const createSchema = z.object({
  name:     z.string().min(2).max(80),
  slug:     z.string().min(1).max(50).optional(),
  role:     z.enum(['admin', 'barber']),
  password: z.string().min(6).max(200),
});

// GET — lista todos os barbeiros (ativos e inativos), sem o hash da senha
export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  const rows = db
    .select({
      id:        barbers.id,
      name:      barbers.name,
      slug:      barbers.slug,
      role:      barbers.role,
      active:    barbers.active,
      createdAt: barbers.createdAt,
    })
    .from(barbers)
    .orderBy(barbers.name)
    .all();

  return json(rows);
};

// POST — cria um novo barbeiro e o deixa funcional (working_hours + barber_services)
export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const { name, role, password } = parsed.data;
  const slug = slugify(parsed.data.slug ?? name);

  if (!slug) return json({ error: 'Nome/slug inválido' }, 400);

  // Slug é o identificador de login: precisa ser único. Sem sufixo automático —
  // se colidir, o admin escolhe outro (senão geraria um login esquisito).
  const existing = db.select({ id: barbers.id }).from(barbers).where(eq(barbers.slug, slug)).all();
  if (existing.length > 0) {
    return json({ error: `O slug "${slug}" já está em uso. Escolha outro.` }, 409);
  }

  const passwordHash = await hash(password, BCRYPT_COST);

  // Serviços ativos + uma duração de referência (a já praticada por algum barbeiro,
  // ou 30 min de fallback) para o novo barbeiro nascer oferecendo o catálogo.
  const activeServices = db.select({ id: services.id }).from(services).where(eq(services.active, true)).all();
  const refDuration = (serviceId: number): number => {
    const r = db.select({ d: barberServices.durationMinutes }).from(barberServices)
      .where(eq(barberServices.serviceId, serviceId)).limit(1).all()[0];
    return r?.d ?? 30;
  };
  const serviceSeed = activeServices.map(s => ({ serviceId: s.id, durationMinutes: refDuration(s.id) }));

  let newId: number | bigint;
  try {
    newId = db.transaction((tx) => {
      const res = tx.insert(barbers).values({ name, slug, role, passwordHash }).run();
      const id = res.lastInsertRowid as number | bigint;

      // working_hours: seg–sex 09:00–20:00, sáb 09:00–18:00 (mesmo padrão do seed)
      for (let weekday = 1; weekday <= 5; weekday++) {
        tx.insert(workingHours).values({ barberId: Number(id), weekday, startTime: '09:00', endTime: '20:00' }).run();
      }
      tx.insert(workingHours).values({ barberId: Number(id), weekday: 6, startTime: '09:00', endTime: '18:00' }).run();

      // barber_services: oferece todos os serviços ativos por padrão
      for (const s of serviceSeed) {
        tx.insert(barberServices).values({
          barberId: Number(id), serviceId: s.serviceId, durationMinutes: s.durationMinutes, active: true,
        }).run();
      }
      return id;
    });
  } catch {
    return json({ error: 'Erro ao criar barbeiro' }, 500);
  }

  return json({ id: Number(newId), name, slug, role, active: true }, 201);
};
