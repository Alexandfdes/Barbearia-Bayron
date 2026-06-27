export const prerender = false;

import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { products } from '../../../db/schema.js';
import { json } from '../../../lib/api.js';

// Lista pública dos produtos ATIVOS — usada pelos cards da landing, pelo combo
// (wizard de agendamento) e pelo modal de venda de produto no admin.
export const GET: APIRoute = () => {
  const rows = db
    .select({
      id:        products.id,
      slug:      products.slug,
      name:      products.name,
      shortDesc: products.shortDesc,
      priceCents: products.priceCents,
      image:     products.image,
    })
    .from(products)
    .where(eq(products.active, true))
    .orderBy(products.sortOrder, products.id)
    .all();

  return json(rows);
};
