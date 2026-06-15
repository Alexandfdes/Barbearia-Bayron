/**
 * Cálculo de ocupação por dia × faixa horária — função pura, sem acesso a banco.
 *
 * Usado pelo card de insight do /admin/dia ("terça de manhã está 80% vazia").
 * Disponível = (working_hours ∩ faixa) − time_off, somado por barbeiro.
 * Ocupado   = agendamentos confirmados ∩ (working_hours ∩ faixa).
 *
 * Limitação conhecida: time_offs sobrepostos entre si são descontados em dobro
 * (caso raro; a UI de bloqueio não incentiva sobreposição).
 */

export interface OccBand {
  key: string;
  /** rótulo já no formato da frase: "de manhã", "à tarde", "no fim do dia" */
  label: string;
  startMin: number; // minutos locais desde 00:00
  endMin: number;
}

export const DEFAULT_BANDS: OccBand[] = [
  { key: 'manha', label: 'de manhã',     startMin: 9 * 60,  endMin: 13 * 60 },
  { key: 'tarde', label: 'à tarde',      startMin: 13 * 60, endMin: 17 * 60 },
  { key: 'fim',   label: 'no fim do dia', startMin: 17 * 60, endMin: 20 * 60 },
];

export interface OccDay {
  dateStr: string; // YYYY-MM-DD local
  weekday: number; // 0=dom..6=sáb
}

export interface DayBandOccupancy {
  dateStr: string;
  weekday: number;
  bandKey: string;
  bandLabel: string;
  availableMin: number;
  bookedMin: number;
  /** 0–100, % do tempo disponível ainda livre */
  freePct: number;
}

interface Params {
  days: OccDay[];
  workingHours: { barberId: number; weekday: number; startTime: string; endTime: string }[];
  timeOff: { barberId: number | null; startsAt: string; endsAt: string }[];
  appointments: { barberId: number; startsAt: string; endsAt: string }[];
  bands?: OccBand[];
  /** offset local em minutos relativo a UTC. Fortaleza (sem horário de verão) = -180 */
  utcOffsetMin?: number;
}

function hmToMin(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function overlapMs(aS: number, aE: number, bS: number, bE: number): number {
  return Math.max(0, Math.min(aE, bE) - Math.max(aS, bS));
}

export function computeOccupancy(params: Params): DayBandOccupancy[] {
  const bands = params.bands ?? DEFAULT_BANDS;
  const utcOffsetMin = params.utcOffsetMin ?? -180;

  // epoch UTC (ms) de um horário local (minutos) numa data local
  function epoch(dateStr: string, minLocal: number): number {
    const [y, mo, d] = dateStr.split('-').map(Number);
    return Date.UTC(y, mo - 1, d, 0, 0) + (minLocal - utcOffsetMin) * 60_000;
  }

  const timeOffParsed = params.timeOff.map(t => ({
    barberId: t.barberId,
    s: Date.parse(t.startsAt),
    e: Date.parse(t.endsAt),
  }));
  const apptsParsed = params.appointments.map(a => ({
    barberId: a.barberId,
    s: Date.parse(a.startsAt),
    e: Date.parse(a.endsAt),
  }));

  const out: DayBandOccupancy[] = [];

  for (const day of params.days) {
    const whToday = params.workingHours.filter(w => w.weekday === day.weekday);
    for (const band of bands) {
      let availableMin = 0;
      let bookedMin = 0;

      for (const wh of whToday) {
        const segS = Math.max(hmToMin(wh.startTime), band.startMin);
        const segE = Math.min(hmToMin(wh.endTime),   band.endMin);
        if (segE <= segS) continue;

        const segSU = epoch(day.dateStr, segS);
        const segEU = epoch(day.dateStr, segE);

        let segAvail = segE - segS;
        for (const t of timeOffParsed) {
          if (t.barberId !== null && t.barberId !== wh.barberId) continue;
          segAvail -= overlapMs(segSU, segEU, t.s, t.e) / 60_000;
        }
        availableMin += Math.max(0, segAvail);

        for (const a of apptsParsed) {
          if (a.barberId !== wh.barberId) continue;
          bookedMin += overlapMs(segSU, segEU, a.s, a.e) / 60_000;
        }
      }

      const freePct = availableMin > 0
        ? Math.max(0, Math.min(100, Math.round(100 * (1 - bookedMin / availableMin))))
        : 0;

      out.push({
        dateStr:  day.dateStr,
        weekday:  day.weekday,
        bandKey:  band.key,
        bandLabel: band.label,
        availableMin: Math.round(availableMin),
        bookedMin:    Math.round(bookedMin),
        freePct,
      });
    }
  }
  return out;
}

/**
 * Escolhe a faixa mais vazia que valha uma promoção:
 * pelo menos `minAvailableMin` disponíveis e pelo menos `minFreePct`% livre.
 * Empate → a data mais próxima.
 */
export function pickEmptiestBand(
  occ: DayBandOccupancy[],
  opts: { minAvailableMin?: number; minFreePct?: number } = {},
): DayBandOccupancy | null {
  const minAvail = opts.minAvailableMin ?? 120;
  const minFree  = opts.minFreePct ?? 50;
  const candidates = occ.filter(o => o.availableMin >= minAvail && o.freePct >= minFree);
  if (candidates.length === 0) return null;
  // sort é estável: empate total preserva a ordem de inserção (manhã → tarde → fim),
  // então a manhã vence o empate — faixa melhor pra promoção.
  candidates.sort((a, b) =>
    b.freePct - a.freePct ||
    a.dateStr.localeCompare(b.dateStr)
  );
  return candidates[0];
}
