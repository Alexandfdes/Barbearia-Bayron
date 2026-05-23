export const prerender = false;

import type { APIRoute } from 'astro';
import { sqlite } from '../../../../../db/index.js';
import { json } from '../../../../../lib/api.js';
import { getSession } from '../../../../../lib/session.js';

/**
 * GET /api/admin/appointments/:id/history
 *
 * Retorna últimas N visitas (default 5) do mesmo cliente (por telefone normalizado),
 * EXCLUINDO o próprio agendamento atual.
 *
 * Resposta: { ok: true, history: [{ id, startsAt, status, serviceName, barberName, priceCents }], total }
 */

const stmtGetCurrent = sqlite.prepare(`
  SELECT customer_phone, barber_id FROM appointments WHERE id = ?
`);

// Total de visitas (qualquer status) — pro card de stat
const stmtCount = sqlite.prepare(`
  SELECT COUNT(*) AS total FROM appointments
  WHERE substr(
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
      customer_phone, ' ', ''), '(', ''), ')', ''), '-', ''), '+', ''), '.', ''),
    -11
  ) = ?
`);

const stmtHistory = sqlite.prepare(`
  SELECT
    a.id              AS id,
    a.starts_at       AS starts_at,
    a.status          AS status,
    a.price_cents     AS price_cents,
    s.name            AS service_name,
    b.name            AS barber_name
  FROM appointments a
  INNER JOIN services s ON s.id = a.service_id
  INNER JOIN barbers  b ON b.id = a.barber_id
  WHERE substr(
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
      a.customer_phone, ' ', ''), '(', ''), ')', ''), '-', ''), '+', ''), '.', ''),
    -11
  ) = ?
  AND a.id != ?
  ORDER BY a.starts_at DESC
  LIMIT ?
`);

function lastDigits(phone: string): string {
  const d = (phone ?? '').replace(/\D/g, '');
  return d.length > 11 ? d.slice(-11) : d;
}

export const GET: APIRoute = async ({ params, request, url }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  const current = stmtGetCurrent.get(id) as { customer_phone: string; barber_id: number } | undefined;
  if (!current) return json({ error: 'Agendamento não encontrado' }, 404);

  if (session.role !== 'admin' && current.barber_id !== session.barberId) {
    return json({ error: 'Sem permissão' }, 403);
  }

  const phoneKey = lastDigits(current.customer_phone);
  if (phoneKey.length < 10) return json({ ok: true, history: [], total: 0 });

  const limit = parseInt(url.searchParams.get('limit') ?? '5', 10);
  const safeLimit = Math.min(Math.max(limit, 1), 50);

  const totalRow = stmtCount.get(phoneKey) as { total: number };
  const rows = stmtHistory.all(phoneKey, id, safeLimit) as Array<{
    id: number; starts_at: string; status: string; price_cents: number;
    service_name: string; barber_name: string;
  }>;

  return json({
    ok: true,
    total: totalRow.total,
    history: rows.map(r => ({
      id:           r.id,
      startsAt:     r.starts_at,
      status:       r.status,
      priceCents:   r.price_cents,
      serviceName:  r.service_name,
      barberName:   r.barber_name,
    })),
  });
};
