/**
 * Extrai o IP real do cliente atrás de proxy reverso, resistente a spoofing.
 *
 * O X-Forwarded-For é uma cadeia "cliente, proxy1, proxy2, ...". Qualquer
 * cliente pode PREPENDER valores falsos — só os últimos N (escritos pelos
 * nossos proxies confiáveis) são de confiança. Pegar o PRIMEIRO item (erro
 * comum) deixa o rate limit trivialmente contornável: basta variar o header.
 *
 * TRUSTED_PROXY_HOPS = nº de proxies confiáveis à frente do app.
 *   1 (default) → Traefik/EasyPanel direto no container.
 *   2           → CDN (ex: Cloudflare) na frente do Traefik.
 * O IP confiável fica na posição (comprimento - hops) da cadeia.
 */
const HOPS = Math.max(1, parseInt(process.env.TRUSTED_PROXY_HOPS ?? '1', 10) || 1);

export function getClientIp(
  request: Request,
  clientAddress?: string | (() => string),
): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      // Conta da direita: o proxy confiável mais próximo escreveu o último valor.
      const idx = Math.max(0, parts.length - HOPS);
      const ip = parts[idx];
      if (ip) return ip;
    }
  }

  // Sem XFF: cai pro que o proxy setar explicitamente ou pro socket.
  const xReal = request.headers.get('x-real-ip');
  if (xReal) return xReal.trim();

  try {
    const addr = typeof clientAddress === 'function' ? clientAddress() : clientAddress;
    if (addr) return addr;
  } catch { /* alguns adapters lançam ao acessar clientAddress */ }

  return 'unknown';
}
