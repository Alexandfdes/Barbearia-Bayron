import { sealData, unsealData } from 'iron-session';

export const CUSTOMER_SESSION_COOKIE = '__bayron_customer';
const TTL = 30 * 24 * 60 * 60;

export interface CustomerSessionData {
  /** Telefone armazenado como apenas dígitos (sem máscara, sem DDI) */
  phone: string;
  /** Data de nascimento no formato 'YYYY-MM-DD' — usada pra filtrar agendamentos do cliente */
  birthdate: string;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET não definido');
  return 'dev-secret-must-be-at-least-32-chars!!';
}

export async function getCustomerSession(request: Request): Promise<CustomerSessionData | null> {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${CUSTOMER_SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  try {
    const data = await unsealData<CustomerSessionData>(match[1], { password: secret(), ttl: TTL });
    if (typeof data.phone !== 'string' || data.phone.length < 10) return null;
    if (typeof data.birthdate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.birthdate)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function makeCustomerSessionCookie(data: CustomerSessionData): Promise<string> {
  const seal   = await sealData(data, { password: secret(), ttl: TTL });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${CUSTOMER_SESSION_COOKIE}=${seal}; HttpOnly${secure}; SameSite=Lax; Max-Age=${TTL}; Path=/`;
}

export function clearCustomerSessionCookie(): string {
  return `${CUSTOMER_SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/**
 * Extrai só dígitos e pega os últimos 11 (telefone BR celular).
 * Aceita formatos: "(84) 99665-8951", "84996658951", "+55 84 99665-8951", etc.
 * Retorna string vazia se não tiver dígitos suficientes.
 */
export function normalizePhone(input: string): string {
  const digits = (input ?? '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  // Telefones BR têm 10 (fixo) ou 11 (celular). Se vier com DDI 55, pega os últimos 11.
  return digits.length > 11 ? digits.slice(-11) : digits;
}
