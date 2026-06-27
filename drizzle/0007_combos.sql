CREATE TABLE `combos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`service_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`discount_pct` integer DEFAULT 10 NOT NULL,
	`weekdays` integer DEFAULT 0 NOT NULL,
	`image` text,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `combos_active_idx` ON `combos` (`active`);--> statement-breakpoint
INSERT INTO `combos` (`name`,`service_id`,`product_id`,`discount_pct`,`weekdays`,`active`,`sort_order`)
SELECT 'Combo Boris', s.id, p.id, 10, 127, 1, 1
FROM `services` s, `products` p
WHERE s.slug = 'degrade-barba' AND p.slug = 'oleo-mentolado-boris';
