/**
 * Seed de DEMONSTRAÇÃO — popula o dashboard /admin/relatorios com agendamentos
 * fictícios pra mostrar o sistema pro barbeiro.
 *
 * Gera, no MÊS ATUAL e no ANTERIOR, uma mistura realista:
 *   - concluídos (faturamento realizado, por barbeiro, por serviço, por hora)
 *   - no-show (valor perdido + taxa de falta)
 *   - confirmados no passado e não fechados (em "aberto")
 *   - confirmados no futuro (faturamento "previsto")  [só no mês atual]
 *   - alguns cancelados
 *   - itens de comanda em parte dos concluídos (produtos Boris / extras)
 *   - clientes recorrentes (mesmos telefones no mês anterior e no atual)
 *
 * Tudo é marcado com notes = '[FICTICIO]' e telefones no bloco 558490000XXXX,
 * então a remoção é segura e não toca em nenhum dado real.
 *
 * USO
 *   node scripts/seed-relatorio-demo.mjs                 # local (./data/appointments.db)
 *   node scripts/seed-relatorio-demo.mjs --undo          # remove TUDO que este script criou
 *
 * EM PRODUÇÃO (container EasyPanel), passe o caminho e confirme com --prod:
 *   DATABASE_PATH=/data/appointments.db node scripts/seed-relatorio-demo.mjs --prod
 *   DATABASE_PATH=/data/appointments.db node scripts/seed-relatorio-demo.mjs --undo
 *
 * OPÇÕES / ENV
 *   --prod        confirma rodar contra um banco em /data (trava de segurança)
 *   --undo        remove os registros fictícios (por marcador), preserva dados reais
 *   DATABASE_PATH caminho do .db (default ./data/appointments.db)
 *   SEED          semente do gerador aleatório (default 42; muda o conjunto gerado)
 */

import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';

// ─── Configuração / flags ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const UNDO = args.includes('--undo');
const PROD_OK = args.includes('--prod');
const DB_PATH = process.env.DATABASE_PATH ?? './data/appointments.db';
const MARKER = '[FICTICIO]';
const PHONE_PREFIX = '558490000'; // 9 dígitos -> +13 total. Bloco claramente fake.
const TZ_OFFSET_H = 3;            // America/Fortaleza = UTC-3, sem horário de verão

// Trava: bancos em /data são, por convenção do projeto, o de PRODUÇÃO.
const looksProd = DB_PATH.startsWith('/data');
if (looksProd && !PROD_OK && !UNDO) {
  console.error(`\n✋ DATABASE_PATH="${DB_PATH}" parece o banco de PRODUÇÃO.`);
  console.error(`   Se for intencional, rode com --prod. (Para local: DATABASE_PATH=./data/appointments.db)\n`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Modo --undo ────────────────────────────────────────────────────────────────
if (UNDO) {
  const before = db.prepare(`SELECT COUNT(*) c FROM appointments WHERE notes = ?`).get(MARKER).c;
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM appointment_items
                WHERE appointment_id IN (SELECT id FROM appointments WHERE notes = ?)`).run(MARKER);
    db.prepare(`DELETE FROM appointments WHERE notes = ?`).run(MARKER);
  });
  run();
  console.log(`\n🧹 Removidos ${before} agendamentos fictícios (e seus itens de comanda).`);
  console.log(`   Dados reais não foram tocados.\n`);
  db.close();
  process.exit(0);
}

// ─── Pré-checagens ───────────────────────────────────────────────────────────────
const barberCount = db.prepare(`SELECT COUNT(*) c FROM barbers`).get().c;
if (!barberCount) {
  console.error(`Banco sem barbeiros (${DB_PATH}). Rode o seed inicial antes: node scripts/seed.mjs`);
  process.exit(1);
}
const already = db.prepare(`SELECT COUNT(*) c FROM appointments WHERE notes = ?`).get(MARKER).c;
if (already > 0) {
  console.error(`\nJá existem ${already} agendamentos fictícios neste banco.`);
  console.error(`Rode com --undo antes de gerar de novo (evita duplicar a demo).\n`);
  process.exit(1);
}

console.log(`Banco alvo: ${DB_PATH}${looksProd ? '  ⚠️  PRODUÇÃO' : ''}`);

// ─── Catálogo real do banco (IDs/durações/preços de verdade) ─────────────────────
const barbers = db.prepare(`SELECT id, name, slug, role FROM barbers WHERE active = 1`).all();
const svcStmt = db.prepare(`
  SELECT bs.service_id AS serviceId, bs.duration_minutes AS duration,
         s.name AS name, s.price_cents AS priceCents
  FROM barber_services bs
  JOIN services s ON s.id = bs.service_id
  WHERE bs.barber_id = ? AND bs.active = 1 AND s.active = 1
`);
const svcByBarber = new Map();
for (const b of barbers) svcByBarber.set(b.id, svcStmt.all(b.id));
const barbersWithSvc = barbers.filter(b => (svcByBarber.get(b.id) || []).length);
if (!barbersWithSvc.length) {
  console.error('Nenhum barbeiro tem serviços ativos. Configure o catálogo antes.');
  process.exit(1);
}

// ─── RNG reprodutível (mulberry32) ───────────────────────────────────────────────
let _s = (Number(process.env.SEED ?? 42) >>> 0) || 1;
function rnd() {
  _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const chance = p => rnd() < p;
const pick = arr => arr[Math.floor(rnd() * arr.length)];

// ─── Datas em Fortaleza ──────────────────────────────────────────────────────────
const now = new Date();
const fort = new Date(now.getTime() - TZ_OFFSET_H * 3600 * 1000); // "agora" em Fortaleza
const curY = fort.getUTCFullYear();
const curM = fort.getUTCMonth() + 1; // 1-12
const curD = fort.getUTCDate();
const prevY = curM === 1 ? curY - 1 : curY;
const prevM = curM === 1 ? 12 : curM - 1;

const isoUtc = (y, m, d, hh, mm) =>
  new Date(Date.UTC(y, m - 1, d, hh + TZ_OFFSET_H, mm, 0)).toISOString();
const weekdayOf = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); // 0=dom..6=sáb
const daysIn = (y, m) => new Date(y, m, 0).getDate();

// ─── Personas (telefone -> nome/nascimento), pra recorrência coerente ────────────
const FIRST = ['João','Pedro','Lucas','Mateus','Gabriel','Rafael','Bruno','Felipe','Thiago','Carlos',
  'Daniel','Marcos','André','Vinícius','Gustavo','Diego','Rodrigo','Eduardo','Caio','Igor','Davi',
  'Samuel','Henrique','Leandro','Fábio','Otávio','Renan','Wesley','Júnior','Anderson'];
const LAST = ['Silva','Santos','Oliveira','Souza','Lima','Pereira','Costa','Almeida','Nascimento',
  'Araújo','Fernandes','Carvalho','Gomes','Martins','Rocha','Ribeiro','Barbosa','Dias','Moreira','Cavalcante'];
const PHONES = Array.from({ length: 200 }, (_, i) => PHONE_PREFIX + String(i + 1).padStart(4, '0')); // 13 dígitos
const PREV_POOL = PHONES.slice(0, 120); // clientes que já existiam (usados no mês anterior)
const NEW_POOL  = PHONES.slice(120);    // clientes novos, exclusivos do mês atual
const persona = new Map();
function personaFor(phone) {
  let p = persona.get(phone);
  if (!p) {
    const age = ri(16, 58);
    const bd = `${curY - age}-${String(ri(1, 12)).padStart(2, '0')}-${String(ri(1, 28)).padStart(2, '0')}`;
    p = { name: `${pick(FIRST)} ${pick(LAST)}`, birthdate: bd };
    persona.set(phone, p);
  }
  return p;
}

// ─── Peso por tipo de serviço (cortes/combos comuns; adicionais raros) ───────────
function weightFor(name) {
  const n = name.toLowerCase();
  if (/(hidrata|limpeza|depila|sobrancelha)/.test(n)) return 1;          // add-ons isolados: raros
  if (/(alisamento|pigment)/.test(n)) return 2;
  if (n.includes('+') || n.includes('combo')) return 6;                  // combos: populares
  if (/(corte|degrad|navalhado|tesoura)/.test(n)) return 6;              // cortes: populares
  if (n.includes('barba')) return 4;
  return 3;
}
function pickService(list) {
  const total = list.reduce((a, s) => a + weightFor(s.name), 0);
  let r = rnd() * total;
  for (const s of list) { r -= weightFor(s.name); if (r <= 0) return s; }
  return list[list.length - 1];
}

const EXTRAS = [
  { name: 'Óleo Mentolado Boris', priceCents: 4500 },
  { name: 'Balm Classic Boris',   priceCents: 4900 },
  { name: 'Tônico Boris',         priceCents: 8900 },
  { name: 'Sobrancelha Navalha',  priceCents: 1000 },
  { name: 'Hidratação',           priceCents: 1500 },
];

// ─── Geração ─────────────────────────────────────────────────────────────────────
// mode: 'done' (dias passados) | 'upcoming' (dias futuros, só confirmados)
function genDay(y, m, d, barber, mode, recurringPool, newPool) {
  const wd = weekdayOf(y, m, d);
  if (wd === 0) return [];                       // domingo fechado
  const endWallMin = (wd === 6 ? 18 : 20) * 60;  // sáb fecha 18, demais 20
  const list = svcByBarber.get(barber.id);
  const out = [];
  let cursor = 9 * 60;                           // começa 09:00
  const count = mode === 'done' ? ri(3, 7) : ri(1, 3);
  for (let i = 0; i < count; i++) {
    const svc = pickService(list);
    const startMin = cursor + ri(0, 2) * 15;
    if (startMin + svc.duration > endWallMin) break;
    const hh = Math.floor(startMin / 60), mm = startMin % 60;

    let status = 'completed', cancelledAt = null, cancelledBy = null;
    if (mode === 'done') {
      const roll = rnd();
      if (roll < 0.08) status = 'no_show';
      else if (roll < 0.12) status = 'confirmed';                    // passado não fechado => "aberto"
      else if (roll < 0.17) { status = 'cancelled';
        cancelledAt = isoUtc(y, m, d, hh, mm); cancelledBy = pick(['customer', 'barber']); }
    } else {
      status = 'confirmed';
    }

    // Telefone: ~60% reaproveita alguém que já veio (recorrente); senão, cliente novo
    const phone = (recurringPool.length && chance(0.6))
      ? pick(recurringPool)
      : pick(newPool);
    const who = personaFor(phone);

    const startsAt = isoUtc(y, m, d, hh, mm);
    const endsAt = new Date(new Date(startsAt).getTime() + svc.duration * 60000).toISOString();
    const createdAt = new Date(new Date(startsAt).getTime() - ri(0, 6) * 86400000).toISOString();

    out.push({
      barberId: barber.id, serviceId: svc.serviceId, name: who.name, phone, birthdate: who.birthdate,
      startsAt, endsAt, duration: svc.duration, priceCents: svc.priceCents, status,
      token: randomBytes(18).toString('base64url'), cancelledAt, cancelledBy,
      notes: MARKER, createdAt, createdBy: chance(0.85) ? 'customer' : 'barber',
      addExtra: status === 'completed' && chance(0.18),
    });

    cursor = startMin + svc.duration + ri(0, 3) * 5;
    if (cursor >= endWallMin) break;
  }
  return out;
}

const all = [];
const prevPhones = new Set();

// Mês anterior: tudo no passado (concluídos/no-show), alimenta recorrência.
for (let d = 1; d <= Math.min(28, daysIn(prevY, prevM)); d++) {
  for (const b of barbersWithSvc) {
    for (const a of genDay(prevY, prevM, d, b, 'done', [], PREV_POOL)) {
      all.push(a); prevPhones.add(a.phone);
    }
  }
}
const recurringPool = [...prevPhones];

// Mês atual: passado (até ontem) = done; futuro (a partir de amanhã) = upcoming.
for (let d = 1; d <= daysIn(curY, curM); d++) {
  if (d === curD) continue; // pula "hoje" pra não brigar com o instante exato de agora
  const mode = d < curD ? 'done' : 'upcoming';
  if (mode === 'upcoming' && d > 28) continue;
  for (const b of barbersWithSvc) {
    for (const a of genDay(curY, curM, d, b, mode, recurringPool, NEW_POOL)) all.push(a);
  }
}

// ─── Inserção (transação) ────────────────────────────────────────────────────────
const insAppt = db.prepare(`
  INSERT INTO appointments
    (barber_id, service_id, customer_name, customer_phone, customer_birthdate,
     starts_at, ends_at, duration_minutes, price_cents, status,
     manage_token, cancelled_at, cancelled_by, notes, created_at, created_by)
  VALUES (@barberId, @serviceId, @name, @phone, @birthdate,
     @startsAt, @endsAt, @duration, @priceCents, @status,
     @token, @cancelledAt, @cancelledBy, @notes, @createdAt, @createdBy)
`);
const insItem = db.prepare(`
  INSERT INTO appointment_items (appointment_id, service_id, name, price_cents)
  VALUES (?, NULL, ?, ?)
`);

const summary = { completed: 0, no_show: 0, confirmed: 0, cancelled: 0, items: 0, realizadoCents: 0, previstoCents: 0 };
const insertAll = db.transaction(() => {
  for (const a of all) {
    const { addExtra, ...row } = a; // não passa chaves extras ao INSERT
    const res = insAppt.run(row);
    summary[a.status]++;
    if (a.status === 'completed') summary.realizadoCents += a.priceCents;
    if (a.status === 'confirmed' && new Date(a.endsAt) > now) summary.previstoCents += a.priceCents;
    if (a.addExtra) {
      const ex = pick(EXTRAS);
      insItem.run(res.lastInsertRowid, ex.name, ex.priceCents);
      summary.items++;
      summary.realizadoCents += ex.priceCents;
    }
  }
});
insertAll();
db.close();

// ─── Resumo ──────────────────────────────────────────────────────────────────────
const brl = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
console.log(`\n✅ Demo gerada: ${all.length} agendamentos fictícios (marcador notes='${MARKER}').`);
console.log(`   Concluídos: ${summary.completed}  |  No-show: ${summary.no_show}  |  Confirmados: ${summary.confirmed}  |  Cancelados: ${summary.cancelled}`);
console.log(`   Itens de comanda: ${summary.items}`);
console.log(`   Faturamento realizado (mês atual + anterior, concluídos+comanda): ${brl(summary.realizadoCents)}`);
console.log(`   Previsto (confirmados futuros): ${brl(summary.previstoCents)}`);
console.log(`\n   Veja em /admin/relatorios (login bayron = barbearia toda; emanuel/jackson = só os deles).`);
console.log(`   Pra remover tudo depois:  node scripts/seed-relatorio-demo.mjs --undo\n`);
