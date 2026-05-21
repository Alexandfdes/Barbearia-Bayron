import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH ?? '/data/appointments.db';
const MIGRATIONS_FOLDER = resolve(__dirname, '..', 'drizzle');

mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite);

migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
console.log('✓ Migrations aplicadas');

sqlite.close();
