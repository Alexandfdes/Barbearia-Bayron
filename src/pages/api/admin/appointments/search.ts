export const prerender = false;

import type { APIRoute } from 'astro';
import { formatInTimeZone } from 'date-fns-tz';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { sqlite } from '../../../../db/index.js';

const TZ = 'America/Fortaleza';

// customer_phone é armazenado normalizado (só dígitos) — LIKE direto na coluna.
const stmtSearch = sqlite.prepare(`
  SELECT
    a.id              AS id,
    a.status          AS status,
    a.starts_at       AS starts_at,
    a.ends_at         AS ends_at,
    a.duration_minutes AS duration_minutes,
    a.price_cents     AS price_cents,
    a.customer_name   AS customer_name,
    a.customer_phone  AS customer_phone,
    a.manage_token    AS manage_token,
    a.cancelled_at    AS cancelled_at,
    b.name            AS barber_name,
    s.name            AS service_name
  FROM appointments a
  INNER JOIN barbers  b ON b.id = a.barber_id
  INNER JOIN services s ON s.id = a.service_id
  WHERE a.customer_phone LIKE ?
  ORDER BY a.starts_at DESC
  LIMIT 50
`);

interface RawRow {
  id: number;
  status: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  price_cents: number;
  customer_name: string;
  customer_phone: string;
  manage_token: string;
  cancelled_at: string | null;
  barber_name: string;
  service_name: string;
}

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const phoneRaw = url.searchParams.get('phone') ?? '';
  const digits   = phoneRaw.replace(/\D/g, '');

  if (digits.length < 4) {
    return json({ results: [], info: 'Digite pelo menos 4 dígitos do telefone' });
  }

  const rows = stmtSearch.all(`%${digits}%`) as RawRow[];

  const results = rows.map(r => ({
    id:              r.id,
    status:          r.status,
    customerName:    r.customer_name,
    customerPhone:   r.customer_phone,
    barberName:      r.barber_name,
    serviceName:     r.service_name,
    manageToken:     r.manage_token,
    durationMinutes: r.duration_minutes,
    priceCents:      r.price_cents,
    startsAt:        r.starts_at,
    endsAt:          r.ends_at,
    cancelledAt:     r.cancelled_at,
    dateLocal:       formatInTimeZone(new Date(r.starts_at), TZ, 'dd/MM/yyyy'),
    timeLocal:       formatInTimeZone(new Date(r.starts_at), TZ, 'HH:mm'),
  }));

  return json({ results, count: results.length });
};
