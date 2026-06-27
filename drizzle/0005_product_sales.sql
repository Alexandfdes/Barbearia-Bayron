CREATE TABLE `product_sales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`barber_id` integer NOT NULL,
	`name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`price_cents` integer NOT NULL,
	`sold_at` text NOT NULL,
	`created_by_id` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`barber_id`) REFERENCES `barbers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `barbers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `product_sales_sold_at_idx` ON `product_sales` (`sold_at`);--> statement-breakpoint
CREATE INDEX `product_sales_barber_idx` ON `product_sales` (`barber_id`);
