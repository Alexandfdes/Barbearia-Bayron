export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { addDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { getAvailableSlots } from '../../lib/slots.js';

const TZ = 'America/Fortaleza';

const querySchema = z.object({
  barberId:  z.coerce.number().int().positive(),
  serviceId: z.coerce.number().int().positive(),
  date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser YYYY-MM-DD'),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = ({ request }) => {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    barberId:  url.searchParams.get('barberId'),
    serviceId: url.searchParams.get('serviceId'),
    date:      url.searchParams.get('date'),
  });

  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
  }

  const { barberId, serviceId, date } = parsed.data;

  const now        = new Date();
  const todayStr   = formatInTimeZone(now, TZ, 'yyyy-MM-dd');
  const maxDateStr = formatInTimeZone(addDays(now, 30), TZ, 'yyyy-MM-dd');

  if (date < todayStr)   return json({ error: 'Data no passado' }, 400);
  if (date > maxDateStr) return json({ error: 'Data além do limite de 30 dias' }, 400);

  try {
    const slots = getAvailableSlots(barberId, serviceId, date);

    return json({
      date,
      timezone: TZ,
      slots: slots.map(s => ({
        utc:  s.toISOString(),
        time: formatInTimeZone(s, TZ, 'HH:mm'),
      })),
    });
  } catch (err) {
    console.error('[api/slots]', err);
    return json({ error: 'Erro interno ao calcular slots' }, 500);
  }
};
