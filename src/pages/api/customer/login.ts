export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sqlite } from '../../../db/index.js';
import { json } from '../../../lib/api.js';
import { checkRateLimit } from '../../../lib/rateLimit.js';
import { getClientIp } from '../../../lib/clientIp.js';
import { makeCustomerSessionCookie, normalizePhone } from '../../../lib/customerSession.js';

const bodySchema = z.object({
  phone:     z.string().min(10).max(25),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento inválida'),
});

// customer_phone é armazenado normalizado (migration 0004) — comparação direta
// usa o índice appt_phone_idx.
const stmtCheckMatch = sqlite.prepare(`
  SELECT COUNT(*) AS c FROM appointments
  WHERE customer_phone = ? AND customer_birthdate = ?
`);

// Conta agendamentos do telefone independente de birthdate — usado pra distinguir
// "telefone não cadastrado" de "telefone cadastrado mas sem birthdate".
const stmtCheckAnyPhone = sqlite.prepare(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN customer_birthdate IS NULL THEN 1 ELSE 0 END) AS without_birthdate
  FROM appointments
  WHERE customer_phone = ?
`);

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Rate limit por IP — protege contra brute-force de números/datas
  const ip = getClientIp(request, clientAddress);
  const rl = checkRateLimit(`customer-login:${ip}`);
  if (!rl.ok) {
    return json({ error: 'Muitas tentativas. Tente novamente em alguns minutos.' }, 429);
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Dados inválidos' }, 400);

  const phone = normalizePhone(parsed.data.phone);
  if (phone.length < 10) return json({ error: 'Telefone inválido' }, 400);

  const compareKey = phone.length >= 11 ? phone.slice(-11) : phone;
  const birthdate  = parsed.data.birthdate;

  const match = stmtCheckMatch.get(compareKey, birthdate) as { c: number };

  if (match.c === 0) {
    // Distingue "telefone existe mas sem birthdate" (cliente antigo) de "não bate".
    // Mostra mensagem específica pro cliente antigo orientando a refazer agendamento.
    const any = stmtCheckAnyPhone.get(compareKey) as { total: number; without_birthdate: number };
    if (any.total > 0 && any.total === any.without_birthdate) {
      return json({
        error: 'Seu cadastro é anterior ao novo portal. Faça um novo agendamento ou peça pra barbearia atualizar sua data de nascimento.',
        code:  'legacy_no_birthdate',
      }, 403);
    }
    // Resposta genérica: não confirma se o telefone existe ou não
    return json({ error: 'Telefone ou data de nascimento não conferem.' }, 404);
  }

  const cookie = await makeCustomerSessionCookie({ phone: compareKey, birthdate });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie':   cookie,
    },
  });
};
