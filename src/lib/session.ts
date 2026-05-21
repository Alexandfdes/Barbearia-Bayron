import { sealData, unsealData } from 'iron-session';

export const SESSION_COOKIE = '__bayron_session';
const TTL = 30 * 24 * 60 * 60;

export interface SessionData {
  barberId: number;
  role: 'admin' | 'barber';
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET não definido');
  return 'dev-secret-must-be-at-least-32-chars!!';
}

export async function getSession(request: Request): Promise<SessionData | null> {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  try {
    const data = await unsealData<SessionData>(match[1], { password: secret(), ttl: TTL });
    if (typeof data.barberId !== 'number' || !data.role) return null;
    return data;
  } catch {
    return null;
  }
}

export async function makeSessionCookie(data: SessionData): Promise<string> {
  const seal   = await sealData(data, { password: secret(), ttl: TTL });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${seal}; HttpOnly${secure}; SameSite=Lax; Max-Age=${TTL}; Path=/`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
