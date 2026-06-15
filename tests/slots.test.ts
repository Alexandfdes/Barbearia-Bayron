import { describe, it, expect } from 'vitest';
import { computeAvailableSlots, overlaps, type Busy } from '../src/lib/slotsCore';

// Expediente do dia em UTC: 12:00Z–15:00Z (= 09:00–12:00 em Fortaleza, UTC-3).
const open  = new Date('2026-06-08T12:00:00.000Z');
const close = new Date('2026-06-08T15:00:00.000Z');
// "Agora" bem antes do expediente, para não filtrar nada por estar no passado.
const past  = new Date('2026-06-08T00:00:00.000Z');

/** Date UTC → "HH:MM" (UTC) para asserções legíveis */
const hhmm = (d: Date) => d.toISOString().slice(11, 16);
const appt = (start: string, end: string): Busy => ({
  startsAt: new Date(`2026-06-08T${start}:00.000Z`),
  endsAt:   new Date(`2026-06-08T${end}:00.000Z`),
});

describe('computeAvailableSlots', () => {
  it('dia livre: gera a grade de 30 em 30 até caber a duração', () => {
    const slots = computeAvailableSlots({ open, close, durationMinutes: 30, appts: [], offs: [], now: past });
    expect(slots.map(hhmm)).toEqual(['12:00', '12:30', '13:00', '13:30', '14:00', '14:30']);
  });

  it('serviço mais longo deixa menos slots (não estoura o expediente)', () => {
    const slots = computeAvailableSlots({ open, close, durationMinutes: 60, appts: [], offs: [], now: past });
    // último que cabe começa 14:00 (termina 15:00)
    expect(slots.map(hhmm)).toEqual(['12:00', '12:30', '13:00', '13:30', '14:00']);
  });

  it('remove o slot que conflita com um agendamento', () => {
    const slots = computeAvailableSlots({ open, close, durationMinutes: 30, appts: [appt('12:00', '12:30')], offs: [], now: past });
    expect(slots.map(hhmm)).not.toContain('12:00');
    expect(slots.map(hhmm)).toEqual(['12:30', '13:00', '13:30', '14:00', '14:30']);
  });

  it('não devolve horário no passado', () => {
    const now = new Date('2026-06-08T13:00:00.000Z'); // 13:00Z
    const slots = computeAvailableSlots({ open, close, durationMinutes: 30, appts: [], offs: [], now });
    expect(slots.map(hhmm)).toEqual(['13:00', '13:30', '14:00', '14:30']);
  });

  it('respeita bloqueio (time_off)', () => {
    const slots = computeAvailableSlots({ open, close, durationMinutes: 30, appts: [], offs: [appt('13:00', '14:00')], now: past });
    expect(slots.map(hhmm)).toEqual(['12:00', '12:30', '14:00', '14:30']);
  });

  it('oferece encaixe logo após um agendamento fora da grade de 30', () => {
    // appt 12:00–12:45 → o encaixe às 12:45 aparece, que a grade de 30 não daria
    const slots = computeAvailableSlots({ open, close, durationMinutes: 30, appts: [appt('12:00', '12:45')], offs: [], now: past });
    expect(slots.map(hhmm)).toEqual(['12:45', '13:00', '13:30', '14:00', '14:30']);
  });

  it('não duplica quando o encaixe coincide com um slot da grade', () => {
    const slots = computeAvailableSlots({ open, close, durationMinutes: 30, appts: [appt('12:30', '13:00')], offs: [], now: past });
    const at13 = slots.map(hhmm).filter(t => t === '13:00');
    expect(at13).toHaveLength(1);
    expect(slots.map(hhmm)).toEqual(['12:00', '13:00', '13:30', '14:00', '14:30']);
  });

  it('expediente fechado (open===close) não gera slots', () => {
    const slots = computeAvailableSlots({ open, close: open, durationMinutes: 30, appts: [], offs: [], now: past });
    expect(slots).toEqual([]);
  });
});

describe('overlaps', () => {
  const d = (s: string) => new Date(`2026-06-08T${s}:00.000Z`);
  it('detecta sobreposição', () => {
    expect(overlaps(d('12:00'), d('12:30'), d('12:15'), d('12:45'))).toBe(true);
  });
  it('intervalos encostados não se sobrepõem', () => {
    expect(overlaps(d('12:00'), d('12:30'), d('12:30'), d('13:00'))).toBe(false);
  });
});
