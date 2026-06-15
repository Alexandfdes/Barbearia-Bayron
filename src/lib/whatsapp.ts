/**
 * Helpers de WhatsApp click-to-chat (wa.me) com validação de telefone BR
 * e mensagens rápidas pré-preenchidas para o painel admin.
 *
 * A normalização (dígitos, DDI) é a canônica de lib/phone.ts; aqui só entram
 * as regras extras do wa.me:
 * - DDD entre 11 e 99.
 * - Celular (11 dígitos) precisa começar com 9 após o DDD.
 * - Retorna null se inválido — quem chama decide esconder/desabilitar o botão.
 */

import { normalizePhone } from './phone.js';

export function waPhone(raw: string | null | undefined): string | null {
  const d = normalizePhone(raw);
  if (!d) return null;
  const ddd = parseInt(d.slice(0, 2), 10);
  if (ddd < 11) return null;
  if (d.length === 11 && d[2] !== '9') return null;
  return `55${d}`;
}

export function waLink(phone55: string, message?: string): string {
  return message
    ? `https://wa.me/${phone55}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${phone55}`;
}

export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'cliente';
}

/** Soma minutos a um "HH:MM" (sem virar o dia — trava em 23:59). */
export function addMinutesToHm(hm: string, minutes: number): string {
  const m = hm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return hm;
  const total = Math.min(parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + minutes, 23 * 60 + 59);
  const h = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export interface WaMessages {
  /** Lembrete padrão do horário */
  lembrete: string;
  /** Cliente atrasado — "está a caminho?" */
  clienteAtrasado: string;
  /** Barbeiro atrasado — propõe horário +15min */
  barbeiroAtrasado: string;
}

/**
 * @param name  nome completo do cliente (usa só o primeiro nome)
 * @param timeHm horário local "HH:MM" do agendamento
 * @param dia   rótulo do dia: 'hoje' ou 'dia 12/06'
 */
export function buildWaMessages(name: string, timeHm: string, dia: string): WaMessages {
  const first = firstName(name);
  return {
    lembrete: `Olá ${first}, aqui da Barbearia Bayron — lembrando do seu horário ${dia} às ${timeHm}. Qualquer coisa é só me chamar!`,
    clienteAtrasado: `Fala, ${first}! Tudo bem? Vi que seu horário era às ${timeHm}. Está a caminho?`,
    barbeiroAtrasado: `Fala, ${first}! Tive um pequeno atraso no atendimento anterior, posso te atender às ${addMinutesToHm(timeHm, 15)}? Desculpa o transtorno!`,
  };
}
