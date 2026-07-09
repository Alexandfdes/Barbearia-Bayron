export const prerender = false;

import type { APIRoute } from 'astro';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqlite } from '../../../db/index.js';
import { json } from '../../../lib/api.js';
import { getSession } from '../../../lib/session.js';

/**
 * GET /api/admin/backup — baixa um backup consistente do banco, gerado na hora.
 * Restrito ao admin. Serve como off-site manual: baixe e guarde fora do servidor.
 */
export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  if (session.role !== 'admin') return json({ error: 'Apenas admin' }, 403);

  const dir = mkdtempSync(join(tmpdir(), 'bkp-'));
  const dest = join(dir, 'backup.db');
  try {
    await sqlite.backup(dest); // API online do SQLite: consistente mesmo sob escrita
    const buf = readFileSync(dest);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.sqlite3',
        'Content-Disposition': `attachment; filename="bayron-backup-${stamp}.db"`,
        'Content-Length': String(buf.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[api/admin/backup]', err);
    return json({ error: 'Falha ao gerar backup' }, 500);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
