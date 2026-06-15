import { describe, it, expect } from 'vitest';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

const TZ = 'America/Fortaleza'; // UTC-3, sem horário de verão

describe('fuso de Fortaleza (premissa do agendamento)', () => {
  it('hora local → UTC soma 3 horas', () => {
    const utc = fromZonedTime('2026-06-08T09:00:00', TZ);
    expect(utc.toISOString()).toBe('2026-06-08T12:00:00.000Z');
  });

  it('UTC → hora local subtrai 3 horas', () => {
    const local = formatInTimeZone(new Date('2026-06-08T12:00:00.000Z'), TZ, 'HH:mm');
    expect(local).toBe('09:00');
  });

  it('NÃO tem horário de verão (offset igual no verão e no inverno)', () => {
    const verao   = fromZonedTime('2026-01-15T09:00:00', TZ).toISOString();
    const inverno = fromZonedTime('2026-07-15T09:00:00', TZ).toISOString();
    expect(verao).toBe('2026-01-15T12:00:00.000Z');
    expect(inverno).toBe('2026-07-15T12:00:00.000Z');
  });

  it('vira o dia corretamente perto da meia-noite local', () => {
    // 23:00 local de 08/06 = 02:00 UTC de 09/06
    const utc = fromZonedTime('2026-06-08T23:00:00', TZ);
    expect(utc.toISOString()).toBe('2026-06-09T02:00:00.000Z');
    // de volta: 02:00Z de 09/06 → 23:00 de 08/06 local
    expect(formatInTimeZone(utc, TZ, 'yyyy-MM-dd HH:mm')).toBe('2026-06-08 23:00');
  });
});
