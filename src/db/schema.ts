import { sqliteTable, integer, text, unique, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const barbers = sqliteTable('barbers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  role: text('role', { enum: ['admin', 'barber'] }).notNull(),
  passwordHash: text('password_hash').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const services = sqliteTable('services', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  priceCents: integer('price_cents').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const barberServices = sqliteTable('barber_services', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  barberId: integer('barber_id').notNull().references(() => barbers.id),
  serviceId: integer('service_id').notNull().references(() => services.id),
  durationMinutes: integer('duration_minutes').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
}, (table) => [
  unique('uniq_barber_service').on(table.barberId, table.serviceId),
]);

export const workingHours = sqliteTable('working_hours', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  barberId: integer('barber_id').notNull().references(() => barbers.id),
  weekday: integer('weekday').notNull(), // 0=domingo, 1=segunda...6=sábado
  startTime: text('start_time').notNull(), // "HH:MM"
  endTime: text('end_time').notNull(),     // "HH:MM"
});

export const timeOff = sqliteTable('time_off', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  barberId: integer('barber_id').references(() => barbers.id), // null = vale pra todos (feriado)
  startsAt: text('starts_at').notNull(), // timestamp UTC ISO string
  endsAt: text('ends_at').notNull(),
  reason: text('reason'),
  createdBy: integer('created_by').notNull().references(() => barbers.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const appointments = sqliteTable('appointments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  barberId: integer('barber_id').notNull().references(() => barbers.id),
  serviceId: integer('service_id').notNull().references(() => services.id),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  customerBirthdate: text('customer_birthdate'), // 'YYYY-MM-DD'; nullable pra registros antigos
  startsAt: text('starts_at').notNull(), // timestamp UTC ISO string
  endsAt: text('ends_at').notNull(),
  durationMinutes: integer('duration_minutes').notNull(), // snapshot no booking
  priceCents: integer('price_cents').notNull(),           // snapshot no booking
  status: text('status', { enum: ['confirmed', 'cancelled', 'completed', 'no_show'] })
    .notNull()
    .default('confirmed'),
  manageToken: text('manage_token').notNull().unique(),
  cancelledAt: text('cancelled_at'),
  cancelledBy: text('cancelled_by', { enum: ['customer', 'barber', 'admin'] }),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  createdBy: text('created_by', { enum: ['customer', 'barber'] }).notNull().default('customer'),
  /** Quem fez a última modificação (cancel/reschedule/notes/customer edit) */
  lastModifiedById: integer('last_modified_by_id').references(() => barbers.id),
  lastModifiedAt:   text('last_modified_at'),
  /** Chave de idempotência pra evitar duplo booking */
  idempotencyKey:   text('idempotency_key'),
}, (table) => [
  index('appt_barber_date_idx').on(table.barberId, table.startsAt),
  index('appt_phone_idx').on(table.customerPhone),
]);

// Itens extras cobrados no fechamento do atendimento (a "comanda"): o que o
// cliente consumiu além do serviço agendado — ex.: agendou corte, fez barba também.
// priceCents e name são snapshot no momento do fechamento.
export const appointmentItems = sqliteTable('appointment_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  appointmentId: integer('appointment_id').notNull().references(() => appointments.id),
  serviceId: integer('service_id').references(() => services.id), // null = item avulso
  name: text('name').notNull(),
  priceCents: integer('price_cents').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('appt_items_appt_idx').on(table.appointmentId),
]);

// Venda de produto avulsa — produto vendido no balcão SEM estar ligado a um
// agendamento (ex.: cliente entra só pra comprar um óleo Boris). Entra no
// faturamento como "produto". priceCents é o total da linha (quantidade × unitário).
export const productSales = sqliteTable('product_sales', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  barberId: integer('barber_id').notNull().references(() => barbers.id),
  name: text('name').notNull(),
  quantity: integer('quantity').notNull().default(1),
  priceCents: integer('price_cents').notNull(),
  soldAt: text('sold_at').notNull(), // timestamp UTC ISO string
  createdById: integer('created_by_id').notNull().references(() => barbers.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('product_sales_sold_at_idx').on(table.soldAt),
  index('product_sales_barber_idx').on(table.barberId),
]);

// Catálogo de produtos (linha Boris) — gerenciável pelo barbeiro no admin.
// Alimenta os cards da landing, o combo e a venda avulsa. image é um caminho:
// /products/... (estático em public) ou /api/products/image/... (upload no volume).
export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  shortDesc: text('short_desc'),
  priceCents: integer('price_cents').notNull(),
  image: text('image'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('products_active_idx').on(table.active),
]);

// Combos do dia — gerenciáveis pelo barbeiro. Cada combo é um serviço + um produto
// fixos, com desconto próprio (discountPct), e aparece nos dias marcados em `weekdays`
// (bitmask: bit i = dia da semana i, 0=domingo … 6=sábado; 127 = todos os dias).
export const combos = sqliteTable('combos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  serviceId: integer('service_id').notNull().references(() => services.id),
  productId: integer('product_id').notNull().references(() => products.id),
  discountPct: integer('discount_pct').notNull().default(10),
  weekdays: integer('weekdays').notNull().default(0),
  image: text('image'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('combos_active_idx').on(table.active),
]);
