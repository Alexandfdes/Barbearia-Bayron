const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_TRIES = 5;

interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>();

interface RLOptions {
  maxTries?: number;
  windowMs?: number;
}

export function checkRateLimit(key: string, opts: RLOptions = {}): { ok: boolean; retryAfterSecs?: number } {
  const maxTries = opts.maxTries ?? DEFAULT_MAX_TRIES;
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const now   = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (entry.count >= maxTries) {
    return { ok: false, retryAfterSecs: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { ok: true };
}

export function resetRateLimit(key: string): void {
  store.delete(key);
}
