export const prerender = false;

import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { combos, services, products } from '../../../db/schema.js';
import { json } from '../../../lib/api.js';
import { applyDiscountPct } from '../../../lib/combo.js';

// Lista pública dos combos ATIVOS (com serviço e produto também ativos), já com
// preços calculados. A landing filtra pelo dia da semana via `weekdays` (bitmask).
export const GET: APIRoute = () => {
  const rows = db
    .select({
      id:          combos.id,
      name:        combos.name,
      discountPct: combos.discountPct,
      weekdays:    combos.weekdays,
      image:       combos.image,
      serviceId:   combos.serviceId,
      serviceName: services.name,
      serviceCents: services.priceCents,
      productName: products.name,
      productSlug: products.slug,
      productCents: products.priceCents,
      productImage: products.image,
    })
    .from(combos)
    .innerJoin(services, eq(services.id, combos.serviceId))
    .innerJoin(products, eq(products.id, combos.productId))
    .where(and(eq(combos.active, true), eq(services.active, true), eq(products.active, true)))
    .orderBy(combos.sortOrder, combos.id)
    .all();

  const out = rows.map(r => {
    const svcD = applyDiscountPct(r.serviceCents, r.discountPct);
    const prodD = applyDiscountPct(r.productCents, r.discountPct);
    return {
      id:          r.id,
      name:        r.name,
      discountPct: r.discountPct,
      weekdays:    r.weekdays,
      image:       r.image || r.productImage || null,
      serviceId:   r.serviceId,
      serviceName: r.serviceName,
      productName: r.productName,
      productSlug: r.productSlug,
      serviceCents: r.serviceCents,
      productCents: r.productCents,
      serviceDiscountedCents: svcD,
      productDiscountedCents: prodD,
      totalFullCents:        r.serviceCents + r.productCents,
      totalDiscountedCents:  svcD + prodD,
    };
  });

  return json(out);
};
