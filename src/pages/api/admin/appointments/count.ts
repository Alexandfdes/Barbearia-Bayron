export const prerender = false;

import type { APIRoute } from 'astro';
import { sqlite } from '../../../../db/index.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { fromZonedTime } from 'date-fns-tz';

/**
 * GET /api/admin/appointments/count?date=YYYY-MM-DD[&barber=N]
 *
 * Resposta leve usada pelo auto-refresh da timeline:
 * { ok: true, count: N, maxModified: "<iso>" }
 *
 * count: total de appointments no dia (todos os status) com o filtro de barbeiro.
 * maxModified: maior valor de COALESCE(last_modified_at, created_at) — pra
 *              detectar mudanças mesmo se a contagem não mudou (ex: notes editadas).
 */

const TZ = 'America/Fortaleza';

const stmtAll = sqlite.prepare(`
  SELECT COUNT(*) AS c,
         COALESCE(MAX(COALESCE(last_modified_at, created_at)), '') AS maxModified
    FROM appointments
   WHERE starts_at >= ? AND starts_at < ?
`);

const stmtByBarber = sqlite.prepare(`
  SELECT COUNT(*) AS c,
         COALESCE(MAX(COALESCE(last_modified_at, created_at)), '') AS maxModified
    FROM appointments
   WHERE barber_id = ? AND starts_at >= ? AND starts_at < ?
`);

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const date = url.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: 'Parâmetro date obrigatório' }, 400);
  }

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

  const startIso = fromZonedTime(`${date}T00:00:00`, TZ).toISOString();
  const endIso   = fromZonedTime(`${date}T23:59:59`, TZ).toISOString();

  const row = barberFilter !== null
    ? stmtByBarber.get(barberFilter, startIso, endIso)
    : stmtAll.get(startIso, endIso);

  const r = row as { c: number; maxModified: string };
  return json({ ok: true, count: r.c, maxModified: r.maxModified });
};
