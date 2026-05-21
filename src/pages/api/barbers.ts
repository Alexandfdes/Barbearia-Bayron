export const prerender = false;

import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { barbers } from '../../db/schema.js';
import { json } from '../../lib/api.js';

export const GET: APIRoute = () => {
  try {
    const result = db
      .select({ id: barbers.id, name: barbers.name, slug: barbers.slug })
      .from(barbers)
      .where(eq(barbers.active, true))
      .orderBy(barbers.id)
      .all();

    return json(result);
  } catch (err) {
    console.error('[api/barbers]', err);
    return json({ error: 'Erro interno' }, 500);
  }
};
