CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text DEFAULT 'geral' NOT NULL,
	`sender_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `chat_messages_room_created_idx` ON `messages` (`room`,`created_at`);--> statement-breakpoint
CREATE TABLE `machine_items` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`stock_item_id` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stock_item_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `machine_items_machine_id_idx` ON `machine_items` (`machine_id`);--> statement-breakpoint
CREATE INDEX `machine_items_stock_item_id_idx` ON `machine_items` (`stock_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `machine_items_pair_idx` ON `machine_items` (`machine_id`,`stock_item_id`);--> statement-breakpoint
CREATE TABLE `machines` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brand` text NOT NULL,
	`model` text NOT NULL,
	`technology` text NOT NULL,
	`image_url` text,
	`status` text DEFAULT 'ACTIVE',
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`type` text DEFAULT 'info' NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notifications_user_id_idx` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `stock_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`sub_type` text,
	`unit` text NOT NULL,
	`width` real,
	`current_quantity` real DEFAULT 0 NOT NULL,
	`min_quantity` real DEFAULT 0 NOT NULL,
	`image_url` text,
	`status` text DEFAULT 'AVAILABLE',
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `stock_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`type` text NOT NULL,
	`quantity` real NOT NULL,
	`reason` text,
	`user_id` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`item_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stock_transactions_item_id_idx` ON `stock_transactions` (`item_id`);--> statement-breakpoint
CREATE INDEX `stock_transactions_item_created_idx` ON `stock_transactions` (`item_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact` text,
	`phone` text,
	`email` text,
	`notes` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'OPERATOR' NOT NULL,
	`avatar` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);