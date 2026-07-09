/**
 * Daemon de backup: roda um backup no boot e depois diariamente às 03:00
 * (hora local do container — TZ, ex: America/Fortaleza).
 * Lançado em background pelo CMD do Dockerfile. Sem dependências além do backup.mjs.
 */
import { runBackup } from './backup.mjs';

const HOUR = parseInt(process.env.BACKUP_HOUR ?? '3', 10);

function localHour() {
  return parseInt(new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', hour12: false, timeZone: process.env.TZ ?? 'America/Fortaleza',
  }).format(new Date()), 10);
}

function localDateStr() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.TZ ?? 'America/Fortaleza',
  }).format(new Date()); // YYYY-MM-DD
}

let lastRunDate = null;

async function tick() {
  if (localHour() === HOUR && lastRunDate !== localDateStr()) {
    lastRunDate = localDateStr();
    try {
      const { dest } = await runBackup();
      console.log(`[backup-daemon] ✓ ${dest}`);
    } catch (err) {
      console.error('[backup-daemon] ✕ falhou:', err.message);
    }
  }
}

// Backup no boot (garante um backup pós-deploy), a menos que já exista um com <12h —
// evita flood se o container entrar em restart-loop. Depois, checagem a cada 10 min.
runBackup({ skipIfFresherThanMs: 12 * 60 * 60 * 1000 })
  .then(({ dest, skipped }) => {
    if (skipped) console.log('[backup-daemon] boot: backup recente já existe, pulando');
    else { lastRunDate = localDateStr(); console.log(`[backup-daemon] ✓ boot: ${dest}`); }
  })
  .catch((err) => console.error('[backup-daemon] ✕ boot falhou:', err.message));

setInterval(tick, 10 * 60 * 1000);
console.log(`[backup-daemon] agendado: diário às ${String(HOUR).padStart(2, '0')}:00 (${process.env.TZ ?? 'America/Fortaleza'})`);
