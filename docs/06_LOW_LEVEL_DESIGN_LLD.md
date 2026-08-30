# 📐 Low-Level Design (LLD) & Data Model

---

### Schema do Banco de Dados (`src/db/schema.ts`)

```typescript
import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

// 1. Tabela de Usuários e RBAC
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['DEV_MASTER', 'ADMIN', 'OPERATOR'] }).notNull().default('OPERATOR'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// 2. Tabela de Impressoras
export const machines = sqliteTable('machines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  brand: text('brand').notNull(),
  model: text('model').notNull(),
  technology: text('technology').notNull(),
  status: text('status', { enum: ['ACTIVE', 'MAINTENANCE', 'INACTIVE'] }).default('ACTIVE'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// 3. Tabela de Insumos (Papéis, Bobinas, Tintas)
export const stockItems = sqliteTable('stock_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category', { enum: ['PAPER_MEDIA', 'INK_SUPPLY', 'OTHER'] }).notNull(),
  subType: text('sub_type'),
  unit: text('unit').notNull(), // 'm', 'fls', 'ml', 'L'
  currentQuantity: real('current_quantity').notNull().default(0),
  minQuantity: real('min_quantity').notNull().default(0),
  unitPrice: real('unit_price').notNull().default(0),
  imageUrl: text('image_url'),
  status: text('status', { enum: ['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'] }).default('AVAILABLE'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// 4. Histórico de Movimentações
export const stockTransactions = sqliteTable('stock_transactions', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull().references(() => stockItems.id),
  type: text('type', { enum: ['IN', 'OUT', 'ADJUSTMENT'] }).notNull(),
  quantity: real('quantity').notNull(),
  reason: text('reason'),
  userId: text('user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
```
