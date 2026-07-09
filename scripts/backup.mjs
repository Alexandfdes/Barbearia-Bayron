/**
 * Backup do SQLite via API online do better-sqlite3 (seguro com WAL, sem CLI externo).
 * Uso: node scripts/backup.mjs
 * Env: DATABASE_PATH (default /data/appointments.db)
 *      BACKUP_DIR (default /data/backups)
 *      BACKUP_RETENTION_DAYS (default 30)
 */
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';

const DB_PATH        = process.env.DATABASE_PATH ?? '/data/appointments.db';
const BACKUP_DIR     = process.env.BACKUP_DIR ?? '/data/backups';
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS ?? '30', 10);

/** Idade (ms) do backup mais recente, ou Infinity se não houver nenhum. */
export function newestBackupAgeMs() {
  try {
    const ages = readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.db'))
      .map(f => Date.now() - statSync(join(BACKUP_DIR, f)).mtimeMs);
    return ages.length ? Math.min(...ages) : Infinity;
  } catch {
    return Infinity;
  }
}

/**
 * Cria um backup consistente e apaga os antigos. Retorna o caminho criado.
 * opts.skipIfFresherThanMs: não faz nada se já existe backup mais novo que isso
 * (evita flood de backups em restart-loop do container).
 */
export async function runBackup(opts = {}) {
  mkdirSync(BACKUP_DIR, { recursive: true });

  if (opts.skipIfFresherThanMs && newestBackupAgeMs() < opts.skipIfFresherThanMs) {
    return { dest: null, removed: 0, skipped: true };
  }

  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const dest = join(BACKUP_DIR, `appointments_${stamp}.db`);

  const src = new Database(DB_PATH, { readonly: true });
  try {
    await src.backup(dest); // API de backup online do SQLite: consistente mesmo sob escrita
  } finally {
    src.close();
  }

  // Retenção: apaga backups mais velhos que N dias
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const f of readdirSync(BACKUP_DIR)) {
    if (!f.endsWith('.db')) continue;
    const p = join(BACKUP_DIR, f);
    if (statSync(p).mtimeMs < cutoff) { unlinkSync(p); removed++; }
  }

  const uploaded = await maybeUploadToS3(dest);

  return { dest, removed, skipped: false, uploaded };
}

/**
 * Upload off-site opcional (S3-compatível, ex: Backblaze B2).
 * Ativa somente se S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY existirem.
 * Falha de upload NÃO derruba o backup local — loga e segue.
 */
async function maybeUploadToS3(filePath) {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return false;

  try {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION ?? 'us-east-1',
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
      forcePathStyle: true,
    });
    await client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: `backups/${basename(filePath)}`,
      Body: readFileSync(filePath),
      ContentType: 'application/vnd.sqlite3',
    }));
    console.log(`✓ Upload off-site: s3://${S3_BUCKET}/backups/${basename(filePath)}`);
    return true;
  } catch (err) {
    console.error('✕ Upload off-site falhou (backup local preservado):', err.message);
    return false;
  }
}

// Execução direta via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  runBackup()
    .then(({ dest, removed }) => {
      console.log(`✓ Backup criado: ${dest}${removed ? ` (${removed} antigos removidos)` : ''}`);
    })
    .catch((err) => {
      console.error('✕ Backup falhou:', err.message);
      process.exit(1);
    });
}
