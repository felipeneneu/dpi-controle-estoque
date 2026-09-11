-- Migration: Cria tabela mimaki_jobs para jobs da Mimaki M2M
-- Esta tabela armazena os jobs recebidos do Mimaki Tracker Electron

CREATE TABLE IF NOT EXISTS `mimaki_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `machine_id` text NOT NULL,
  `folder_timestamp` text NOT NULL,
  `job_name` text NOT NULL,
  `order_code` text,
  `quantity_units` integer NOT NULL DEFAULT 1,
  `pages` integer NOT NULL DEFAULT 1,
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
  `created_at` integer,
  FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`stock_item_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE set null
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS `mimaki_jobs_machine_idx` ON `mimaki_jobs` (`machine_id`);
CREATE UNIQUE INDEX IF NOT EXISTS `mimaki_jobs_folder_ts_idx` ON `mimaki_jobs` (`folder_timestamp`);
