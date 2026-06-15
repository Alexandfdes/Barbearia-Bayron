/**
 * Seed inicial: barbeiros, serviços, barber_services e working_hours.
 * Idempotente: não insere se já existir dado.
 *
 * Uso: node scripts/seed.mjs
 * Vars de ambiente (obrigatórias):
 *   ADMIN_INITIAL_PASSWORD  — senha inicial do admin (trocar após o primeiro login)
 *   BARBER_INITIAL_PASSWORD — senha inicial dos barbeiros
 * Vars de ambiente (opcionais):
 *   DATABASE_PATH           (default: ./data/appointments.db)
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { resolve, dirname as pDirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const __dirname = pDirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH ?? './data/appointments.db';
const MIGRATIONS_FOLDER = resolve(__dirname, '..', 'drizzle');
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD;
const BARBER_PASSWORD = process.env.BARBER_INITIAL_PASSWORD;

// Senhas são obrigatórias via env — sem fallback hardcoded.
const PLACEHOLDERS = ['bayron@2025', 'barber@2025', 'changeme', 'password', 'senha'];
for (const [name, value] of [
  ['ADMIN_INITIAL_PASSWORD', ADMIN_PASSWORD],
  ['BARBER_INITIAL_PASSWORD', BARBER_PASSWORD],
]) {
  if (!value) {
    console.error(`ERRO: variável de ambiente ${name} não definida. Defina-a antes de rodar o seed.`);
    process.exit(1);
  }
  if (value.length < 8) {
    console.error(`ERRO: ${name} muito curta (mínimo 8 caracteres).`);
    process.exit(1);
  }
  if (PLACEHOLDERS.includes(value.toLowerCase())) {
    console.error(`ERRO: ${name} usa um valor placeholder conhecido. Escolha uma senha real.`);
    process.exit(1);
  }
}

mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite);

// Garante que as tabelas existem antes de semear
migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

// Verifica se já foi semeado
const existing = sqlite.prepare('SELECT COUNT(*) as c FROM barbers').get();
if (existing.c > 0) {
  console.log('Banco já semeado, pulando...');
  sqlite.close();
  process.exit(0);
}

console.log('Gerando hashes de senha (bcrypt cost 12)...');
const adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
const barberHash = bcrypt.hashSync(BARBER_PASSWORD, 12);

// ─── Barbeiros ────────────────────────────────────────────────────────────────
const insertBarbers = sqlite.prepare(`
  INSERT INTO barbers (name, slug, role, password_hash) VALUES (?, ?, ?, ?)
`);
const barberRows = [
  { name: 'Bayron Patrezio',   slug: 'bayron',   role: 'admin',  hash: adminHash },
  { name: 'Emanuel Brilhante', slug: 'emanuel',  role: 'barber', hash: barberHash },
  { name: 'Jackson Viana',     slug: 'jackson',  role: 'barber', hash: barberHash },
];
for (const b of barberRows) {
  insertBarbers.run(b.name, b.slug, b.role, b.hash);
}

const allBarbers = sqlite.prepare('SELECT id, slug FROM barbers').all();
console.log('✓ Barbeiros inseridos:', allBarbers.map(b => b.slug).join(', '));

// ─── Serviços (20 serviços do catálogo atual, sem os pacotes 1º/2º/3º Combo) ─
// duration_minutes = duração padrão usada no seed de barber_services
const servicesList = [
  // Cortes individuais
  { name: 'Corte Social',            slug: 'corte-social',             priceCents: 4000,  duration: 40  },
  { name: 'Corte Degradê',           slug: 'corte-degrade',            priceCents: 4500,  duration: 40  },
  { name: 'Corte Navalhado',         slug: 'corte-navalhado',          priceCents: 4500,  duration: 40  },
  { name: 'Só Tesoura',              slug: 'so-tesoura',               priceCents: 4000,  duration: 40  },
  { name: '1º Corte Baby',           slug: 'primeiro-corte-baby',      priceCents: 4000,  duration: 40  },
  // Barba
  { name: 'Barba Simples',           slug: 'barba-simples',            priceCents: 3000,  duration: 30  },
  { name: 'Barba e Pezinho',         slug: 'barba-pezinho',            priceCents: 3500,  duration: 30  },
  { name: 'Barba + Pigmentação',     slug: 'barba-pigmentacao',        priceCents: 4500,  duration: 45  },
  // Adicionais
  { name: 'Alisamento',              slug: 'alisamento',               priceCents: 7000,  duration: 60  },
  { name: 'Degradê + Alisamento',    slug: 'degrade-alisamento',       priceCents: 10000, duration: 90  },
  { name: 'Degradê, Barba e Alis.',  slug: 'degrade-barba-alisamento', priceCents: 13000, duration: 120 },
  { name: 'Hidratação',              slug: 'hidratacao',               priceCents: 1500,  duration: 20  },
  { name: 'Limpeza contra caspa',    slug: 'limpeza-caspa',            priceCents: 1000,  duration: 20  },
  { name: 'Depilação Nasal',         slug: 'depilacao-nasal',          priceCents: 1000,  duration: 10  },
  { name: 'Sobrancelha Navalha',     slug: 'sobrancelha-navalha',      priceCents: 1000,  duration: 10  },
  // Combos
  { name: 'Navalhado + Barba',               slug: 'navalhado-barba',           priceCents: 6500, duration: 60 },
  { name: 'Social + Barba',                  slug: 'social-barba',              priceCents: 6000, duration: 60 },
  { name: 'Degradê + Barba',                 slug: 'degrade-barba',             priceCents: 6500, duration: 60 },
  { name: 'Degradê + Barba + Hidratação',    slug: 'degrade-barba-hidratacao',  priceCents: 7500, duration: 75 },
  { name: 'Navalhado + Pigmentação',         slug: 'navalhado-pigmentacao',     priceCents: 6000, duration: 45 },
];

const insertService = sqlite.prepare(`
  INSERT INTO services (name, slug, price_cents) VALUES (?, ?, ?)
`);
for (const s of servicesList) {
  insertService.run(s.name, s.slug, s.priceCents);
}

const allServices = sqlite.prepare('SELECT id, slug FROM services').all();
const serviceIdBySlug = Object.fromEntries(allServices.map(s => [s.slug, s.id]));
console.log(`✓ ${allServices.length} serviços inseridos`);

// ─── Barber Services (todos × 20 serviços com as durações padrão) ─────────────
const insertBS = sqlite.prepare(`
  INSERT INTO barber_services (barber_id, service_id, duration_minutes) VALUES (?, ?, ?)
`);
let bsCount = 0;
for (const barber of allBarbers) {
  for (const svc of servicesList) {
    const svcId = serviceIdBySlug[svc.slug];
    insertBS.run(barber.id, svcId, svc.duration);
    bsCount++;
  }
}
console.log(`✓ ${bsCount} barber_services inseridos`);

// ─── Working Hours ─────────────────────────────────────────────────────────────
// seg (1)–sex (5): 09:00–20:00 | sáb (6): 09:00–18:00 | dom (0): fechado
const insertWH = sqlite.prepare(`
  INSERT INTO working_hours (barber_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)
`);
let whCount = 0;
for (const barber of allBarbers) {
  for (let day = 1; day <= 5; day++) { // seg–sex
    insertWH.run(barber.id, day, '09:00', '20:00');
    whCount++;
  }
  insertWH.run(barber.id, 6, '09:00', '18:00'); // sábado
  whCount++;
}
console.log(`✓ ${whCount} working_hours inseridos`);

sqlite.close();
console.log('\nSeed concluído com sucesso!');
console.log('Senhas definidas a partir de ADMIN_INITIAL_PASSWORD e BARBER_INITIAL_PASSWORD (não exibidas por segurança).');
console.log('Altere as senhas após o primeiro login.');
