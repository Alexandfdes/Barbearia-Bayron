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

// Total de visitas (qualquer status) — pro card de stat.
// customer_phone armazenado normalizado → comparação direta com índice.
const stmtCount = sqlite.prepare(`
  SELECT COUNT(*) AS total FROM appointments
  WHERE customer_phone = ?
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
  WHERE a.customer_phone = ?
  AND a.id != ?
  ORDER BY a.starts_at DESC
  LIMIT ?
`);

// Estatísticas agregadas pra "ficha do cliente": gasto, contagens, 1ª visita.
const stmtStats = sqlite.prepare(`
  SELECT
    COUNT(*)                                                   AS total,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)      AS completed,
    SUM(CASE WHEN status = 'no_show'   THEN 1 ELSE 0 END)      AS no_show,
    SUM(CASE WHEN status = 'completed' THEN price_cents ELSE 0 END) AS spent_appts,
    MIN(starts_at)                                             AS first_visit
  FROM appointments
  WHERE customer_phone = ?
`);

// Soma dos itens da comanda (ex.: produtos) só de atendimentos concluídos.
const stmtSpentItems = sqlite.prepare(`
  SELECT COALESCE(SUM(ai.price_cents), 0) AS spent_items
  FROM appointment_items ai
  INNER JOIN appointments a ON a.id = ai.appointment_id
  WHERE a.customer_phone = ? AND a.status = 'completed'
`);

// Serviço favorito = mais frequente entre visitas não-canceladas.
const stmtFavorite = sqlite.prepare(`
  SELECT s.name AS name, COUNT(*) AS c
  FROM appointments a
  INNER JOIN services s ON s.id = a.service_id
  WHERE a.customer_phone = ? AND a.status != 'cancelled'
  GROUP BY a.service_id
  ORDER BY c DESC, MAX(a.starts_at) DESC
  LIMIT 1
`);

import { normalizePhone } from '../../../../../lib/phone.js';

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

  const phoneKey = normalizePhone(current.customer_phone);
  if (!phoneKey) return json({ ok: true, history: [], total: 0 });

  const limit = parseInt(url.searchParams.get('limit') ?? '5', 10);
  const safeLimit = Math.min(Math.max(limit, 1), 50);

  const totalRow = stmtCount.get(phoneKey) as { total: number };
  const rows = stmtHistory.all(phoneKey, id, safeLimit) as Array<{
    id: number; starts_at: string; status: string; price_cents: number;
    service_name: string; barber_name: string;
  }>;

  // ── Stats agregados (ficha do cliente) ──────────────────────────────────────
  const statsRow = stmtStats.get(phoneKey) as {
    total: number; completed: number; no_show: number;
    spent_appts: number | null; first_visit: string | null;
  };
  const itemsRow = stmtSpentItems.get(phoneKey) as { spent_items: number };
  const favRow = stmtFavorite.get(phoneKey) as { name: string; c: number } | undefined;

  const completed = statsRow.completed ?? 0;
  const noShow    = statsRow.no_show ?? 0;
  const fechados  = completed + noShow;

  const stats = {
    totalCount:     statsRow.total ?? 0,
    completedCount: completed,
    noShowCount:    noShow,
    noShowRate:     fechados ? Math.round((noShow / fechados) * 1000) / 10 : 0,
    totalSpentCents: (statsRow.spent_appts ?? 0) + (itemsRow.spent_items ?? 0),
    firstVisitAt:   statsRow.first_visit,
    favoriteService: favRow?.name ?? null,
  };

  return json({
    ok: true,
    total: totalRow.total,
    stats,
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
