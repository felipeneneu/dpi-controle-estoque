import { sqliteTable, text, real, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['DEV_MASTER', 'ADMIN', 'OPERATOR'] })
    .notNull()
    .default('OPERATOR'),
  avatar: text('avatar'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const machines = sqliteTable('machines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  brand: text('brand').notNull(),
  model: text('model').notNull(),
  technology: text('technology').notNull(),
  imageUrl: text('image_url'),
  ip: text('ip'),
  status: text('status', { enum: ['ACTIVE', 'MAINTENANCE', 'INACTIVE'] }).default('ACTIVE'),
  bleedAdjustmentM: real('bleed_adjustment_m').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const stockItems = sqliteTable('stock_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category', { enum: ['PAPER_MEDIA', 'INK_SUPPLY', 'OTHER'] }).notNull(),
  subType: text('sub_type'),
  unit: text('unit').notNull(),
  width: real('width'),
  code: text('code'),
  currentQuantity: real('current_quantity').notNull().default(0),
  minQuantity: real('min_quantity').notNull().default(0),
  imageUrl: text('image_url'),
  label: text('label'),
  status: text('status', { enum: ['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'] }).default('AVAILABLE'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const bobinas = sqliteTable('bobinas', {
  id: text('id').primaryKey(),
  stockItemId: text('stock_item_id')
    .notNull()
    .references(() => stockItems.id, { onDelete: 'cascade' }),
  serial: text('serial'),
  widthMm: real('width_mm'),
  metersInitial: real('meters_initial'),
  metersRemaining: real('meters_remaining'),
  state: text('state', { enum: ['NEW', 'IN_USE', 'USED', 'BLOCKED', 'SCRAPPED'] }).notNull().default('NEW'),
  location: text('location').notNull().default('deposito'),
  bobinaOpenedAt: integer('bobina_opened_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => [
  index('bobinas_stock_item_idx').on(t.stockItemId),
  index('bobinas_state_idx').on(t.state),
]);

export const garrafas = sqliteTable('garrafas', {
  id: text('id').primaryKey(),
  stockItemId: text('stock_item_id')
    .notNull()
    .references(() => stockItems.id, { onDelete: 'cascade' }),
  serial: text('serial'),
  mlInitial: real('ml_initial'),
  mlRemaining: real('ml_remaining'),
  state: text('state', { enum: ['NEW', 'IN_USE', 'USED', 'BLOCKED', 'SCRAPPED'] }).notNull().default('NEW'),
  location: text('location').notNull().default('deposito'),
  garrafaOpenedAt: integer('garrafa_opened_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => [
  index('garrafas_stock_item_idx').on(t.stockItemId),
  index('garrafas_state_idx').on(t.state),
]);

export const machineItems = sqliteTable('machine_items', {
  id: text('id').primaryKey(),
  machineId: text('machine_id')
    .notNull()
    .references(() => machines.id, { onDelete: 'cascade' }),
  stockItemId: text('stock_item_id')
    .notNull()
    .references(() => stockItems.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => [
  index('machine_items_machine_id_idx').on(t.machineId),
  index('machine_items_stock_item_id_idx').on(t.stockItemId),
  uniqueIndex('machine_items_pair_idx').on(t.machineId, t.stockItemId),
]);

export const stockTransactions = sqliteTable('stock_transactions', {
  id: text('id').primaryKey(),
  itemId: text('item_id')
    .notNull()
    .references(() => stockItems.id),
  type: text('type', { enum: ['IN', 'OUT', 'ADJUSTMENT'] }).notNull(),
  quantity: real('quantity').notNull(),
  reason: text('reason'),
  userId: text('user_id'),
  userName: text('user_name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => [
  index('stock_transactions_item_id_idx').on(t.itemId),
  index('stock_transactions_item_created_idx').on(t.itemId, t.createdAt),
]);

export const suppliers = sqliteTable('suppliers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  contact: text('contact'),
  phone: text('phone'),
  email: text('email'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const chatMessages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  room: text('room').notNull().default('geral'),
  recipientId: text('recipient_id').references(() => users.id, { onDelete: 'cascade' }),
  senderId: text('sender_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => [
  index('chat_messages_room_created_idx').on(t.room, t.createdAt),
  index('chat_messages_recipient_idx').on(t.recipientId),
]);

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body'),
  type: text('type').notNull().default('info'),
  read: integer('read', { mode: 'boolean' }).notNull().default(false),
  acknowledgedAt: integer('acknowledged_at', { mode: 'timestamp' }),
  itemId: text('item_id'),
  waMessage: text('wa_message'),
  alertLevel: text('alert_level', { enum: ['LOW_STOCK', 'OUT_OF_STOCK'] }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => [
  index('notifications_user_id_idx').on(t.userId),
]);

export const whatsappRecipients = sqliteTable('whatsapp_recipients', {
  id: text('id').primaryKey(),
  phone: text('phone').notNull(),
  label: text('label'),
  priority: text('priority', { enum: ['principal', 'backup'] }).notNull().default('principal'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const machineTelemetry = sqliteTable('machine_telemetry', {
  id: text('id').primaryKey(),
  machineId: text('machine_id')
    .notNull()
    .references(() => machines.id, { onDelete: 'cascade' }),
  online: integer('online', { mode: 'boolean' }).notNull().default(false),
  statusSeverity: text('status_severity'),
  statusMessage: text('status_message'),

  mediaName: text('media_name'),
  mediaWidthMm: real('media_width_mm'),

  inkCyanMl: real('ink_cyan_ml'),
  inkLightCyanMl: real('ink_light_cyan_ml'),
  inkMagentaMl: real('ink_magenta_ml'),
  inkLightMagentaMl: real('ink_light_magenta_ml'),
  inkYellowMl: real('ink_yellow_ml'),
  inkBlackMl: real('ink_black_ml'),
  inkOptimizerMl: real('ink_optimizer_ml'),
  inkCapacityMl: real('ink_capacity_ml'),

  // Konica / AccurioPrint — toner em % (CMYK) e bandejas de papel.
  tonerCyanPct: real('toner_cyan_pct'),
  tonerMagentaPct: real('toner_magenta_pct'),
  tonerYellowPct: real('toner_yellow_pct'),
  tonerBlackPct: real('toner_black_pct'),
  wasteTonerLevel: text('waste_toner_level'),
  traysJson: text('trays_json'),

  maintenanceCartridgePct: real('maintenance_cartridge_pct'),
  kit1Pct: real('kit_1_pct'),
  kit2Pct: real('kit_2_pct'),
  kit3Pct: real('kit_3_pct'),

  dryingTempC: real('drying_temp_c'),
  curingTempC: real('curing_temp_c'),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => [
  index('machine_telemetry_machine_idx').on(t.machineId),
]);

export const printJobs = sqliteTable('print_jobs', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull(),
  jobName: text('job_name').notNull(),
  machineId: text('machine_id').notNull().references(() => machines.id),
  ripType: text('rip_type').notNull().default('hp-ews'),

  inkCyanMl: real('ink_cyan_ml').default(0),
  inkLightCyanMl: real('ink_light_cyan_ml').default(0),
  inkMagentaMl: real('ink_magenta_ml').default(0),
  inkLightMagentaMl: real('ink_light_magenta_ml').default(0),
  inkYellowMl: real('ink_yellow_ml').default(0),
  inkBlackMl: real('ink_black_ml').default(0),
  inkOptimizerMl: real('ink_optimizer_ml').default(0),
  inkTotalMl: real('ink_total_ml').default(0),

  mediaType: text('media_type'),
  mediaAreaM2: real('media_area_m2'),
  pages: integer('pages'),
  sheets: real('sheets'),

  osNumber: text('os_number'),
  colorMode: text('color_mode'),

  resolutionDpi: integer('resolution_dpi'),
  passCount: integer('pass_count'),
  printDirection: text('print_direction'),
  printMode: text('print_mode'),
  optimizerEnabled: integer('optimizer_enabled', { mode: 'boolean' }).default(false),
  inkProfile: text('ink_profile'),

  status: text('status').default('completed'),
  materialStatus: text('material_status', { enum: ['BOUND', 'PENDING_BIND'] }).default('PENDING_BIND'),
  printEndDate: text('print_end_date'),

  stockDeducted: integer('stock_deducted', { mode: 'boolean' }).default(false),
  deductedAt: text('deducted_at'),
  rollWidthUsed: real('roll_width_used'),        // Largura da bobina usada na conversão (m)
  linearMetersDebited: real('linear_meters_debited'), // Metros lineares debitados
  hidden: integer('hidden', { mode: 'boolean' }).default(false),

  rawDataJson: text('raw_data_json'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => [
  index('print_jobs_machine_id_idx').on(t.machineId),
  index('print_jobs_date_idx').on(t.printEndDate),
  index('print_jobs_deducted_idx').on(t.stockDeducted),
  uniqueIndex('print_jobs_job_id_idx').on(t.jobId),
]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Machine = typeof machines.$inferSelect;
export type StockItem = typeof stockItems.$inferSelect;
export type Bobina = typeof bobinas.$inferSelect;
export type NewBobina = typeof bobinas.$inferInsert;
export type Garrafa = typeof garrafas.$inferSelect;
export type NewGarrafa = typeof garrafas.$inferInsert;
export type StockTransaction = typeof stockTransactions.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type MachineItem = typeof machineItems.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type WhatsappRecipient = typeof whatsappRecipients.$inferSelect;
export type NewWhatsappRecipient = typeof whatsappRecipients.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export const mimakiJobs = sqliteTable('mimaki_jobs', {
  id: text('id').primaryKey(),
  machineId: text('machine_id').notNull().references(() => machines.id),
  folderTimestamp: text('folder_timestamp').notNull(),
  jobName: text('job_name').notNull(),
  orderCode: text('order_code'),
  quantityUnits: integer('quantity_units').notNull().default(1),
  pages: integer('pages').notNull().default(1),
  widthMm: real('width_mm').notNull(),
  heightMm: real('height_mm').notNull(),
  inkCyanCc: real('ink_cyan_cc').default(0),
  inkMagentaCc: real('ink_magenta_cc').default(0),
  inkYellowCc: real('ink_yellow_cc').default(0),
  inkBlackCc: real('ink_black_cc').default(0),
  inkWhite1Cc: real('ink_white1_cc').default(0),
  inkWhite2Cc: real('ink_white2_cc').default(0),
  inkVarnish1Cc: real('ink_varnish1_cc').default(0),
  inkVarnish2Cc: real('ink_varnish2_cc').default(0),
  inkTotalCc: real('ink_total_cc').default(0),
  rawMaterialName: text('raw_material_name'),
  lengthMeters: real('length_meters'),
  copyNumber: integer('copy_number'),
  totalPrint: integer('total_print'),
  passCount: integer('pass_count'),
  resolutionDpi: integer('resolution_dpi'),
  printDirection: text('print_direction'),
  materialStatus: text('material_status', { enum: ['BOUND', 'PENDING_BIND'] }).default('PENDING_BIND'),
  stockItemId: text('stock_item_id').references(() => stockItems.id),
  stockDeducted: integer('stock_deducted', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => [
  index('mimaki_jobs_machine_idx').on(t.machineId),
  uniqueIndex('mimaki_jobs_folder_ts_idx').on(t.folderTimestamp),
]);

export const mimakiTestJobs = sqliteTable(
  'mimaki_test_jobs',
  {
    id: text('id').primaryKey(),
    channel: text('channel').notNull().default('mimaki-teste'),
    sourceFile: text('source_file').notNull(),
    keyFilename: text('key_filename').notNull(),
    result: text('result', { enum: ['OK', 'NG'] }).notNull(),
    resultDetail: text('result_detail'),
    arrangeCnt: integer('arrange_cnt'),
    inkCyanCc: real('ink_cyan_cc').default(0),
    inkMagentaCc: real('ink_magenta_cc').default(0),
    inkYellowCc: real('ink_yellow_cc').default(0),
    inkBlackCc: real('ink_black_cc').default(0),
    inkWhite1Cc: real('ink_white1_cc').default(0),
    inkWhite2Cc: real('ink_white2_cc').default(0),
    inkVarnish1Cc: real('ink_varnish1_cc').default(0),
    inkVarnish2Cc: real('ink_varnish2_cc').default(0),
    inkTotalCc: real('ink_total_cc').default(0),
    ripSTime: text('rip_s_time'),
    ripETime: text('rip_e_time'),
    printSTime: text('print_s_time'),
    printETime: text('print_e_time'),
    parsedOrderCode: text('parsed_order_code'),
    parsedClient: text('parsed_client'),
    parsedMaterial: text('parsed_material'),
    parsedWidthMm: real('parsed_width_mm'),
    parsedHeightMm: real('parsed_height_mm'),
    parsedUnits: integer('parsed_units'),
    parsedCopies: integer('parsed_copies'),
    parseErrors: text('parse_errors'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (t) => [
    index('mimaki_test_channel_idx').on(t.channel),
    uniqueIndex('mimaki_test_dedupe_idx').on(t.sourceFile, t.keyFilename, t.printSTime),
  ],
);

export type PrintJob = typeof printJobs.$inferSelect;
export type NewPrintJob = typeof printJobs.$inferInsert;
export type MachineTelemetry = typeof machineTelemetry.$inferSelect;
export type NewMachineTelemetry = typeof machineTelemetry.$inferInsert;
export type MimakiJob = typeof mimakiJobs.$inferSelect;
export type NewMimakiJob = typeof mimakiJobs.$inferInsert;
export type MimakiTestJob = typeof mimakiTestJobs.$inferSelect;
export type NewMimakiTestJob = typeof mimakiTestJobs.$inferInsert;
