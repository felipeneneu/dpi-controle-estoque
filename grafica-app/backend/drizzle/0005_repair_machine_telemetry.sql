CREATE TABLE IF NOT EXISTS `machine_telemetry` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`online` integer DEFAULT false NOT NULL,
	`status_severity` text,
	`status_message` text,
	`media_name` text,
	`media_width_mm` real,
	`ink_cyan_ml` real,
	`ink_light_cyan_ml` real,
	`ink_magenta_ml` real,
	`ink_light_magenta_ml` real,
	`ink_yellow_ml` real,
	`ink_black_ml` real,
	`ink_optimizer_ml` real,
	`ink_capacity_ml` real,
	`maintenance_cartridge_pct` real,
	`kit_1_pct` real,
	`kit_2_pct` real,
	`kit_3_pct` real,
	`drying_temp_c` real,
	`curing_temp_c` real,
	`created_at` integer,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `machine_telemetry_machine_idx` ON `machine_telemetry` (`machine_id`);
