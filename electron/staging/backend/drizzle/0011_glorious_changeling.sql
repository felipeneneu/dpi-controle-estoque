CREATE TABLE `mimaki_test_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text DEFAULT 'mimaki-teste' NOT NULL,
	`source_file` text NOT NULL,
	`key_filename` text NOT NULL,
	`result` text NOT NULL,
	`result_detail` text,
	`arrange_cnt` integer,
	`ink_cyan_cc` real DEFAULT 0,
	`ink_magenta_cc` real DEFAULT 0,
	`ink_yellow_cc` real DEFAULT 0,
	`ink_black_cc` real DEFAULT 0,
	`ink_white1_cc` real DEFAULT 0,
	`ink_white2_cc` real DEFAULT 0,
	`ink_varnish1_cc` real DEFAULT 0,
	`ink_varnish2_cc` real DEFAULT 0,
	`ink_total_cc` real DEFAULT 0,
	`rip_s_time` text,
	`rip_e_time` text,
	`print_s_time` text,
	`print_e_time` text,
	`parsed_order_code` text,
	`parsed_client` text,
	`parsed_material` text,
	`parsed_width_mm` real,
	`parsed_height_mm` real,
	`parsed_units` integer,
	`parsed_copies` integer,
	`parse_errors` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE INDEX `mimaki_test_channel_idx` ON `mimaki_test_jobs` (`channel`);--> statement-breakpoint
CREATE UNIQUE INDEX `mimaki_test_dedupe_idx` ON `mimaki_test_jobs` (`source_file`,`key_filename`,`print_s_time`);