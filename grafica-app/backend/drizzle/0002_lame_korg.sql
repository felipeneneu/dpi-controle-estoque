CREATE TABLE `print_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`job_name` text NOT NULL,
	`machine_id` text NOT NULL,
	`rip_type` text DEFAULT 'hp-ews' NOT NULL,
	`ink_cyan_ml` real DEFAULT 0,
	`ink_light_cyan_ml` real DEFAULT 0,
	`ink_magenta_ml` real DEFAULT 0,
	`ink_light_magenta_ml` real DEFAULT 0,
	`ink_yellow_ml` real DEFAULT 0,
	`ink_black_ml` real DEFAULT 0,
	`ink_optimizer_ml` real DEFAULT 0,
	`ink_total_ml` real DEFAULT 0,
	`media_type` text,
	`media_area_m2` real,
	`resolution_dpi` integer,
	`pass_count` integer,
	`print_direction` text,
	`print_mode` text,
	`optimizer_enabled` integer DEFAULT false,
	`ink_profile` text,
	`status` text DEFAULT 'completed',
	`print_end_date` text,
	`stock_deducted` integer DEFAULT false,
	`deducted_at` text,
	`raw_data_json` text,
	`created_at` integer,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `print_jobs_machine_id_idx` ON `print_jobs` (`machine_id`);--> statement-breakpoint
CREATE INDEX `print_jobs_date_idx` ON `print_jobs` (`print_end_date`);--> statement-breakpoint
CREATE INDEX `print_jobs_deducted_idx` ON `print_jobs` (`stock_deducted`);--> statement-breakpoint
CREATE UNIQUE INDEX `print_jobs_job_id_idx` ON `print_jobs` (`job_id`);