export const prerender = false;

import type { APIRoute } from 'astro';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { combos, services, products } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { saveProductImage, PRODUCT_UPLOAD_DIR, safeUploadName } from '../../../../lib/uploads.js';

const IMG_PREFIX = '/api/products/image/';

async function removeUploadedImage(image: string | null): Promise<void> {
  if (!image || !image.startsWith(IMG_PREFIX)) return;
  const name = safeUploadName(image.slice(IMG_PREFIX.length));
  if (!name) return;
  try { await unlink(join(PRODUCT_UPLOAD_DIR, name)); } catch { /* já não existe */ }
}

// PATCH — edita o combo (multipart/form-data).
export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  const current = db.select().from(combos).where(eq(combos.id, id)).all()[0];
  if (!current) return json({ error: 'Combo não encontrado' }, 404);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ error: 'Formulário inválido' }, 400); }

  const updates: Partial<typeof combos.$inferInsert> = {};

  if (form.has('name')) {
    const name = String(form.get('name') ?? '').trim();
    if (name.length < 2 || name.length > 100) return json({ error: 'Nome inválido' }, 400);
    updates.name = name;
  }
  if (form.has('serviceId')) {
    const serviceId = parseInt(String(form.get('serviceId')), 10);
    if (isNaN(serviceId) || !db.select({ id: services.id }).from(services).where(eq(services.id, serviceId)).all()[0]) {
      return json({ error: 'Serviço inválido' }, 400);
    }
    updates.serviceId = serviceId;
  }
  if (form.has('productId')) {
    const productId = parseInt(String(form.get('productId')), 10);
    if (isNaN(productId) || !db.select({ id: products.id }).from(products).where(eq(products.id, productId)).all()[0]) {
      return json({ error: 'Produto inválido' }, 400);
    }
    updates.productId = productId;
  }
  if (form.has('discountPct')) {
    const d = parseInt(String(form.get('discountPct')), 10);
    if (isNaN(d) || d < 0 || d > 90) return json({ error: 'Desconto inválido (0–90%)' }, 400);
    updates.discountPct = d;
  }
  if (form.has('weekdays')) {
    const w = parseInt(String(form.get('weekdays')), 10);
    updates.weekdays = (isNaN(w) || w < 0 || w > 127) ? 0 : w;
  }
  if (form.has('active')) {
    updates.active = String(form.get('active')) !== 'false';
  }

  const file = form.get('image');
  let oldImageToRemove: string | null = null;
  if (file && file instanceof File && file.size > 0) {
    const res = await saveProductImage(file);
    if ('error' in res) return json({ error: res.error }, 400);
    updates.image = res.path;
    oldImageToRemove = current.image;
  }

  if (Object.keys(updates).length === 0) return json({ error: 'Nada para atualizar' }, 400);

  db.update(combos).set(updates).where(eq(combos.id, id)).run();
  if (oldImageToRemove) await removeUploadedImage(oldImageToRemove);

  return json({ ok: true });
};

// DELETE — remove o combo (e a imagem enviada, se houver).
export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  const current = db.select().from(combos).where(eq(combos.id, id)).all()[0];
  if (!current) return json({ error: 'Combo não encontrado' }, 404);

  db.delete(combos).where(eq(combos.id, id)).run();
  await removeUploadedImage(current.image);

  return json({ ok: true });
};
