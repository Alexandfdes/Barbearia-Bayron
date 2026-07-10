export const prerender = false;

import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { products } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { saveProductImage } from '../../../../lib/uploads.js';

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'produto';
}

function uniqueSlug(base: string): string {
  let slug = base, n = 2;
  while (db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).all().length > 0) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

// GET — lista TODOS os produtos (inclui inativos) para o admin.
export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const rows = db.select().from(products).orderBy(products.sortOrder, products.id).all();
  return json(rows);
};

// POST — cria produto (multipart/form-data, com upload opcional de imagem).
export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ error: 'Formulário inválido' }, 400); }

  const name = String(form.get('name') ?? '').trim();
  if (name.length < 2 || name.length > 100) return json({ error: 'Nome inválido' }, 400);

  const shortDesc = String(form.get('shortDesc') ?? '').trim().slice(0, 300) || null;

  const priceReais = parseFloat(String(form.get('price') ?? '').replace(',', '.'));
  if (!isFinite(priceReais) || priceReais < 0 || priceReais > 100000) {
    return json({ error: 'Preço inválido' }, 400);
  }
  const priceCents = Math.round(priceReais * 100);

  const active = String(form.get('active') ?? 'true') !== 'false';

  try {
    let image: string | null = null;
    const file = form.get('image');
    if (file && file instanceof File && file.size > 0) {
      const res = await saveProductImage(file);
      if ('error' in res) return json({ error: res.error }, 400);
      image = res.path;
    }

    const sorts = db.select({ s: products.sortOrder }).from(products).all();
    const nextSort = (sorts.length ? Math.max(...sorts.map(r => r.s)) : 0) + 1;

    const slug = uniqueSlug(slugify(name));

    const result = db.insert(products).values({
      slug, name, shortDesc, priceCents, image, active, sortOrder: nextSort,
    }).run();

    return json({ ok: true, id: Number(result.lastInsertRowid), slug }, 201);
  } catch (err) {
    console.error('[api/admin/products POST]', err);
    const msg = err instanceof Error ? err.message : 'erro desconhecido';
    return json({ error: `Falha ao salvar produto: ${msg}` }, 500);
  }
};
