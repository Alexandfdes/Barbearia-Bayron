export const prerender = false;

import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { workingHours } from '../../../db/schema.js';
import { json } from '../../../lib/api.js';

// Leitura pública: o wizard de agendamento usa para saber em quais dias da semana
// o barbeiro trabalha (e desabilitar os dias sem registro). Horário de
// funcionamento não é dado sensível.
export const GET: APIRoute = ({ url }) => {
  const barberId = parseInt(url.searchParams.get('barber') ?? '', 10);
  if (isNaN(barberId)) return json({ error: 'Parâmetro "barber" inválido' }, 400);

  const rows = db
    .select({
      weekday:   workingHours.weekday,
      startTime: workingHours.startTime,
      endTime:   workingHours.endTime,
    })
    .from(workingHours)
    .where(eq(workingHours.barberId, barberId))
    .orderBy(workingHours.weekday)
    .all();

  return json(rows);
};
