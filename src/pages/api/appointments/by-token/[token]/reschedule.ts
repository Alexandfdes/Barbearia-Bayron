export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { addDays, addMinutes } from 'date-fns';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { db, sqlite } from '../../../../../db/index.js';
import { appointments, workingHours } from '../../../../../db/schema.js';
import { and } from 'drizzle-orm';
import { json } from '../../../../../lib/api.js';

const TZ = 'America/Fortaleza';

const bodySchema = z.object({
  startsAt: z.string().refine(s => !isNaN(new Date(s).getTime()), 'Data/hora inválida'),
});

// SQL bruto para a transação atômica de re-check + update
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
     SET starts_at = ?, ends_at = ?
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
  const { token } = params;
  if (!token) return json({ error: 'Token inválido' }, 400);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const newStart = new Date(parsed.data.startsAt);

  // Limites de janela
  const now        = new Date();
  const todayStr   = formatInTimeZone(now, TZ, 'yyyy-MM-dd');
  const maxDateStr = formatInTimeZone(addDays(now, 30), TZ, 'yyyy-MM-dd');
  const newDateStr = formatInTimeZone(newStart, TZ, 'yyyy-MM-dd');

  if (newStart < now)           return json({ error: 'Não é possível reagendar para o passado' }, 400);
  if (newDateStr < todayStr)    return json({ error: 'Data no passado' }, 400);
  if (newDateStr > maxDateStr)  return json({ error: 'Data além do limite de 30 dias' }, 400);

  // Busca o agendamento
  const apptRows = db
    .select({
      id:              appointments.id,
      barberId:        appointments.barberId,
      durationMinutes: appointments.durationMinutes,
      status:          appointments.status,
      startsAt:        appointments.startsAt,
    })
    .from(appointments)
    .where(eq(appointments.manageToken, token))
    .all();

  if (apptRows.length === 0) return json({ error: 'Agendamento não encontrado' }, 404);

  const appt = apptRows[0];
  if (appt.status !== 'confirmed') {
    return json({ error: `Não é possível reagendar (status: ${appt.status})` }, 409);
  }

  // Calcula novo fim
  const newEnd = addMinutes(newStart, appt.durationMinutes);

  // Verifica expediente do barbeiro pra esse dia da semana
  const dow = weekdayOf(newDateStr);
  const whRows = db
    .select()
    .from(workingHours)
    .where(and(eq(workingHours.barberId, appt.barberId), eq(workingHours.weekday, dow)))
    .all();

  if (whRows.length === 0) {
    return json({ error: 'Barbeiro não trabalha nesse dia' }, 400);
  }

  // O slot precisa caber inteiro em ALGUMA janela do dia (o dia pode ter mais de
  // um turno: manhã + tarde). Mesma regra do bookAppointment.
  const fitsAnyWindow = whRows.some(wh => {
    const open  = fromZonedTime(`${newDateStr}T${wh.startTime}:00`, TZ);
    const close = fromZonedTime(`${newDateStr}T${wh.endTime}:00`,   TZ);
    return newStart >= open && newEnd <= close;
  });

  if (!fitsAnyWindow) {
    return json({ error: 'Horário fora do expediente' }, 400);
  }

  const newStartIso = newStart.toISOString();
  const newEndIso   = newEnd.toISOString();

  // Transação atômica com re-check de conflitos
  try {
    stmtBegin.run();

    const apptConflict = (stmtConflictAppt.get(appt.barberId, appt.id, newEndIso, newStartIso) as { c: number }).c;
    if (apptConflict > 0) {
      stmtRollback.run();
      return json({ error: 'Horário não está mais disponível' }, 409);
    }

    const offConflict = (stmtConflictOff.get(appt.barberId, newEndIso, newStartIso) as { c: number }).c;
    if (offConflict > 0) {
      stmtRollback.run();
      return json({ error: 'Horário bloqueado' }, 409);
    }

    const result = stmtUpdate.run(newStartIso, newEndIso, appt.id);
    if (result.changes === 0) {
      // Outro processo mudou o status entre o SELECT e o UPDATE
      stmtRollback.run();
      return json({ error: 'Agendamento não pode mais ser reagendado' }, 409);
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
    console.error('[api/appointments/by-token/reschedule POST]', err);
    return json({ error: 'Erro interno ao reagendar' }, 500);
  }
};
