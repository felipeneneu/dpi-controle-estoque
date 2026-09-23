CREATE TABLE IF NOT EXISTS `mimaki_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`folder_timestamp` text NOT NULL,
	`job_name` text NOT NULL,
	`order_code` text,
	`quantity_units` integer DEFAULT 1 NOT NULL,
	`pages` integer DEFAULT 1 NOT NULL,
	`width_mm` real NOT NULL,
	`height_mm` real NOT NULL,
	`ink_cyan_cc` real DEFAULT 0,
	`ink_magenta_cc` real DEFAULT 0,
	`ink_yellow_cc` real DEFAULT 0,
	`ink_black_cc` real DEFAULT 0,
	`ink_white1_cc` real DEFAULT 0,
	`ink_white2_cc` real DEFAULT 0,
	`ink_varnish1_cc` real DEFAULT 0,
	`ink_varnish2_cc` real DEFAULT 0,
	`ink_total_cc` real DEFAULT 0,
	`raw_material_name` text,
	`length_meters` real,
	`material_status` text DEFAULT 'PENDING_BIND',
	`stock_item_id` text,
	`stock_deducted` integer DEFAULT false,
	`created_at` integer,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stock_item_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mimaki_jobs_machine_idx` ON `mimaki_jobs` (`machine_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `mimaki_jobs_folder_ts_idx` ON `mimaki_jobs` (`folder_timestamp`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text DEFAULT 'geral' NOT NULL,
	`recipient_id` text,
	`sender_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_messages`("id", "room", "recipient_id", "sender_id", "content", "created_at") SELECT "id", "room", "recipient_id", "sender_id", "content", "created_at" FROM `messages`;--> statement-breakpoint
DROP TABLE `messages`;--> statement-breakpoint
ALTER TABLE `__new_messages` RENAME TO `messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `chat_messages_room_created_idx` ON `messages` (`room`,`created_at`);--> statement-breakpoint
CREATE INDEX `chat_messages_recipient_idx` ON `messages` (`recipient_id`);--> statement-breakpoint
CREATE TABLE `__new_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`type` text DEFAULT 'info' NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`acknowledged_at` integer,
	`item_id` text,
	`wa_message` text,
	`alert_level` text,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_notifications`("id", "user_id", "title", "body", "type", "read", "acknowledged_at", "item_id", "wa_message", "alert_level", "created_at") SELECT "id", "user_id", "title", "body", "type", "read", "acknowledged_at", "item_id", "wa_message", "alert_level", "created_at" FROM `notifications`;--> statement-breakpoint
DROP TABLE `notifications`;--> statement-breakpoint
ALTER TABLE `__new_notifications` RENAME TO `notifications`;--> statement-breakpoint
CREATE INDEX `notifications_user_id_idx` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_stock_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`type` text NOT NULL,
	`quantity` real NOT NULL,
	`reason` text,
	`user_id` text,
	`user_name` text,
	`created_at` integer,
	FOREIGN KEY (`item_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_stock_transactions`("id", "item_id", "type", "quantity", "reason", "user_id", "user_name", "created_at") SELECT "id", "item_id", "type", "quantity", "reason", "user_id", NULL as "user_name", "created_at" FROM `stock_transactions`;--> statement-breakpoint
DROP TABLE `stock_transactions`;--> statement-breakpoint
ALTER TABLE `__new_stock_transactions` RENAME TO `stock_transactions`;--> statement-breakpoint
CREATE INDEX `stock_transactions_item_id_idx` ON `stock_transactions` (`item_id`);--> statement-breakpoint
CREATE INDEX `stock_transactions_item_created_idx` ON `stock_transactions` (`item_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `roll_width_used` real;--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `linear_meters_debited` real;--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `hidden` integer DEFAULT false;