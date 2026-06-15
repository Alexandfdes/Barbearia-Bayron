/**
 * Normalização canônica de telefone BR — fonte única de verdade.
 *
 * Regra: só dígitos; se vier com DDI (>11 dígitos), mantém os últimos 11.
 * Telefones válidos têm 10 (fixo) ou 11 (celular) dígitos.
 * Retorna '' quando não há dígitos suficientes — quem chama decide rejeitar.
 *
 * IMPORTANTE: a coluna appointments.customer_phone armazena SEMPRE o valor
 * normalizado (migration 0004). Toda escrita deve passar por aqui; toda
 * leitura compara com `customer_phone = ?` direto (índice appt_phone_idx).
 */
export function normalizePhone(input: string | null | undefined): string {
  let d = (input ?? '').replace(/\D/g, '');
  // DDI 55 explícito: 12 dígitos = 55+fixo, 13 = 55+celular.
  // (slice(-11) cego erraria o fixo com DDI: manteria o "5" sobrando.)
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  // Formato exótico (>11 mesmo sem DDI 55): melhor esforço, últimos 11.
  if (d.length > 11) d = d.slice(-11);
  if (d.length < 10) return '';
  return d;
}
