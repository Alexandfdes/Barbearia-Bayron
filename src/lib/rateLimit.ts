const WINDOW_MS  = 15 * 60 * 1000;
const MAX_TRIES  = 5;

interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>();

export function checkRateLimit(key: string): { ok: boolean; retryAfterSecs?: number } {
  const now   = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (entry.count >= MAX_TRIES) {
    return { ok: false, retryAfterSecs: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { ok: true };
}

export function resetRateLimit(key: string): void {
  store.delete(key);
}
