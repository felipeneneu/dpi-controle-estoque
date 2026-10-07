CREATE TABLE `ink_consumption_log` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`machine_id` text NOT NULL,
	`channel` text NOT NULL,
	`ml_consumed` real NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ink_consumption_log_machine_idx` ON `ink_consumption_log` (`machine_id`);--> statement-breakpoint
CREATE INDEX `ink_consumption_log_channel_idx` ON `ink_consumption_log` (`channel`);--> statement-breakpoint
CREATE INDEX `ink_consumption_log_created_idx` ON `ink_consumption_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `tinta_lotes` (
	`id` text PRIMARY KEY NOT NULL,
	`stock_item_id` text NOT NULL,
	`serial` text,
	`state` text DEFAULT 'NEW' NOT NULL,
	`location` text DEFAULT 'deposito' NOT NULL,
	`machine_id` text,
	`channel` text,
	`opened_at` integer,
	`finished_at` integer,
	`created_at` integer,
	FOREIGN KEY (`stock_item_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tinta_lotes_stock_item_idx` ON `tinta_lotes` (`stock_item_id`);--> statement-breakpoint
CREATE INDEX `tinta_lotes_state_idx` ON `tinta_lotes` (`state`);--> statement-breakpoint
CREATE INDEX `tinta_lotes_machine_idx` ON `tinta_lotes` (`machine_id`);--> statement-breakpoint
CREATE INDEX `tinta_lotes_channel_idx` ON `tinta_lotes` (`channel`);--> statement-breakpoint
CREATE UNIQUE INDEX `tinta_lotes_active_channel_idx` ON `tinta_lotes` (`machine_id`,`channel`) WHERE state = 'IN_USE';