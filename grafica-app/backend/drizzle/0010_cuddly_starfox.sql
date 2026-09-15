CREATE TABLE `garrafas` (
	`id` text PRIMARY KEY NOT NULL,
	`stock_item_id` text NOT NULL,
	`serial` text,
	`ml_initial` real,
	`ml_remaining` real,
	`state` text DEFAULT 'NEW' NOT NULL,
	`location` text DEFAULT 'deposito' NOT NULL,
	`garrafa_opened_at` integer,
	`finished_at` integer,
	`created_at` integer,
	FOREIGN KEY (`stock_item_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `garrafas_stock_item_idx` ON `garrafas` (`stock_item_id`);--> statement-breakpoint
CREATE INDEX `garrafas_state_idx` ON `garrafas` (`state`);