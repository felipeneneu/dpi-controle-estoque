ALTER TABLE `messages` ADD `recipient_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `chat_messages_recipient_idx` ON `messages` (`recipient_id`);--> statement-breakpoint
ALTER TABLE `machine_telemetry` ADD `toner_cyan_pct` real;--> statement-breakpoint
ALTER TABLE `machine_telemetry` ADD `toner_magenta_pct` real;--> statement-breakpoint
ALTER TABLE `machine_telemetry` ADD `toner_yellow_pct` real;--> statement-breakpoint
ALTER TABLE `machine_telemetry` ADD `toner_black_pct` real;--> statement-breakpoint
ALTER TABLE `machine_telemetry` ADD `waste_toner_level` text;--> statement-breakpoint
ALTER TABLE `machine_telemetry` ADD `trays_json` text;--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `os_number` text;--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `color_mode` text;