CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`short_desc` text,
	`price_cents` integer NOT NULL,
	`image` text,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `products_active_idx` ON `products` (`active`);--> statement-breakpoint
INSERT INTO `products` (`slug`,`name`,`short_desc`,`price_cents`,`image`,`active`,`sort_order`) VALUES
('oleo-mentolado-boris','Óleo Mentolado Boris','Garante brilho e proteção todos os dias. Nutre, hidrata e protege cada fio da sua barba.',4500,'/products/oleo-mentolado6.jpeg',1,1),
('balm-classic-boris','Balm Classic Boris','Fórmula rica em ativos hidratantes. Reduz oleosidade, acalma a pele e mantém a barba alinhada.',4900,'/products/balm-classic4.jpeg',1,2),
('tonico-boris','Tônico Boris','Desenvolvido para falhas na barba e calvície. Estimula o crescimento e dá volume aos fios.',8900,'/products/tonico4.jpeg',1,3);
