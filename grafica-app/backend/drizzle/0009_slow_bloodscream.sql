CREATE TABLE `bobinas` (
	`id` text PRIMARY KEY NOT NULL,
	`stock_item_id` text NOT NULL,
	`serial` text,
	`width_mm` real,
	`meters_initial` real,
	`meters_remaining` real,
	`state` text DEFAULT 'NEW' NOT NULL,
	`location` text DEFAULT 'deposito' NOT NULL,
	`bobina_opened_at` integer,
	`finished_at` integer,
	`created_at` integer,
	FOREIGN KEY (`stock_item_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bobinas_stock_item_idx` ON `bobinas` (`stock_item_id`);--> statement-breakpoint
CREATE INDEX `bobinas_state_idx` ON `bobinas` (`state`);--> statement-breakpoint
ALTER TABLE `machines` ADD `bleed_adjustment_m` real DEFAULT 0;--> statement-breakpoint
ALTER TABLE `mimaki_jobs` ADD `copy_number` integer;--> statement-breakpoint
ALTER TABLE `mimaki_jobs` ADD `total_print` integer;--> statement-breakpoint
ALTER TABLE `mimaki_jobs` ADD `pass_count` integer;--> statement-breakpoint
ALTER TABLE `mimaki_jobs` ADD `resolution_dpi` integer;--> statement-breakpoint
ALTER TABLE `mimaki_jobs` ADD `print_direction` text;--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `material_status` text DEFAULT 'PENDING_BIND';