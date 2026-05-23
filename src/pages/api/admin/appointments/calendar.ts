export const prerender = false;

import type { APIRoute } from 'astro';
import { sqlite } from '../../../../db/index.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';

/**
 * GET /api/admin/appointments/calendar?month=YYYY-MM[&barber=N]
 *
 * Retorna { days: { "YYYY-MM-DD": qty, ... } } com a contagem de agendamentos
 * (confirmed + completed) por dia local Fortaleza no mês solicitado.
 *
 * Barbeiro não-admin só vê os próprios agendamentos.
 */

// Fortaleza = UTC-3 fixo. Pra agrupar por "dia local" no SQLite,
// pegamos os primeiros 10 chars de datetime(starts_at, '-3 hours').
const stmtAll = sqlite.prepare(`
  SELECT
    substr(datetime(starts_at, '-3 hours'), 1, 10) AS day_local,
    COUNT(*) AS qty
  FROM appointments
  WHERE status IN ('confirmed', 'completed')
    AND substr(datetime(starts_at, '-3 hours'), 1, 7) = ?
  GROUP BY day_local
`);

const stmtByBarber = sqlite.prepare(`
  SELECT
    substr(datetime(starts_at, '-3 hours'), 1, 10) AS day_local,
    COUNT(*) AS qty
  FROM appointments
  WHERE status IN ('confirmed', 'completed')
    AND barber_id = ?
    AND substr(datetime(starts_at, '-3 hours'), 1, 7) = ?
  GROUP BY day_local
`);

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const month = url.searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return json({ error: 'Parâmetro month obrigatório (YYYY-MM)' }, 400);
  }

  // Barbeiro não-admin sempre vê só os próprios. Admin pode filtrar opcionalmente.
  let barberFilter: number | null = null;
  if (session.role === 'admin') {
    const b = url.searchParams.get('barber');
    if (b) {
      const n = parseInt(b, 10);
      if (!isNaN(n)) barberFilter = n;
    }
  } else {
    barberFilter = session.barberId;
  }

  const rows = (barberFilter !== null
    ? stmtByBarber.all(barberFilter, month)
    : stmtAll.all(month)) as { day_local: string; qty: number }[];

  const days: Record<string, number> = {};
  for (const r of rows) days[r.day_local] = r.qty;

  return json({ ok: true, month, days });
};
