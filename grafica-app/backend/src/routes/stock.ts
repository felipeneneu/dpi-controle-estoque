import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { stockItems, stockTransactions, notifications, users, machineItems } from '../db/schema.js';
import { db } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { sendToRecipients } from '../lib/whatsapp.js';
import { getSetting } from '../lib/settings.js';
import { dispatchStockAlert } from '../lib/notification-resend.js';
import { authenticate, authorize } from '../middleware/auth.js';

const Categories = ['PAPER_MEDIA', 'INK_SUPPLY', 'OTHER'] as const;
const Units = ['m', 'fls', 'ml', 'L'] as const;
const TransactionTypes = ['IN', 'OUT', 'ADJUSTMENT'] as const;

const createItemSchema = z.object({
  name: z.string().min(1),
  category: z.enum(Categories),
  subType: z.string().optional(),
  unit: z.enum(Units),
  width: z.number().positive().optional(),
  code: z.string().optional(),
  label: z.string().optional(),
  currentQuantity: z.number().nonnegative().optional(),
  minQuantity: z.number().nonnegative().optional(),
  imageUrl: z.string().optional(),
  machineId: z.string().optional(),
});

const updateItemSchema = createItemSchema.partial();

const transactionSchema = z.object({
  itemId: z.string().min(1),
  type: z.enum(TransactionTypes),
  quantity: z.number().positive(),
  reason: z.string().optional(),
});

type StockStatus = 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK';

const stockItemResponseSchema = {
  type: 'object',
  required: ['id', 'name', 'category', 'unit', 'currentQuantity', 'minQuantity', 'status'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    category: { type: 'string', enum: [...Categories] },
    subType: { type: 'string', nullable: true },
    unit: { type: 'string', enum: [...Units] },
    width: { type: 'number', nullable: true },
    code: { type: 'string', nullable: true },
    label: { type: 'string', nullable: true },
    currentQuantity: { type: 'number' },
    minQuantity: { type: 'number' },
    imageUrl: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'] },
    machineIds: { type: 'array', items: { type: 'string' } },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const transactionResponseSchema = {
  type: 'object',
  required: ['id', 'itemId', 'type', 'quantity'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    itemId: { type: 'string' },
    type: { type: 'string', enum: [...TransactionTypes] },
    quantity: { type: 'number' },
    reason: { type: 'string', nullable: true },
    userId: { type: 'string', nullable: true },
    userName: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

function computeStatus(current: number, min: number): StockStatus {
  if (current <= 0) return 'OUT_OF_STOCK';
  if (current <= min) return 'LOW_STOCK';
  return 'AVAILABLE';
}

export async function stockRoutes(app: FastifyInstance) {
  app.get('/api/stock-items', {
    schema: {
      tags: ['Estoque'],
      summary: 'Listar itens de estoque',
      description: 'Lista itens de estoque, com vínculo opcional de máquinas (parametro category). Requer autenticação.',
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: [...Categories] },
        },
      },
      response: {
        200: { type: 'array', items: stockItemResponseSchema },
        401: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate],
  }, async (request) => {
    const query = request.query as { category?: string };
    const rows = query.category
      ? await db
          .select()
          .from(stockItems)
          .where(eq(stockItems.category, query.category as (typeof Categories)[number]))
          .all()
      : await db.select().from(stockItems).all();
    const links = await db.select().from(machineItems).all();
    const byItem = new Map<string, string[]>();
    for (const l of links) {
      const arr = byItem.get(l.stockItemId) ?? [];
      arr.push(l.machineId);
      byItem.set(l.stockItemId, arr);
    }
    return rows.map((r) => ({ ...r, machineIds: byItem.get(r.id) ?? [] }));
  });

  app.post('/api/stock-items', {
    schema: {
      tags: ['Estoque'],
      summary: 'Criar item de estoque',
      description: 'Cria um novo item de estoque (requer ADMIN/DEV_MASTER).',
      body: {
        type: 'object',
        required: ['name', 'category', 'unit'],
        properties: {
          name: { type: 'string', minLength: 1 },
          category: { type: 'string', enum: [...Categories] },
          subType: { type: 'string' },
          unit: { type: 'string', enum: [...Units] },
          width: { type: 'number', exclusiveMinimum: 0 },
          code: { type: 'string' },
          label: { type: 'string' },
          currentQuantity: { type: 'number' },
          minQuantity: { type: 'number' },
          imageUrl: { type: 'string' },
          machineId: { type: 'string' },
        },
      },
      response: {
        201: stockItemResponseSchema,
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
  }, async (request, reply) => {
    const parsed = createItemSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const data = parsed.data;
    const current = data.currentQuantity ?? 0;
    const min = data.minQuantity ?? 0;
    const item = {
      id: newId(),
      name: data.name,
      category: data.category,
      subType: data.subType,
      unit: data.unit,
      width: data.width,
      code: data.code,
      label: data.label,
      currentQuantity: current,
      minQuantity: min,
      imageUrl: data.imageUrl,
      status: computeStatus(current, min),
    };
    await db.insert(stockItems).values(item);

    if (data.machineId) {
      await db.insert(machineItems).values({
        id: newId(),
        machineId: data.machineId,
        stockItemId: item.id,
      });
    }

    return reply.code(201).send({
      ...item,
      machineIds: data.machineId ? [data.machineId] : [],
    });
  });

  app.put('/api/stock-items/:id', {
    schema: {
      tags: ['Estoque'],
      summary: 'Atualizar item de estoque',
      description: 'Atualiza campos de um item de estoque existente (requer ADMIN/DEV_MASTER).',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          category: { type: 'string', enum: [...Categories] },
          subType: { type: 'string' },
          unit: { type: 'string', enum: [...Units] },
          width: { type: 'number', exclusiveMinimum: 0 },
          currentQuantity: { type: 'number' },
          minQuantity: { type: 'number' },
          imageUrl: { type: 'string' },
        },
      },
      response: {
        200: stockItemResponseSchema,
        400: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateItemSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const data = parsed.data;
    const existing = await db.select().from(stockItems).where(eq(stockItems.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    const next = { ...existing, ...data };
    next.currentQuantity = data.currentQuantity ?? existing.currentQuantity;
    next.minQuantity = data.minQuantity ?? existing.minQuantity;
    next.status = computeStatus(next.currentQuantity, next.minQuantity);
    await db.update(stockItems).set(next).where(eq(stockItems.id, id));
    return next;
  });

  app.delete('/api/stock-items/:id', {
    schema: {
      tags: ['Estoque'],
      summary: 'Excluir item de estoque',
      description: 'Remove um item de estoque (requer DEV_MASTER).',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      response: {
        204: { type: 'null' },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(stockItems).where(eq(stockItems.id, id));
    return reply.code(204).send();
  });

  app.patch('/api/stock-items/:id/machines', {
    schema: {
      tags: ['Estoque'],
      summary: 'Vincular máquinas a um item',
      description: 'Substitui a lista de máquinas que consomem um item de estoque (requer ADMIN/DEV_MASTER).',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          machineIds: { type: 'array', items: { type: 'string' } },
        },
      },
      response: {
        200: stockItemResponseSchema,
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { machineIds?: string[] };
    const machineIds = body.machineIds ?? [];
    const existing = await db.select().from(stockItems).where(eq(stockItems.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    await db.delete(machineItems).where(eq(machineItems.stockItemId, id));
    if (machineIds.length > 0) {
      await db
        .insert(machineItems)
        .values(machineIds.map((machineId) => ({ id: newId(), stockItemId: id, machineId })));
    }
    return { ...existing, machineIds };
  });

  app.post('/api/stock-items/:id/add-roll', {
    schema: {
      tags: ['Estoque'],
      summary: 'Adicionar rolo',
      description: 'Duplica um item de estoque como um novo rolo independente, mantendo largura, código e características (requer ADMIN/DEV_MASTER).',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Identificação do rolo (ex: "Rolo B")' },
        },
      },
      response: {
        201: stockItemResponseSchema,
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { label?: string };
    const existing = await db.select().from(stockItems).where(eq(stockItems.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Not found' });

    const newItem = {
      id: newId(),
      name: existing.name,
      category: existing.category,
      subType: existing.subType,
      unit: existing.unit,
      width: existing.width,
      code: existing.code,
      label: body.label ?? 'Novo rolo',
      currentQuantity: existing.currentQuantity,
      minQuantity: existing.minQuantity,
      imageUrl: existing.imageUrl,
      status: 'AVAILABLE' as const,
    };
    await db.insert(stockItems).values(newItem);
    return reply.code(201).send(newItem);
  });

  app.patch('/api/stock-items/:id/label', {
    schema: {
      tags: ['Estoque'],
      summary: 'Atualizar identificação do rolo',
      description: 'Altera o identificador (label) de um item/rolo de estoque (requer ADMIN/DEV_MASTER).',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['label'],
        properties: { label: { type: 'string' } },
      },
      response: {
        200: stockItemResponseSchema,
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { label } = request.body as { label: string };
    const existing = await db.select().from(stockItems).where(eq(stockItems.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    const next = { ...existing, label };
    await db.update(stockItems).set({ label }).where(eq(stockItems.id, id));
    return next;
  });

  app.post('/api/stock-transactions', {
    schema: {
      tags: ['Estoque'],
      summary: 'Registrar transação',
      description: 'Registra entrada (IN), saída (OUT) ou ajuste (ADJUSTMENT) de estoque. Gera alertas (notificação + WhatsApp) quando o item fica com estoque baixo ou zerado.',
      body: {
        type: 'object',
        required: ['itemId', 'type', 'quantity'],
        properties: {
          itemId: { type: 'string', minLength: 1 },
          type: { type: 'string', enum: [...TransactionTypes] },
          quantity: { type: 'number', exclusiveMinimum: 0 },
          reason: { type: 'string' },
        },
      },
      response: {
        201: {
          type: 'object',
          required: ['transaction', 'newQty', 'status'],
          properties: {
            transaction: transactionResponseSchema,
            newQty: { type: 'number' },
            status: { type: 'string', enum: ['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'] },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN', 'OPERATOR'])],
  }, async (request, reply) => {
    const parsed = transactionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const { itemId, type, quantity, reason } = parsed.data;
    if (type === 'ADJUSTMENT' && request.userRole !== 'DEV_MASTER' && request.userRole !== 'ADMIN') {
      return reply.code(403).send({ error: 'Only managers can adjust stock' });
    }
    const userId = request.userId as string;
    const item = await db.select().from(stockItems).where(eq(stockItems.id, itemId)).get();
    if (!item) return reply.code(404).send({ error: 'Item not found' });

    let newQty = item.currentQuantity;
    if (type === 'IN') newQty = item.currentQuantity + quantity;
    else if (type === 'OUT') newQty = Math.max(0, item.currentQuantity - quantity);
    else newQty = quantity;

    const status = computeStatus(newQty, item.minQuantity);
    await db.update(stockItems).set({ currentQuantity: newQty, status }).where(eq(stockItems.id, itemId));

    const actor = await db.select().from(users).where(eq(users.id, userId)).get();

    const tx = {
      id: newId(),
      itemId,
      type,
      quantity,
      reason,
      userId,
      userName: actor?.name ?? 'Desconhecido',
    };
    await db.insert(stockTransactions).values(tx);

    if (status === 'LOW_STOCK' || status === 'OUT_OF_STOCK') {
      await dispatchStockAlert({ item, newQty, status, actorId: userId, io: app.io });
    }

    app.io.to('estoque').emit('stock:updated', { itemId, newQty, status, type, actor: actor?.name });

    return reply.code(201).send({ transaction: tx, newQty, status });
  });

  app.get('/api/stock-transactions', {
    schema: {
      tags: ['Estoque'],
      summary: 'Listar transações',
      description: 'Lista todas as transações de estoque (entradas, saídas e ajustes).',
      response: {
        200: { type: 'array', items: transactionResponseSchema },
      },
    },
    preHandler: [authenticate],
  }, async () => {
    return db.select().from(stockTransactions).all();
  });
}
