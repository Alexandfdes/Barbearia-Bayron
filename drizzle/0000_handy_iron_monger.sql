CREATE TABLE `appointments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`barber_id` integer NOT NULL,
	`service_id` integer NOT NULL,
	`customer_name` text NOT NULL,
	`customer_phone` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`price_cents` integer NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`manage_token` text NOT NULL,
	`cancelled_at` text,
	`cancelled_by` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` text DEFAULT 'customer' NOT NULL,
	FOREIGN KEY (`barber_id`) REFERENCES `barbers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `appointments_manage_token_unique` ON `appointments` (`manage_token`);--> statement-breakpoint
CREATE INDEX `appt_barber_date_idx` ON `appointments` (`barber_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `appt_phone_idx` ON `appointments` (`customer_phone`);--> statement-breakpoint
CREATE TABLE `barber_services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`barber_id` integer NOT NULL,
	`service_id` integer NOT NULL,
	`duration_minutes` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`barber_id`) REFERENCES `barbers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_barber_service` ON `barber_services` (`barber_id`,`service_id`);--> statement-breakpoint
CREATE TABLE `barbers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `barbers_slug_unique` ON `barbers` (`slug`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`price_cents` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `services_slug_unique` ON `services` (`slug`);--> statement-breakpoint
CREATE TABLE `time_off` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`barber_id` integer,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`reason` text,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`barber_id`) REFERENCES `barbers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `barbers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `working_hours` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`barber_id` integer NOT NULL,
	`weekday` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	FOREIGN KEY (`barber_id`) REFERENCES `barbers`(`id`) ON UPDATE no action ON DELETE no action
);
