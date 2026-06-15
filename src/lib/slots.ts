import { db } from '../db/index.js';
import { barberServices, workingHours, appointments, timeOff } from '../db/schema.js';
import { eq, and, or, isNull, gte, lt, gt, ne } from 'drizzle-orm';
import { fromZonedTime } from 'date-fns-tz';
import { computeAvailableSlots } from './slotsCore.js';

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

/**
 * Retorna os horários disponíveis para um barbeiro/serviço/data.
 * Faz a leitura do banco e delega o cálculo para computeAvailableSlots (puro).
 * @param barberId             ID do barbeiro
 * @param serviceId            ID do serviço
 * @param dateStr              Data "YYYY-MM-DD" (fuso de Fortaleza)
 * @param excludeAppointmentId Ignora esse appointment no cálculo (reagendamento)
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

  // O schema permite mais de uma janela de expediente por dia (ex: manhã + tarde).
  // Calcula slots por janela e junta tudo ordenado.
  const allSlots: Date[] = [];
  for (const wh of whRows) {
    allSlots.push(...slotsForWindow(barberId, dateStr, wh.startTime, wh.endTime, duration, excludeAppointmentId));
  }
  return [...new Map(allSlots.map(s => [s.getTime(), s])).values()]
    .sort((a, b) => a.getTime() - b.getTime());
}

function slotsForWindow(
  barberId: number,
  dateStr: string,
  startTime: string,
  endTime: string,
  duration: number,
  excludeAppointmentId?: number
): Date[] {
  const open  = localToUtc(dateStr, startTime);
  const close = localToUtc(dateStr, endTime);
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

  return computeAvailableSlots({ open, close, durationMinutes: duration, appts, offs });
}
