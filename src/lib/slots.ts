import { db } from '../db/index.js';
import { barberServices, workingHours, appointments, timeOff } from '../db/schema.js';
import { eq, and, or, isNull, gte, lt, gt, ne } from 'drizzle-orm';
import { addMinutes } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

const TZ = 'America/Fortaleza';

/** Combina "YYYY-MM-DD" + "HH:MM" no fuso de Fortaleza e devolve Date UTC */
function localToUtc(dateStr: string, timeStr: string): Date {
  return fromZonedTime(`${dateStr}T${timeStr}:00`, TZ);
}

/** Dia da semana (0=dom…6=sáb) a partir de "YYYY-MM-DD" */
function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getDay();
}

/** Verifica se os intervalos [aStart, aEnd) e [bStart, bEnd) se sobrepõem */
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Retorna os horários disponíveis para um barbeiro/serviço/data.
 * @param barberId            ID do barbeiro
 * @param serviceId           ID do serviço
 * @param dateStr             Data no formato "YYYY-MM-DD" (fuso horário de Fortaleza)
 * @param excludeAppointmentId Se informado, ignora esse appointment no cálculo de conflitos
 *                            (usado em reagendamentos: o cliente não deve conflitar consigo mesmo).
 * @returns                   Array de Date (UTC) ordenado e sem duplicatas
 */
export function getAvailableSlots(
  barberId: number,
  serviceId: number,
  dateStr: string,
  excludeAppointmentId?: number
): Date[] {
  const bsRows = db
    .select({ durationMinutes: barberServices.durationMinutes })
    .from(barberServices)
    .where(
      and(
        eq(barberServices.barberId, barberId),
        eq(barberServices.serviceId, serviceId),
        eq(barberServices.active, true)
      )
    )
    .all();

  if (bsRows.length === 0) return [];
  const duration = bsRows[0].durationMinutes;

  const dow = weekdayOf(dateStr);
  const whRows = db
    .select()
    .from(workingHours)
    .where(
      and(
        eq(workingHours.barberId, barberId),
        eq(workingHours.weekday, dow)
      )
    )
    .all();

  if (whRows.length === 0) return [];

  const open  = localToUtc(dateStr, whRows[0].startTime);
  const close = localToUtc(dateStr, whRows[0].endTime);
  const openIso  = open.toISOString();
  const closeIso = close.toISOString();

  const apptWhere = excludeAppointmentId
    ? and(
        eq(appointments.barberId, barberId),
        gte(appointments.startsAt, openIso),
        lt(appointments.startsAt, closeIso),
        or(
          eq(appointments.status, 'confirmed'),
          eq(appointments.status, 'completed')
        ),
        ne(appointments.id, excludeAppointmentId)
      )
    : and(
        eq(appointments.barberId, barberId),
        gte(appointments.startsAt, openIso),
        lt(appointments.startsAt, closeIso),
        or(
          eq(appointments.status, 'confirmed'),
          eq(appointments.status, 'completed')
        )
      );

  const appts = db
    .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt })
    .from(appointments)
    .where(apptWhere)
    .all()
    .map(r => ({ startsAt: new Date(r.startsAt), endsAt: new Date(r.endsAt) }));

  const offs = db
    .select({ startsAt: timeOff.startsAt, endsAt: timeOff.endsAt })
    .from(timeOff)
    .where(
      and(
        or(eq(timeOff.barberId, barberId), isNull(timeOff.barberId)),
        lt(timeOff.startsAt, closeIso),
        gt(timeOff.endsAt, openIso)
      )
    )
    .all()
    .map(r => ({ startsAt: new Date(r.startsAt), endsAt: new Date(r.endsAt) }));

  const candidates: Date[] = [];
  let cursor = new Date(open);
  while (addMinutes(cursor, duration) <= close) {
    candidates.push(new Date(cursor));
    cursor = addMinutes(cursor, 30);
  }
  for (const appt of appts) {
    if (addMinutes(appt.endsAt, duration) <= close) {
      candidates.push(new Date(appt.endsAt));
    }
  }

  const now = new Date();
  const valid: Date[] = [];

  for (const slot of candidates) {
    if (slot < now) continue;
    const slotEnd = addMinutes(slot, duration);
    let conflict = false;

    for (const appt of appts) {
      if (overlaps(slot, slotEnd, appt.startsAt, appt.endsAt)) { conflict = true; break; }
    }
    if (conflict) continue;

    for (const off of offs) {
      if (overlaps(slot, slotEnd, off.startsAt, off.endsAt)) { conflict = true; break; }
    }
    if (conflict) continue;

    valid.push(slot);
  }

  const seen = new Set<number>();
  const result: Date[] = [];
  for (const slot of valid.sort((a, b) => a.getTime() - b.getTime())) {
    if (!seen.has(slot.getTime())) {
      seen.add(slot.getTime());
      result.push(slot);
    }
  }

  return result;
}
