-- ADR-052 / BR-052: cartucho de tinta/toner como ativo por canal.
-- Aditivo: cria 2 tabelas, 2 colunas no ledger e 2 indices. Sem DROP, entao o
-- rollback e so ignorar `cartuchos` (os itens voltam ao agregado por ADJUSTMENT).
ALTER TABLE `stock_transactions` ADD COLUMN `source` text;--> statement-breakpoint
ALTER TABLE `stock_transactions` ADD COLUMN `source_ref` text;--> statement-breakpoint
CREATE TABLE `cartuchos` (
	`id` text PRIMARY KEY NOT NULL,
	`stock_item_id` text NOT NULL,
	`channel` text NOT NULL,
	`unit` text NOT NULL,
	`level_initial` real NOT NULL,
	`level_current` real NOT NULL,
	`level_capacity` real,
	`state` text DEFAULT 'NEW' NOT NULL,
	`location` text DEFAULT 'deposito' NOT NULL,
	`machine_id` text,
	`cartridge_code` text,
	`telemetry_sku` text,
	`last_telemetry_at` integer,
	`opened_at` integer,
	`finished_at` integer,
	`created_at` integer,
	FOREIGN KEY (`stock_item_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE INDEX `cartuchos_stock_item_idx` ON `cartuchos` (`stock_item_id`);--> statement-breakpoint
CREATE INDEX `cartuchos_state_idx` ON `cartuchos` (`state`);--> statement-breakpoint
CREATE INDEX `cartuchos_machine_idx` ON `cartuchos` (`machine_id`);--> statement-breakpoint
CREATE INDEX `cartuchos_channel_idx` ON `cartuchos` (`channel`);--> statement-breakpoint
CREATE INDEX `cartuchos_code_idx` ON `cartuchos` (`cartridge_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `cartuchos_active_channel_idx` ON `cartuchos` (`machine_id`,`channel`) WHERE state = 'IN_USE';--> statement-breakpoint
CREATE TABLE `cartucho_consumo` (
	`id` text PRIMARY KEY NOT NULL,
	`cartucho_id` text NOT NULL,
	`machine_id` text,
	`job_id` text,
	`job_name` text,
	`channel` text NOT NULL,
	`quantity` real NOT NULL,
	`level_before` real NOT NULL,
	`level_after` real NOT NULL,
	`unit` text NOT NULL,
	`attribution` text DEFAULT 'estimated' NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`cartucho_id`) REFERENCES `cartuchos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE INDEX `cartucho_consumo_cartucho_idx` ON `cartucho_consumo` (`cartucho_id`);--> statement-breakpoint
CREATE INDEX `cartucho_consumo_job_idx` ON `cartucho_consumo` (`job_id`);--> statement-breakpoint
CREATE INDEX `cartucho_consumo_created_idx` ON `cartucho_consumo` (`cartucho_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `stock_transactions_source_idx` ON `stock_transactions` (`item_id`,`source`);--> statement-breakpoint
CREATE INDEX `stock_items_code_idx` ON `stock_items` (`code`);