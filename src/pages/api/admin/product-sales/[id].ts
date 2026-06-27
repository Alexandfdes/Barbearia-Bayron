export const prerender = false;

import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { productSales } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';

// Remove uma venda de produto (correção de lançamento manual).
export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  const sale = db.select({ id: productSales.id, barberId: productSales.barberId })
    .from(productSales).where(eq(productSales.id, id)).all()[0];
  if (!sale) return json({ error: 'Venda não encontrada' }, 404);

  // Barbeiro só apaga as próprias vendas; admin apaga qualquer uma.
  if (session.role !== 'admin' && sale.barberId !== session.barberId) {
    return json({ error: 'Sem permissão' }, 403);
  }

  db.delete(productSales).where(eq(productSales.id, id)).run();
  return json({ ok: true });
};
