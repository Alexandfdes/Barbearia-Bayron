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
}, (table) => [
  index('appt_barber_date_idx').on(table.barberId, table.startsAt),
  index('appt_phone_idx').on(table.customerPhone),
]);
