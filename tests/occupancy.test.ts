import { describe, it, expect } from 'vitest';
import { computeOccupancy, pickEmptiestBand } from '../src/lib/occupancy';

// Terça 2026-06-16 (weekday 2). Fortaleza = UTC-3: 09:00 local = 12:00Z.
const DAY = { dateStr: '2026-06-16', weekday: 2 };
const WH_FULL = [{ barberId: 1, weekday: 2, startTime: '09:00', endTime: '20:00' }];

function bandOf(occ: ReturnType<typeof computeOccupancy>, key: string) {
  return occ.find(o => o.bandKey === key)!;
}

describe('computeOccupancy', () => {
  it('semana vazia → 100% livre, disponibilidade = expediente ∩ faixa', () => {
    const occ = computeOccupancy({ days: [DAY], workingHours: WH_FULL, timeOff: [], appointments: [] });
    expect(bandOf(occ, 'manha')).toMatchObject({ availableMin: 240, bookedMin: 0, freePct: 100 });
    expect(bandOf(occ, 'tarde')).toMatchObject({ availableMin: 240, freePct: 100 });
    expect(bandOf(occ, 'fim')).toMatchObject({ availableMin: 180, freePct: 100 });
  });

  it('agendamento de 60min na manhã → 75% livre (60/240 ocupado)', () => {
    const occ = computeOccupancy({
      days: [DAY], workingHours: WH_FULL, timeOff: [],
      // 10:00–11:00 local = 13:00–14:00Z
      appointments: [{ barberId: 1, startsAt: '2026-06-16T13:00:00.000Z', endsAt: '2026-06-16T14:00:00.000Z' }],
    });
    expect(bandOf(occ, 'manha')).toMatchObject({ bookedMin: 60, freePct: 75 });
    expect(bandOf(occ, 'tarde').freePct).toBe(100);
  });

  it('agendamento cruzando faixas é repartido entre elas', () => {
    const occ = computeOccupancy({
      days: [DAY], workingHours: WH_FULL, timeOff: [],
      // 12:30–13:30 local = 15:30–16:30Z → 30min na manhã, 30min na tarde
      appointments: [{ barberId: 1, startsAt: '2026-06-16T15:30:00.000Z', endsAt: '2026-06-16T16:30:00.000Z' }],
    });
    expect(bandOf(occ, 'manha').bookedMin).toBe(30);
    expect(bandOf(occ, 'tarde').bookedMin).toBe(30);
  });

  it('time_off reduz o disponível', () => {
    const occ = computeOccupancy({
      days: [DAY], workingHours: WH_FULL,
      // almoço 12:00–13:00 local = 15:00–16:00Z, dentro da manhã (9–13)
      timeOff: [{ barberId: 1, startsAt: '2026-06-16T15:00:00.000Z', endsAt: '2026-06-16T16:00:00.000Z' }],
      appointments: [],
    });
    expect(bandOf(occ, 'manha').availableMin).toBe(180);
  });

  it('time_off com barberId null (feriado) vale para todos os barbeiros', () => {
    const wh2 = [...WH_FULL, { barberId: 2, weekday: 2, startTime: '09:00', endTime: '20:00' }];
    const occ = computeOccupancy({
      days: [DAY], workingHours: wh2,
      // dia inteiro bloqueado: 09:00–20:00 local = 12:00–23:00Z
      timeOff: [{ barberId: null, startsAt: '2026-06-16T12:00:00.000Z', endsAt: '2026-06-16T23:00:00.000Z' }],
      appointments: [],
    });
    expect(bandOf(occ, 'manha').availableMin).toBe(0);
    expect(bandOf(occ, 'manha').freePct).toBe(0); // sem disponibilidade → 0, não 100
  });

  it('sábado com expediente até 18:00 → faixa "fim do dia" só tem 60min', () => {
    const occ = computeOccupancy({
      days: [{ dateStr: '2026-06-13', weekday: 6 }],
      workingHours: [{ barberId: 1, weekday: 6, startTime: '09:00', endTime: '18:00' }],
      timeOff: [], appointments: [],
    });
    expect(bandOf(occ, 'fim').availableMin).toBe(60);
  });

  it('dois barbeiros somam disponibilidade', () => {
    const wh2 = [...WH_FULL, { barberId: 2, weekday: 2, startTime: '09:00', endTime: '20:00' }];
    const occ = computeOccupancy({ days: [DAY], workingHours: wh2, timeOff: [], appointments: [] });
    expect(bandOf(occ, 'manha').availableMin).toBe(480);
  });

  it('clampa em 0% quando superlotado', () => {
    const occ = computeOccupancy({
      days: [DAY],
      workingHours: [{ barberId: 1, weekday: 2, startTime: '09:00', endTime: '10:00' }],
      timeOff: [{ barberId: 1, startsAt: '2026-06-16T12:00:00.000Z', endsAt: '2026-06-16T12:30:00.000Z' }],
      // 09:00–10:00 local inteiro agendado, mas avail = 30 por causa do time_off
      appointments: [{ barberId: 1, startsAt: '2026-06-16T12:00:00.000Z', endsAt: '2026-06-16T13:00:00.000Z' }],
    });
    expect(bandOf(occ, 'manha').freePct).toBe(0);
  });
});

describe('pickEmptiestBand', () => {
  const base = { weekday: 2, bandKey: 'manha', bandLabel: 'de manhã', bookedMin: 0 };
  it('escolhe a faixa mais livre acima dos thresholds', () => {
    const pick = pickEmptiestBand([
      { ...base, dateStr: '2026-06-16', availableMin: 240, freePct: 60 },
      { ...base, dateStr: '2026-06-17', availableMin: 240, freePct: 90 },
    ]);
    expect(pick?.dateStr).toBe('2026-06-17');
  });
  it('ignora faixas com pouca disponibilidade ou pouco vazias', () => {
    const pick = pickEmptiestBand([
      { ...base, dateStr: '2026-06-16', availableMin: 60,  freePct: 100 }, // avail < 120
      { ...base, dateStr: '2026-06-17', availableMin: 240, freePct: 30 },  // < 50% livre
    ]);
    expect(pick).toBeNull();
  });
  it('empate de % → data mais próxima', () => {
    const pick = pickEmptiestBand([
      { ...base, dateStr: '2026-06-18', availableMin: 240, freePct: 80 },
      { ...base, dateStr: '2026-06-16', availableMin: 240, freePct: 80 },
    ]);
    expect(pick?.dateStr).toBe('2026-06-16');
  });
  it('empate total → preserva ordem das faixas (manhã vence)', () => {
    const pick = pickEmptiestBand([
      { ...base, dateStr: '2026-06-16', bandKey: 'manha', bandLabel: 'de manhã',      availableMin: 240, freePct: 100 },
      { ...base, dateStr: '2026-06-16', bandKey: 'tarde', bandLabel: 'à tarde',       availableMin: 240, freePct: 100 },
      { ...base, dateStr: '2026-06-16', bandKey: 'fim',   bandLabel: 'no fim do dia', availableMin: 180, freePct: 100 },
    ]);
    expect(pick?.bandKey).toBe('manha');
  });
});
