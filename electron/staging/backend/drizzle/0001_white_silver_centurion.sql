CREATE TABLE `whatsapp_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`label` text,
	`priority` text DEFAULT 'principal' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
ALTER TABLE `notifications` ADD `acknowledged_at` integer;--> statement-breakpoint
ALTER TABLE `notifications` ADD `item_id` text;--> statement-breakpoint
ALTER TABLE `notifications` ADD `wa_message` text;--> statement-breakpoint
ALTER TABLE `notifications` ADD `alert_level` text;