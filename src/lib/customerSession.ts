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
  if (!s) {
    throw new Error(
      'SESSION_SECRET não definido. Gere um com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  if (s.length < 32) {
    throw new Error('SESSION_SECRET muito curto: iron-session exige no mínimo 32 caracteres.');
  }
  return s;
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

// Normalização canônica vive em lib/phone.ts — re-export pra compatibilidade.
export { normalizePhone } from './phone.js';
