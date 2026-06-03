export const prerender = false;

import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { services } from '../../../db/schema.js';
import { json } from '../../../lib/api.js';

// Preços públicos do catálogo (fonte da verdade para a landing).
// Lista TODOS os serviços ativos — sem o filtro de barber_services, pois aqui
// importa o catálogo institucional, não quem oferece cada serviço.
export const GET: APIRoute = () => {
  try {
    const rows = db
      .select({ slug: services.slug, priceCents: services.priceCents })
      .from(services)
      .where(eq(services.active, true))
      .all();
    return json(rows);
  } catch (err) {
    console.error('[api/services/prices]', err);
    return json({ error: 'Erro interno' }, 500);
  }
};
