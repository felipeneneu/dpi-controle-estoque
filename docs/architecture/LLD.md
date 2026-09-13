> **Versão:** 1.0.0 \
> **Status:** ATIVO \
> **Owner:** Felipe \
> **Última atualização:** 2026-09-12 \
> **Origem:** migrado de `docs/06_LOW_LEVEL_DESIGN_LLD.md` (MIGRAÇÃO F5 — ver docs/00_DOCS_INDEX.md).\

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

// 5. Tabela de Jobs Mimaki (Integração M2M)
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
  materialStatus: text('material_status', { enum: ['BOUND', 'PENDING_BIND'] }).default('PENDING_BIND'),
  stockItemId: text('stock_item_id').references(() => stockItems.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
```

### Endpoints Mimaki

| Método | Endpoint | Auth | Descrição |
|--------|----------|------|-----------|
| `POST` | `/api/integrations/mimaki/jobs` | X-API-Secret | Receber job de impressão Mimaki (M2M) |
| `POST` | `/api/integrations/mimaki/jobs/:id/bind-material` | JWT | Vincular material a um job |
| `GET` | `/api/integrations/mimaki/jobs` | JWT | Listar jobs Mimaki |

### Socket.IO Events

| Evento | Sala | Descrição |
|--------|------|-----------|
| `mimaki:unmatched_material` | `estoque` | Notificação de material não identificado |
| `notification:new` | `estoque` | Nova notificação em tempo real |
| `chat:message` | `user:<userId>` | DM do bot (resposta privada) |

