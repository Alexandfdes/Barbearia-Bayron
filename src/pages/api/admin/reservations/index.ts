export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '../../../../db/index.js';
import { reservations } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';

// Lista todas as reservas para o admin (pendentes primeiro, mais novas no topo).
export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const rows = db.select().from(reservations).all();
  const rank: Record<string, number> = { pending: 0, fulfilled: 1, cancelled: 2 };
  rows.sort((a, b) => (rank[a.status] - rank[b.status]) || b.createdAt.localeCompare(a.createdAt));
  return json(rows);
};
