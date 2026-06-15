// Teste de INTEGRAÇÃO: usa um SQLite real (better-sqlite3) em memória.
// Por depender do binário nativo, roda na máquina do dev (`npm test`), não num
// CI sem build nativo. O DATABASE_PATH é setado para ':memory:' ANTES de importar
// o módulo de banco (que cria a conexão no import), por isso usamos import dinâmico.
import { describe, it, expect, beforeAll } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';

const TZ = 'America/Fortaleza';
const DATE = '2030-03-15';                                   // data futura fixa
const WEEKDAY = new Date(Date.UTC(2030, 2, 15, 12)).getUTCDay(); // dia da semana de 15/03/2030
const OTHER_DATE = '2030-03-16';                             // dia seguinte (outro weekday, sem expediente)
const SPLIT_DATE = '2030-03-18';                             // dia com DOIS turnos (manhã + tarde)
const SPLIT_WEEKDAY = new Date(Date.UTC(2030, 2, 18, 12)).getUTCDay();

type BookFn = typeof import('../src/lib/bookAppointment')['bookAppointment'];
let bookAppointment: BookFn;

const at = (time: string, date = DATE) => fromZonedTime(`${date}T${time}:00`, TZ);
const base = {
  barberId: 1, serviceId: 1,
  customerName: 'João', customerPhone: '84999990000',
  customerBirthdate: '1990-01-01', createdBy: 'customer' as const,
};

beforeAll(async () => {
  process.env.DATABASE_PATH = ':memory:';

  const { db, sqlite } = await import('../src/db/index');
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
  migrate(db, { migrationsFolder: 'drizzle' });

  sqlite.prepare(`INSERT INTO barbers (id, name, slug, role, password_hash, active) VALUES (1,'Teste','teste','barber','x',1)`).run();
  sqlite.prepare(`INSERT INTO services (id, name, slug, price_cents, active) VALUES (1,'Corte','corte',4500,1)`).run();
  sqlite.prepare(`INSERT INTO barber_services (barber_id, service_id, duration_minutes, active) VALUES (1,1,30,1)`).run();
  // Expediente só no weekday da DATE: 09:00–18:00
  sqlite.prepare(`INSERT INTO working_hours (barber_id, weekday, start_time, end_time) VALUES (1, ?, '09:00','18:00')`).run(WEEKDAY);
  // SPLIT_WEEKDAY tem dois turnos: 09:00–12:00 e 14:00–18:00
  sqlite.prepare(`INSERT INTO working_hours (barber_id, weekday, start_time, end_time) VALUES (1, ?, '09:00','12:00')`).run(SPLIT_WEEKDAY);
  sqlite.prepare(`INSERT INTO working_hours (barber_id, weekday, start_time, end_time) VALUES (1, ?, '14:00','18:00')`).run(SPLIT_WEEKDAY);

  // Importa só depois das tabelas existirem (o módulo prepara statements no import)
  ({ bookAppointment } = await import('../src/lib/bookAppointment'));
});

describe('bookAppointment (integração com SQLite)', () => {
  it('cria um agendamento válido dentro do expediente', () => {
    const r = bookAppointment({ ...base, startsAt: at('10:00') });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.manageToken).toBeTruthy();
      expect(r.priceCents).toBe(4500);
      expect(r.durationMinutes).toBe(30);
      expect(r.status).toBe('confirmed');
    }
  });

  it('rejeita conflito de horário (409)', () => {
    const ok = bookAppointment({ ...base, startsAt: at('14:00') });
    expect(ok.ok).toBe(true);
    // tenta encaixar em cima do horário recém-criado
    const conflict = bookAppointment({ ...base, startsAt: at('14:15') });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.httpStatus).toBe(409);
  });

  it('idempotência: mesma chave não cria duplicado', () => {
    const params = { ...base, startsAt: at('11:00'), idempotencyKey: 'chave-unica-123' };
    const first  = bookAppointment(params);
    const second = bookAppointment(params);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.id).toBe(first.id);
      expect(second.manageToken).toBe(first.manageToken);
    }
  });

  it('rejeita horário fora do expediente (400)', () => {
    const r = bookAppointment({ ...base, startsAt: at('19:00') }); // 19:00 + 30 passa das 18:00
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(400);
  });

  it('rejeita dia em que o barbeiro não trabalha (400)', () => {
    const r = bookAppointment({ ...base, startsAt: at('10:00', OTHER_DATE) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(400);
  });

  it('rejeita barbeiro/serviço inexistente (404)', () => {
    const r = bookAppointment({ ...base, serviceId: 999, startsAt: at('12:00') });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(404);
  });

  it('armazena o telefone normalizado (só dígitos), mesmo recebendo com máscara', async () => {
    const { sqlite } = await import('../src/db/index');
    const r = bookAppointment({ ...base, customerPhone: '+55 (84) 91234-5678', startsAt: at('16:00') });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const row = sqlite.prepare('SELECT customer_phone FROM appointments WHERE id = ?').get(r.id) as { customer_phone: string };
      expect(row.customer_phone).toBe('84912345678');
    }
  });

  it('rejeita telefone com menos de 10 dígitos (400)', () => {
    const r = bookAppointment({ ...base, customerPhone: '9123-4567', startsAt: at('17:00') });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(400);
  });

  it('dia com dois turnos: aceita slot no segundo turno', () => {
    const r = bookAppointment({ ...base, startsAt: at('15:00', SPLIT_DATE) });
    expect(r.ok).toBe(true);
  });

  it('dia com dois turnos: rejeita slot no intervalo entre turnos (400)', () => {
    const r = bookAppointment({ ...base, startsAt: at('12:30', SPLIT_DATE) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(400);
  });
});
