import { randomBytes } from 'node:crypto';
import { addMinutes } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { and, eq } from 'drizzle-orm';
import { db, sqlite } from '../db/index.js';
import { barbers, barberServices, services, workingHours } from '../db/schema.js';

const TZ = 'America/Fortaleza';

function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getDay();
}

const stmtConflictAppt = sqlite.prepare(`
  SELECT COUNT(*) as c FROM appointments
  WHERE barber_id = ? AND status IN ('confirmed','completed')
  AND starts_at < ? AND ends_at > ?
`);
const stmtConflictOff = sqlite.prepare(`
  SELECT COUNT(*) as c FROM time_off
  WHERE (barber_id = ? OR barber_id IS NULL)
  AND starts_at < ? AND ends_at > ?
`);
const stmtInsert = sqlite.prepare(`
  INSERT INTO appointments
    (barber_id, service_id, customer_name, customer_phone,
     starts_at, ends_at, duration_minutes, price_cents,
     manage_token, created_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const stmtBegin    = sqlite.prepare('BEGIN IMMEDIATE');
const stmtCommit   = sqlite.prepare('COMMIT');
const stmtRollback = sqlite.prepare('ROLLBACK');

export interface BookParams {
  barberId:      number;
  serviceId:     number;
  customerName:  string;
  customerPhone: string;
  startsAt:      Date;
  createdBy:     'customer' | 'barber';
}

export type BookResult =
  | { ok: true;  id: number | bigint; manageToken: string; status: string;
      startsAt: string; endsAt: string; durationMinutes: number; priceCents: number;
      customerName: string; barberName: string; serviceName: string }
  | { ok: false; httpStatus: number; error: string };

export function bookAppointment(params: BookParams): BookResult {
  const { barberId, serviceId, customerName, customerPhone, startsAt, createdBy } = params;

  const bsRows = db
    .select({
      durationMinutes: barberServices.durationMinutes,
      priceCents:      services.priceCents,
      barberName:      barbers.name,
      serviceName:     services.name,
    })
    .from(barberServices)
    .innerJoin(services, eq(services.id, barberServices.serviceId))
    .innerJoin(barbers,  eq(barbers.id,  barberServices.barberId))
    .where(and(
      eq(barberServices.barberId,  barberId),
      eq(barberServices.serviceId, serviceId),
      eq(barberServices.active,    true),
      eq(barbers.active,           true),
      eq(services.active,          true),
    ))
    .all();

  if (bsRows.length === 0) {
    return { ok: false, httpStatus: 404, error: 'Barbeiro ou serviço não encontrado' };
  }

  const { durationMinutes, priceCents, barberName, serviceName } = bsRows[0];
  const endsAt  = addMinutes(startsAt, durationMinutes);
  const dateStr = startsAt.toISOString().slice(0, 10);
  const dow     = weekdayOf(dateStr);

  const whRows = db
    .select()
    .from(workingHours)
    .where(and(eq(workingHours.barberId, barberId), eq(workingHours.weekday, dow)))
    .all();

  if (whRows.length === 0) {
    return { ok: false, httpStatus: 400, error: 'Barbeiro não trabalha nesse dia' };
  }

  const open  = fromZonedTime(`${dateStr}T${whRows[0].startTime}:00`, TZ);
  const close = fromZonedTime(`${dateStr}T${whRows[0].endTime}:00`,   TZ);

  if (startsAt < open || endsAt > close) {
    return { ok: false, httpStatus: 400, error: 'Horário fora do expediente' };
  }

  const startsAtIso = startsAt.toISOString();
  const endsAtIso   = endsAt.toISOString();
  const manageToken = randomBytes(18).toString('base64url');

  try {
    stmtBegin.run();

    const apptConflict = (stmtConflictAppt.get(barberId, endsAtIso, startsAtIso) as { c: number }).c;
    if (apptConflict > 0) {
      stmtRollback.run();
      return { ok: false, httpStatus: 409, error: 'Horário não está mais disponível' };
    }

    const offConflict = (stmtConflictOff.get(barberId, endsAtIso, startsAtIso) as { c: number }).c;
    if (offConflict > 0) {
      stmtRollback.run();
      return { ok: false, httpStatus: 409, error: 'Horário bloqueado' };
    }

    const result = stmtInsert.run(
      barberId, serviceId, customerName, customerPhone,
      startsAtIso, endsAtIso, durationMinutes, priceCents, manageToken, createdBy
    );
    stmtCommit.run();

    return {
      ok: true,
      id: result.lastInsertRowid,
      manageToken,
      status: 'confirmed',
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      durationMinutes,
      priceCents,
      customerName,
      barberName,
      serviceName,
    };
  } catch (err) {
    try { stmtRollback.run(); } catch { /* noop */ }
    throw err;
  }
}
