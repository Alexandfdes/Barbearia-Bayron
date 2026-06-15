export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sqlite } from '../../../../../db/index.js';
import { json } from '../../../../../lib/api.js';
import { getSession } from '../../../../../lib/session.js';
import { normalizePhone } from '../../../../../lib/phone.js';

const bodySchema = z.object({
  customerName:      z.string().min(2).max(100),
  customerPhone:     z.string().min(8).max(25),
  customerBirthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

// Plausibilidade da data (5–100 anos atrás)
function isPlausibleBirthdate(iso: string | null): boolean {
  if (iso === null) return true;
  const d = new Date(iso + 'T12:00:00Z');
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const minDate = new Date(now.getFullYear() - 100, now.getMonth(), now.getDate());
  const maxDate = new Date(now.getFullYear() - 5,   now.getMonth(), now.getDate());
  return d >= minDate && d <= maxDate;
}

// Busca o appointment e seu telefone normalizado
const stmtGet = sqlite.prepare(`
  SELECT id, customer_phone, barber_id FROM appointments WHERE id = ?
`);

// Atualiza TODOS os appointments do mesmo telefone (coluna já normalizada)
const stmtPropagate = sqlite.prepare(`
  UPDATE appointments
     SET customer_name = ?,
         customer_phone = ?,
         customer_birthdate = ?,
         last_modified_by_id = ?,
         last_modified_at = ?
   WHERE customer_phone = ?
`);

// Atualiza só esse appointment (fallback)
const stmtUpdateOne = sqlite.prepare(`
  UPDATE appointments
     SET customer_name = ?, customer_phone = ?, customer_birthdate = ?,
         last_modified_by_id = ?, last_modified_at = ?
   WHERE id = ?
`);

export const PATCH: APIRoute = async ({ params, request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  if (!isPlausibleBirthdate(parsed.data.customerBirthdate)) {
    return json({ error: 'Data de nascimento inválida' }, 400);
  }

  const appt = stmtGet.get(id) as { id: number; customer_phone: string; barber_id: number } | undefined;
  if (!appt) return json({ error: 'Agendamento não encontrado' }, 404);

  if (session.role !== 'admin' && appt.barber_id !== session.barberId) {
    return json({ error: 'Sem permissão' }, 403);
  }

  const origPhoneKey = normalizePhone(appt.customer_phone);
  const newPhone     = normalizePhone(parsed.data.customerPhone);
  if (!newPhone) return json({ error: 'Telefone inválido — informe DDD + número' }, 400);

  const nowIso = new Date().toISOString();

  // Propaga se o telefone original tem >= 10 dígitos (chave estável)
  if (origPhoneKey.length >= 10) {
    const result = stmtPropagate.run(
      parsed.data.customerName.trim(),
      newPhone,
      parsed.data.customerBirthdate,
      session.barberId,
      nowIso,
      origPhoneKey,
    );
    return json({ ok: true, updated: result.changes, propagated: true });
  }

  // Caso raro: telefone original muito curto, só atualiza esse
  const result = stmtUpdateOne.run(
    parsed.data.customerName.trim(),
    newPhone,
    parsed.data.customerBirthdate,
    session.barberId,
    nowIso,
    id,
  );
  return json({ ok: true, updated: result.changes, propagated: false });
};
