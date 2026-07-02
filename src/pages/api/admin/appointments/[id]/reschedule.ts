export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { addDays, addMinutes } from 'date-fns';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { db, sqlite } from '../../../../../db/index.js';
import { appointments, workingHours } from '../../../../../db/schema.js';
import { json } from '../../../../../lib/api.js';
import { getSession } from '../../../../../lib/session.js';

const TZ = 'America/Fortaleza';

const bodySchema = z.object({
  startsAt: z.string().refine(s => !isNaN(new Date(s).getTime()), 'Data/hora inválida'),
});

const stmtConflictAppt = sqlite.prepare(`
  SELECT COUNT(*) AS c FROM appointments
  WHERE barber_id = ?
    AND status IN ('confirmed','completed')
    AND id != ?
    AND starts_at < ?
    AND ends_at   > ?
`);

const stmtConflictOff = sqlite.prepare(`
  SELECT COUNT(*) AS c FROM time_off
  WHERE (barber_id = ? OR barber_id IS NULL)
    AND starts_at < ?
    AND ends_at   > ?
`);

const stmtUpdate = sqlite.prepare(`
  UPDATE appointments
     SET starts_at = ?, ends_at = ?, last_modified_by_id = ?, last_modified_at = ?
   WHERE id = ? AND status = 'confirmed'
`);

const stmtBegin    = sqlite.prepare('BEGIN IMMEDIATE');
const stmtCommit   = sqlite.prepare('COMMIT');
const stmtRollback = sqlite.prepare('ROLLBACK');

function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getDay();
}

export const POST: APIRoute = async ({ params, request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const newStart = new Date(parsed.data.startsAt);

  // Limites de janela (admin pode reagendar com mais flexibilidade — janela maior)
  const now        = new Date();
  const todayStr   = formatInTimeZone(now, TZ, 'yyyy-MM-dd');
  const maxDateStr = formatInTimeZone(addDays(now, 90), TZ, 'yyyy-MM-dd');
  const newDateStr = formatInTimeZone(newStart, TZ, 'yyyy-MM-dd');

  if (newDateStr < todayStr)    return json({ error: 'Data no passado' }, 400);
  if (newDateStr > maxDateStr)  return json({ error: 'Data além do limite (90 dias)' }, 400);

  const apptRows = db
    .select({
      id:              appointments.id,
      barberId:        appointments.barberId,
      durationMinutes: appointments.durationMinutes,
      status:          appointments.status,
    })
    .from(appointments)
    .where(eq(appointments.id, id))
    .all();

  if (apptRows.length === 0) return json({ error: 'Agendamento não encontrado' }, 404);

  const appt = apptRows[0];

  // Barbeiro comum só pode reagendar os próprios; admin pode todos
  if (session.role !== 'admin' && appt.barberId !== session.barberId) {
    return json({ error: 'Sem permissão' }, 403);
  }

  if (appt.status !== 'confirmed') {
    return json({ error: `Não é possível reagendar (status: ${appt.status})` }, 409);
  }

  const newEnd = addMinutes(newStart, appt.durationMinutes);

  // Expediente do barbeiro
  const dow = weekdayOf(newDateStr);
  const whRows = db
    .select()
    .from(workingHours)
    .where(and(eq(workingHours.barberId, appt.barberId), eq(workingHours.weekday, dow)))
    .all();

  if (whRows.length === 0) {
    return json({ error: 'Barbeiro não trabalha nesse dia' }, 400);
  }

  // O slot precisa caber inteiro em ALGUMA janela do dia (manhã + tarde etc.).
  const fitsAnyWindow = whRows.some(wh => {
    const open  = fromZonedTime(`${newDateStr}T${wh.startTime}:00`, TZ);
    const close = fromZonedTime(`${newDateStr}T${wh.endTime}:00`,   TZ);
    return newStart >= open && newEnd <= close;
  });

  if (!fitsAnyWindow) {
    return json({ error: 'Horário fora do expediente do barbeiro' }, 400);
  }

  const newStartIso = newStart.toISOString();
  const newEndIso   = newEnd.toISOString();

  try {
    stmtBegin.run();

    const apptConflict = (stmtConflictAppt.get(appt.barberId, appt.id, newEndIso, newStartIso) as { c: number }).c;
    if (apptConflict > 0) {
      stmtRollback.run();
      return json({ error: 'Conflito com outro agendamento' }, 409);
    }

    const offConflict = (stmtConflictOff.get(appt.barberId, newEndIso, newStartIso) as { c: number }).c;
    if (offConflict > 0) {
      stmtRollback.run();
      return json({ error: 'Horário bloqueado' }, 409);
    }

    const result = stmtUpdate.run(newStartIso, newEndIso, session.barberId, new Date().toISOString(), appt.id);
    if (result.changes === 0) {
      stmtRollback.run();
      return json({ error: 'Agendamento não pôde ser atualizado' }, 409);
    }

    stmtCommit.run();

    return json({
      ok: true,
      startsAt:  newStartIso,
      endsAt:    newEndIso,
      dateLocal: formatInTimeZone(newStart, TZ, 'dd/MM/yyyy'),
      timeLocal: formatInTimeZone(newStart, TZ, 'HH:mm'),
    });
  } catch (err) {
    try { stmtRollback.run(); } catch { /* noop */ }
    console.error('[api/admin/appointments/:id/reschedule POST]', err);
    return json({ error: 'Erro interno ao reagendar' }, 500);
  }
};
