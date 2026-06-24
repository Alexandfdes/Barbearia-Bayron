/**
 * Define/reseta a senha de um barbeiro direto no banco — útil quando você
 * ficou sem acesso ao painel (não dá pra trocar senha pela UI sem logar).
 *
 * Uso:
 *   node scripts/set-admin-password.mjs <slug> <novaSenha>
 *   node scripts/set-admin-password.mjs bayron "Bayron@2026"
 *
 * Se omitir os argumentos, usa slug "bayron" e a senha de ADMIN_NEW_PASSWORD.
 * Pode rodar com o servidor dev ligado (SQLite em WAL aguenta).
 *
 * Vars de ambiente (opcionais):
 *   DATABASE_PATH      (default: ./data/appointments.db)
 *   ADMIN_NEW_PASSWORD (usada se a senha não vier por argumento)
 */
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const DB_PATH = process.env.DATABASE_PATH ?? './data/appointments.db';
const BCRYPT_COST = 12;

const slug = (process.argv[2] ?? 'bayron').toLowerCase();
const password = process.argv[3] ?? process.env.ADMIN_NEW_PASSWORD;

if (!password) {
  console.error('ERRO: informe a senha. Ex: node scripts/set-admin-password.mjs bayron "Bayron@2026"');
  process.exit(1);
}
if (password.length < 6) {
  console.error('ERRO: a senha precisa ter ao menos 6 caracteres.');
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

const barber = db.prepare('SELECT id, name, active FROM barbers WHERE slug = ?').get(slug);
if (!barber) {
  console.error(`ERRO: nenhum barbeiro com slug "${slug}". Slugs existentes:`,
    db.prepare('SELECT slug FROM barbers').all().map((r) => r.slug).join(', '));
  process.exit(1);
}

const hash = bcrypt.hashSync(password, BCRYPT_COST);
const res = db.prepare('UPDATE barbers SET password_hash = ? WHERE slug = ?').run(hash, slug);

// Se estava inativo, reativa — senão o login recusa mesmo com a senha certa.
if (!barber.active) {
  db.prepare('UPDATE barbers SET active = 1 WHERE slug = ?').run(slug);
  console.log(`(barbeiro estava inativo — reativado)`);
}

db.close();
console.log(`✓ Senha de "${barber.name}" (slug: ${slug}) atualizada. Linhas afetadas: ${res.changes}`);
console.log('Agora é só logar no painel com essa senha.');
