export const prerender = false;

import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { combos, services, products } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { saveProductImage } from '../../../../lib/uploads.js';

function parseIntField(form: FormData, key: string): number {
  return parseInt(String(form.get(key) ?? ''), 10);
}

// GET — lista todos os combos (com nomes do serviço/produto) para o admin.
export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const rows = db.select({
    id: combos.id, name: combos.name, serviceId: combos.serviceId, productId: combos.productId,
    discountPct: combos.discountPct, weekdays: combos.weekdays, image: combos.image,
    active: combos.active, sortOrder: combos.sortOrder,
    serviceName: services.name, productName: products.name,
  })
    .from(combos)
    .leftJoin(services, eq(services.id, combos.serviceId))
    .leftJoin(products, eq(products.id, combos.productId))
    .orderBy(combos.sortOrder, combos.id)
    .all();
  return json(rows);
};

// POST — cria combo (multipart/form-data; imagem opcional).
export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ error: 'Formulário inválido' }, 400); }

  const name = String(form.get('name') ?? '').trim();
  if (name.length < 2 || name.length > 100) return json({ error: 'Nome inválido' }, 400);

  const serviceId = parseIntField(form, 'serviceId');
  const productId = parseIntField(form, 'productId');
  if (isNaN(serviceId) || isNaN(productId)) return json({ error: 'Escolha o serviço e o produto' }, 400);

  const svc = db.select({ id: services.id }).from(services).where(eq(services.id, serviceId)).all()[0];
  if (!svc) return json({ error: 'Serviço não encontrado' }, 400);
  const prod = db.select({ id: products.id }).from(products).where(eq(products.id, productId)).all()[0];
  if (!prod) return json({ error: 'Produto não encontrado' }, 400);

  let discountPct = parseIntField(form, 'discountPct');
  if (isNaN(discountPct) || discountPct < 0 || discountPct > 90) return json({ error: 'Desconto inválido (0–90%)' }, 400);

  let weekdays = parseIntField(form, 'weekdays');
  if (isNaN(weekdays) || weekdays < 0 || weekdays > 127) weekdays = 0;

  const active = String(form.get('active') ?? 'true') !== 'false';

  let image: string | null = null;
  const file = form.get('image');
  if (file && file instanceof File && file.size > 0) {
    const res = await saveProductImage(file);
    if ('error' in res) return json({ error: res.error }, 400);
    image = res.path;
  }

  const sorts = db.select({ s: combos.sortOrder }).from(combos).all();
  const nextSort = (sorts.length ? Math.max(...sorts.map(r => r.s)) : 0) + 1;

  const result = db.insert(combos).values({
    name, serviceId, productId, discountPct, weekdays, image, active, sortOrder: nextSort,
  }).run();

  return json({ ok: true, id: Number(result.lastInsertRowid) }, 201);
};
