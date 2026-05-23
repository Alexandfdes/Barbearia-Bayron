-- Auditoria de modificações: quem mexeu por último e quando
ALTER TABLE `appointments` ADD `last_modified_by_id` integer REFERENCES `barbers`(`id`);
--> statement-breakpoint
ALTER TABLE `appointments` ADD `last_modified_at` text;
--> statement-breakpoint
-- Idempotência no booking público: evita duplo POST criando 2 agendamentos
ALTER TABLE `appointments` ADD `idempotency_key` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `appt_idempotency_key_unique` ON `appointments` (`idempotency_key`) WHERE `idempotency_key` IS NOT NULL;
