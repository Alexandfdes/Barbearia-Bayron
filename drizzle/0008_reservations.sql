CREATE TABLE `reservations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer,
	`product_name` text NOT NULL,
	`price_cents` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`customer_name` text NOT NULL,
	`customer_phone` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`handled_by_id` integer,
	`handled_at` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`handled_by_id`) REFERENCES `barbers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reservations_status_idx` ON `reservations` (`status`);
