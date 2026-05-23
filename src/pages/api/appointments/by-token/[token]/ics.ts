export const prerender = false;

import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '../../../../../db/index.js';
import { appointments, barbers, services } from '../../../../../db/schema.js';
import { ADDRESS } from '../../../../../config.js';

const TZ = 'America/Fortaleza';
const SITE_HOST = 'bayron.alexandrefdev.tech';

function toIcsDate(isoStr: string): string {
  return new Date(isoStr).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [line.slice(0, 75)];
  let i = 75;
  while (i < line.length) {
    out.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return out.join('\r\n');
}

export const GET: APIRoute = ({ params }) => {
  const { token } = params;
  if (!token) return new Response(null, { status: 400 });

  const rows = db
    .select({
      id:           appointments.id,
      status:       appointments.status,
      startsAt:     appointments.startsAt,
      endsAt:       appointments.endsAt,
      customerName: appointments.customerName,
      barberName:   barbers.name,
      serviceName:  services.name,
    })
    .from(appointments)
    .innerJoin(barbers,  eq(barbers.id,  appointments.barberId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(eq(appointments.manageToken, token))
    .all();

  if (rows.length === 0) return new Response(null, { status: 404 });

  const appt = rows[0];
  if (appt.status !== 'confirmed') return new Response(null, { status: 410 });

  const now      = toIcsDate(new Date().toISOString());
  const start    = toIcsDate(appt.startsAt);
  const end      = toIcsDate(appt.endsAt);
  const uid      = `appointment-${appt.id}@${SITE_HOST}`;
  const url      = `https://${SITE_HOST}/a/${token}`;
  const summary  = icsEscape(`${appt.serviceName} com ${appt.barberName} — Barbearia Bayron`);
  const location = icsEscape(`${ADDRESS.street} — ${ADDRESS.city}`);
  const description = icsEscape(`Cliente: ${appt.customerName}\nLink: ${url}`);
  const filename = `bayron-${formatInTimeZone(new Date(appt.startsAt), TZ, 'yyyyMMdd-HHmm')}.ics`;

  const CRLF = '\r\n';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'PRODID:-//Barbearia Bayron//Agendamento//PT-BR',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    foldLine(`SUMMARY:${summary}`),
    foldLine(`LOCATION:${location}`),
    foldLine(`DESCRIPTION:${description}`),
    foldLine(`URL:${url}`),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return new Response(lines.join(CRLF) + CRLF, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
};
