export const prerender = false;

import type { APIRoute } from 'astro';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { products } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { saveProductImage, PRODUCT_UPLOAD_DIR, safeUploadName } from '../../../../lib/uploads.js';

const IMG_PREFIX = '/api/products/image/';

// Apaga o arquivo de uma imagem que foi upload (ignora imagens estáticas de /products).
async function removeUploadedImage(image: string | null): Promise<void> {
  if (!image || !image.startsWith(IMG_PREFIX)) return;
  const name = safeUploadName(image.slice(IMG_PREFIX.length));
  if (!name) return;
  try { await unlink(join(PRODUCT_UPLOAD_DIR, name)); } catch { /* já não existe */ }
}

// PATCH — edita campos do produto (multipart/form-data). slug é estável (não muda).
export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  const current = db.select().from(products).where(eq(products.id, id)).all()[0];
  if (!current) return json({ error: 'Produto não encontrado' }, 404);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ error: 'Formulário inválido' }, 400); }

  const updates: Partial<typeof products.$inferInsert> = {};

  if (form.has('name')) {
    const name = String(form.get('name') ?? '').trim();
    if (name.length < 2 || name.length > 100) return json({ error: 'Nome inválido' }, 400);
    updates.name = name;
  }
  if (form.has('shortDesc')) {
    updates.shortDesc = String(form.get('shortDesc') ?? '').trim().slice(0, 300) || null;
  }
  if (form.has('price')) {
    const priceReais = parseFloat(String(form.get('price') ?? '').replace(',', '.'));
    if (!isFinite(priceReais) || priceReais < 0 || priceReais > 100000) {
      return json({ error: 'Preço inválido' }, 400);
    }
    updates.priceCents = Math.round(priceReais * 100);
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

  db.update(products).set(updates).where(eq(products.id, id)).run();
  if (oldImageToRemove) await removeUploadedImage(oldImageToRemove);

  return json({ ok: true });
};

// DELETE — remove o produto (e a imagem enviada, se houver). Vendas/combos
// passados guardam snapshot do nome/preço, então o histórico não quebra.
export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  const current = db.select().from(products).where(eq(products.id, id)).all()[0];
  if (!current) return json({ error: 'Produto não encontrado' }, 404);

  db.delete(products).where(eq(products.id, id)).run();
  await removeUploadedImage(current.image);

  return json({ ok: true });
};
