import { addMinutes } from 'date-fns';

/** Intervalos de tempo (UTC) ocupados — agendamentos ou bloqueios. */
export interface Busy {
  startsAt: Date;
  endsAt: Date;
}

export interface SlotInput {
  /** Abertura do expediente nesse dia (UTC) */
  open: Date;
  /** Fechamento do expediente nesse dia (UTC) */
  close: Date;
  /** Duração do serviço em minutos */
  durationMinutes: number;
  /** Agendamentos que ocupam a cadeira */
  appts: Busy[];
  /** Bloqueios (time_off) */
  offs: Busy[];
  /** "Agora" — injetável para testes determinísticos. Default: new Date() */
  now?: Date;
}

/** Os intervalos [aStart, aEnd) e [bStart, bEnd) se sobrepõem? */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Lógica pura de geração de horários disponíveis — SEM acesso ao banco, por isso
 * testável de forma isolada e determinística (passando `now`).
 *
 * Gera candidatos de 30 em 30 min entre abertura e fechamento, mais "encaixes"
 * logo após o fim de cada agendamento; descarta os que estão no passado,
 * conflitam com agendamento/bloqueio, ou cujo fim estoura o expediente.
 * Retorna ordenado e sem duplicatas.
 */
export function computeAvailableSlots(input: SlotInput): Date[] {
  const { open, close, durationMinutes: duration, appts, offs } = input;
  const now = input.now ?? new Date();

  const candidates: Date[] = [];
  let cursor = new Date(open);
  while (addMinutes(cursor, duration) <= close) {
    candidates.push(new Date(cursor));
    cursor = addMinutes(cursor, 30);
  }
  // Encaixe: logo depois de um agendamento, mesmo fora da grade de 30 min
  for (const appt of appts) {
    if (addMinutes(appt.endsAt, duration) <= close) {
      candidates.push(new Date(appt.endsAt));
    }
  }

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
