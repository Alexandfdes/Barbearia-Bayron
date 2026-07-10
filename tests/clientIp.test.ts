import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getClientIp } from '../src/lib/clientIp';

function req(headers: Record<string, string>): Request {
  return new Request('https://x/', { headers });
}

describe('getClientIp (default: 1 proxy confiável)', () => {
  it('pega o ÚLTIMO IP da cadeia — o que o proxy confiável anexou', () => {
    // Cliente forja "9.9.9.9"; Traefik anexa o IP real "203.0.113.7" ao final.
    expect(getClientIp(req({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('IP forjado no início NÃO é usado (anti-spoofing do rate limit)', () => {
    const a = getClientIp(req({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7' }));
    const b = getClientIp(req({ 'x-forwarded-for': '2.2.2.2, 203.0.113.7' }));
    expect(a).toBe(b); // variar o header não muda a chave → limite não é contornável
  });

  it('cadeia de um valor só (cliente direto no proxy) usa esse valor', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('trima espaços', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '9.9.9.9 ,  203.0.113.7 ' }))).toBe('203.0.113.7');
  });

  it('sem XFF, cai pro x-real-ip', () => {
    expect(getClientIp(req({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
  });

  it('sem headers, usa clientAddress (string ou função)', () => {
    expect(getClientIp(req({}), '198.51.100.9')).toBe('198.51.100.9');
    expect(getClientIp(req({}), () => '198.51.100.9')).toBe('198.51.100.9');
  });

  it('clientAddress que lança não derruba — retorna unknown', () => {
    const throwing = () => { throw new Error('adapter'); };
    expect(getClientIp(req({}), throwing)).toBe('unknown');
  });

  it('nada disponível → unknown', () => {
    expect(getClientIp(req({}))).toBe('unknown');
  });
});

describe('getClientIp com TRUSTED_PROXY_HOPS=2 (ex: CDN + Traefik)', () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv('TRUSTED_PROXY_HOPS', '2'); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('pega o penúltimo (o CDN escreveu o IP real; Traefik anexou o IP do CDN)', async () => {
    const { getClientIp: fn } = await import('../src/lib/clientIp');
    // cadeia: forjado, IP-real (pelo CDN), IP-do-CDN (pelo Traefik)
    expect(fn(req({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
  });
});
