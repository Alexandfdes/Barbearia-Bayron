// Script de manutenção: zera a tabela appointments depois de fazer backup.
//
// USO em produção:
//   1) SSH no container EasyPanel (ou abrir terminal pelo painel)
//   2) cd /app  (ou onde o projeto estiver montado)
//   3) node scripts/wipe-appointments.mjs
//
// O script SEMPRE faz backup antes de apagar. Backup vai em
// data/backups/appointments-pre-wipe-<timestamp>.db
//
// Pra cancelar: Ctrl+C nos 5 segundos de countdown.

import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DB_PATH = process.env.DATABASE_PATH ?? './data/appointments.db';

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`[wipe] Banco não encontrado em ${DB_PATH}`);
    process.exit(1);
  }

  // 1. Backup
  const backupDir = join(dirname(DB_PATH), 'backups');
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `appointments-pre-wipe-${timestamp()}.db`);
  copyFileSync(DB_PATH, backupPath);
  const sizeKb = (statSync(backupPath).size / 1024).toFixed(1);
  console.log(`[wipe] Backup criado: ${backupPath} (${sizeKb} KB)`);

  // 2. Conta antes
  const db = new Database(DB_PATH);
  const before = db.prepare('SELECT COUNT(*) AS c FROM appointments').get();
  const byStatus = db.prepare('SELECT status, COUNT(*) AS c FROM appointments GROUP BY status').all();
  console.log(`[wipe] Antes: ${before.c} appointments`);
  console.log(`[wipe] Por status:`, byStatus);

  if (before.c === 0) {
    console.log('[wipe] Tabela já está vazia. Saindo sem alterar.');
    db.close();
    return;
  }

  // 3. Countdown de cancelamento
  console.log('[wipe] Apagando TODOS os agendamentos em 5 segundos. Ctrl+C pra cancelar.');
  for (let i = 5; i > 0; i--) {
    process.stdout.write(`  ${i}... `);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('');

  // 4. Apaga
  db.pragma('wal_checkpoint(TRUNCATE)');
  const tx = db.transaction(() => {
    const res = db.prepare('DELETE FROM appointments').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name='appointments'").run();
    return res.changes;
  });
  const removed = tx();
  db.exec('VACUUM');

  // 5. Verifica
  const after = db.prepare('SELECT COUNT(*) AS c FROM appointments').get();
  console.log(`[wipe] Apagados: ${removed} appointments. Restantes: ${after.c}.`);

  // 6. Confere que tabelas auxiliares ficaram intactas
  for (const t of ['barbers', 'services', 'barber_services', 'working_hours', 'time_off']) {
    const r = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get();
    console.log(`[wipe]   ${t}: ${r.c} linhas (preservada)`);
  }

  db.close();
  console.log(`[wipe] OK. Pra restaurar: cp ${backupPath} ${DB_PATH}`);
}

main().catch(err => {
  console.error('[wipe] Erro:', err);
  process.exit(1);
});
