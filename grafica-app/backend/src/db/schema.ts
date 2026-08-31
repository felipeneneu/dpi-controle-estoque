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
  status: text('status', { enum: ['ACTIVE', 'MAINTENANCE', 'INACTIVE'] }).default('ACTIVE'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const stockItems = sqliteTable('stock_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category', { enum: ['PAPER_MEDIA', 'INK_SUPPLY', 'OTHER'] }).notNull(),
  subType: text('sub_type'),
  unit: text('unit').notNull(),
  width: real('width'),
  currentQuantity: real('current_quantity').notNull().default(0),
  minQuantity: real('min_quantity').notNull().default(0),
  imageUrl: text('image_url'),
  status: text('status', { enum: ['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'] }).default('AVAILABLE'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

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
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
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
  senderId: text('sender_id')
    .notNull()
    .references(() => users.id),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => [
  index('chat_messages_room_created_idx').on(t.room, t.createdAt),
]);

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  title: text('title').notNull(),
  body: text('body'),
  type: text('type').notNull().default('info'),
  read: integer('read', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => [
  index('notifications_user_id_idx').on(t.userId),
]);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Machine = typeof machines.$inferSelect;
export type StockItem = typeof stockItems.$inferSelect;
export type StockTransaction = typeof stockTransactions.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type MachineItem = typeof machineItems.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Settings = typeof settings.$inferSelect;
