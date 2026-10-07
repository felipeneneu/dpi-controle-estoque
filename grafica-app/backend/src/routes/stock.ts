import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { stockItems, stockTransactions, notifications, users, machineItems, bobinas, garrafas, cartuchos, tintaLotes, machines } from '../db/schema.js';
import { db } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { sendToRecipients } from '../lib/whatsapp.js';
import { getSetting } from '../lib/settings.js';
import { dispatchStockAlert } from '../lib/notification-resend.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { saldosDerivados } from '../lib/ink-balance.js';

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
  machineIds: z.array(z.string()).optional(),
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
    /**
     * Qual origem venceu para o `currentQuantity` desta linha (ADR-052 / ADR-057 / H14).
     * Sem isso a UI mostra um saldo e nao diz se ele veio de cartucho, garrafa, lote ou
     * do agregado - e o operador nao consegue explicar a divergencia.
     */
    origemSaldo: { type: 'string', enum: ['agregado', 'bobinas', 'garrafas', 'cartuchos', 'tinta_lotes'] },
    availableLots: { type: 'number', nullable: true },
    totalLots: { type: 'number', nullable: true },
    activeLot: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        serial: { type: 'string' },
        machineId: { type: 'string', nullable: true },
        machineName: { type: 'string', nullable: true },
        channel: { type: 'string', nullable: true },
        metersRemaining: { type: 'number', nullable: true },
      },
    },
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
    source: { type: 'string', nullable: true },
    sourceRef: { type: 'string', nullable: true },
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
    const allBobinas = await db.select().from(bobinas).all();
    const allGarrafas = await db.select().from(garrafas).all();
    const allTintaLotes = await db.select().from(tintaLotes).all();
    const allMachines = await db.select().from(machines).all();
    const machineMap = new Map(allMachines.map((m) => [m.id, m.name]));

    // ADR-052: cartucho e a 3a origem de saldo (depois de bobina e garrafa).
    // Uma consulta agregada para todos os itens com cartucho, em vez de N+1.
    const idsComCartucho = (
      await db.selectDistinct({ stockItemId: cartuchos.stockItemId }).from(cartuchos).all()
    ).map((r) => r.stockItemId);
    const saldosCartucho = await saldosDerivados(idsComCartucho);

    const byItem = new Map<string, string[]>();
    for (const l of links) {
      const arr = byItem.get(l.stockItemId) ?? [];
      arr.push(l.machineId);
      byItem.set(l.stockItemId, arr);
    }
    
    return rows.map((r) => {
      let finalQuantity = r.currentQuantity;
      let origem = 'agregado';
      let activeLot: {
        id: string;
        serial: string;
        machineId?: string | null;
        machineName?: string | null;
        channel?: string | null;
        metersRemaining?: number | null;
      } | null = null;
      let availableLots = 0;
      let totalLots = 0;

      if (r.category === 'PAPER_MEDIA' && r.unit === 'm') {
        const itemBobinas = allBobinas.filter((b) => b.stockItemId === r.id);
        const ativas = itemBobinas.filter((b) => b.state === 'NEW' || b.state === 'IN_USE');
        const emEspera = itemBobinas.filter((b) => b.state === 'NEW');
        const emUso = itemBobinas.find((b) => b.state === 'IN_USE');

        finalQuantity = ativas.reduce((acc, b) => acc + (b.metersRemaining || 0), 0);
        origem = 'bobinas';
        availableLots = emEspera.length;
        totalLots = ativas.length;

        if (emUso) {
          const mId = emUso.location.startsWith('machine:')
            ? emUso.location.replace('machine:', '')
            : null;
          activeLot = {
            id: emUso.id,
            serial: emUso.serial ?? emUso.id.slice(0, 8),
            machineId: mId,
            machineName: mId ? machineMap.get(mId) ?? mId : null,
            metersRemaining: emUso.metersRemaining,
          };
        }
      } else if (r.category === 'INK_SUPPLY') {
        const itemTintaLotes = allTintaLotes.filter((l) => l.stockItemId === r.id);

        if (itemTintaLotes.length > 0) {
          // ADR-057: entidade tinta_lotes por unidade inteira NEW
          const emEspera = itemTintaLotes.filter((l) => l.state === 'NEW');
          const emUso = itemTintaLotes.find((l) => l.state === 'IN_USE');
          const ativas = itemTintaLotes.filter((l) => l.state === 'NEW' || l.state === 'IN_USE');

          finalQuantity = emEspera.length;
          origem = 'tinta_lotes';
          availableLots = emEspera.length;
          totalLots = ativas.length;

          if (emUso) {
            activeLot = {
              id: emUso.id,
              serial: emUso.serial ?? emUso.id.slice(0, 8),
              machineId: emUso.machineId,
              machineName: emUso.machineId ? machineMap.get(emUso.machineId) ?? emUso.machineId : null,
              channel: emUso.channel,
            };
          }
        } else {
          // Fallback para cartuchos legados ou garrafas
          const saldoCartucho = saldosCartucho.get(r.id);
          if (saldoCartucho !== undefined) {
            finalQuantity = saldoCartucho;
            origem = 'cartuchos';
            availableLots = finalQuantity;
            totalLots = finalQuantity;
          } else {
            const itemGarrafas = allGarrafas.filter((g) => g.stockItemId === r.id && (g.state === 'NEW' || g.state === 'IN_USE'));
            if (itemGarrafas.length > 0) {
              finalQuantity = itemGarrafas.reduce((acc, g) => acc + (g.mlRemaining || 0), 0);
              origem = 'garrafas';
              availableLots = itemGarrafas.filter((g) => g.state === 'NEW').length;
              totalLots = itemGarrafas.length;
              const emUso = itemGarrafas.find((g) => g.state === 'IN_USE');
              if (emUso) {
                const mId = emUso.location.startsWith('machine:')
                  ? emUso.location.replace('machine:', '')
                  : null;
                activeLot = {
                  id: emUso.id,
                  serial: emUso.serial ?? emUso.id.slice(0, 8),
                  machineId: mId,
                  machineName: mId ? machineMap.get(mId) ?? mId : null,
                };
              }
            } else {
              availableLots = r.currentQuantity;
              totalLots = r.currentQuantity;
            }
          }
        }
      } else {
        availableLots = r.currentQuantity;
        totalLots = r.currentQuantity;
      }

      return { 
        ...r, 
        currentQuantity: finalQuantity,
        status: computeStatus(finalQuantity, r.minQuantity),
        machineIds: byItem.get(r.id) ?? [],
        origemSaldo: origem,
        activeLot,
        availableLots,
        totalLots,
      };
    });
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
          machineIds: { type: 'array', items: { type: 'string' } },
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

    if (data.category === 'PAPER_MEDIA' && data.unit === 'm' && current > 0) {
      const shortIdStr = Math.floor(1000 + Math.random() * 9000).toString();
      const finalSerial = `BOB-${shortIdStr}`;
      await db.insert(bobinas).values({
        id: newId(),
        stockItemId: item.id,
        serial: finalSerial,
        widthMm: data.width ?? 0,
        metersInitial: current,
        metersRemaining: current,
        state: 'NEW',
        location: 'deposito',
      });

      const ator = await db.select().from(users).where(eq(users.id, request.userId as string)).get();
      await db.insert(stockTransactions).values({
        id: newId(),
        itemId: item.id,
        type: 'IN',
        quantity: current,
        reason: 'Cadastro Inicial (1º Rolo)',
        userId: request.userId as string,
        userName: ator?.name ?? 'Sistema',
      });
    } else if (data.category === 'INK_SUPPLY' && current > 0) {
      const shortIdStr = Math.floor(1000 + Math.random() * 9000).toString();
      const finalSerial = `TIN-${shortIdStr}`;
      await db.insert(garrafas).values({
        id: newId(),
        stockItemId: item.id,
        serial: finalSerial,
        mlInitial: current,
        mlRemaining: current,
        state: 'NEW',
        location: 'deposito',
      });
      const ator = await db.select().from(users).where(eq(users.id, request.userId as string)).get();
      await db.insert(stockTransactions).values({
        id: newId(),
        itemId: item.id,
        type: 'IN',
        quantity: current,
        reason: `Cadastro Inicial (Garrafa ${finalSerial})`,
        userId: request.userId as string,
        userName: ator?.name ?? 'Sistema',
      });
    } else if (current > 0) {
      const ator = await db.select().from(users).where(eq(users.id, request.userId as string)).get();
      await db.insert(stockTransactions).values({
        id: newId(),
        itemId: item.id,
        type: 'IN',
        quantity: current,
        reason: 'Cadastro Inicial',
        userId: request.userId as string,
        userName: ator?.name ?? 'Sistema',
      });
    }

    if (data.machineIds && data.machineIds.length > 0) {
      await db.insert(machineItems).values(
        data.machineIds.map((machineId) => ({
          id: newId(),
          machineId,
          stockItemId: item.id,
        }))
      );
    }

    return reply.code(201).send({
      ...item,
      machineIds: data.machineIds ?? [],
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
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    await db.delete(machineItems).where(eq(machineItems.stockItemId, id));
    await db.delete(bobinas).where(eq(bobinas.stockItemId, id));
    await db.delete(garrafas).where(eq(garrafas.stockItemId, id));
    // cartucho_consumo sai por ON DELETE CASCADE de cartuchos (BR-052).
    await db.delete(cartuchos).where(eq(cartuchos.stockItemId, id));
    await db.delete(stockTransactions).where(eq(stockTransactions.itemId, id));
    
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

  app.get('/api/bobinas', {
    schema: {
      tags: ['Bobinas'],
      summary: 'Listar bobinas',
      description: 'Retorna a lista de bobinas, opcionalmente filtrada por stockItemId.',
      querystring: {
        type: 'object',
        properties: {
          stockItemId: { type: 'string' },
        },
      },
      response: {
        200: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
    },
    preHandler: [authenticate],
  }, async (request) => {
    const query = request.query as { stockItemId?: string };
    const items = query.stockItemId
      ? await db.select().from(bobinas).where(eq(bobinas.stockItemId, query.stockItemId)).all()
      : await db.select().from(bobinas).all();
    return items;
  });

  app.patch('/api/bobinas/:id', {
    schema: {
      tags: ['Bobinas'],
      summary: 'Atualizar bobina',
      description: 'Atualiza o estado ou local da bobina.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          state: { type: 'string' },
          location: { type: 'string' },
          serial: { type: 'string' },
        },
      },
      response: {
        200: { type: 'object', additionalProperties: true },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN', 'OPERATOR'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { state?: "NEW" | "IN_USE" | "USED" | "BLOCKED" | "SCRAPPED"; location?: string; serial?: string };
    
    const existing = await db.select().from(bobinas).where(eq(bobinas.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    
    const next = { ...existing, ...body };
    await db.update(bobinas).set(next).where(eq(bobinas.id, id));
    
    // Invalida cache (opcional mas bom para realtime)
    // app.io.to('estoque').emit('bobinas:updated', next);
    
    return next;
  });

  app.post('/api/bobinas/:id/discharge', {
    schema: {
      tags: ['Bobinas'],
      summary: 'Dar baixa manual em bobina (Venda)',
      description: 'Dá baixa na bobina inteira, gerando transação OUT e mudando o estado para USED.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', minLength: 1 },
        },
      },
      response: {
        200: { type: 'object', additionalProperties: true },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN', 'OPERATOR'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = request.body as { reason: string };

    const existing = await db.select().from(bobinas).where(eq(bobinas.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    if (existing.state !== 'NEW' && existing.state !== 'IN_USE') {
      return reply.code(400).send({ error: 'Apenas bobinas ativas podem ser baixadas manualmente.' });
    }

    const next = {
      ...existing,
      state: 'USED' as const,
      location: 'cliente',
      finishedAt: new Date(),
    };

    await db.update(bobinas).set(next).where(eq(bobinas.id, id));

    const ator = await db.select().from(users).where(eq(users.id, request.userId as string)).get();
    await db.insert(stockTransactions).values({
      id: newId(),
      itemId: existing.stockItemId,
      type: 'OUT',
      quantity: existing.metersRemaining ?? 0,
      reason: reason,
      userId: request.userId as string,
      userName: ator?.name ?? 'Sistema',
    });

    return reply.code(200).send(next);
  });

  app.post('/api/stock-items/:id/add-roll', {
    schema: {
      tags: ['Estoque'],
      summary: 'Adicionar rolo (Bobina)',
      description: 'Cria uma nova Bobina física vinculada ao item de estoque (requer ADMIN/DEV_MASTER).',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          serial: { type: 'string', description: 'ID curto ou serial da bobina (ex: BOB:1042)' },
          label: { type: 'string' },
          metersInitial: { type: 'number', description: 'Metragem inicial do rolo' },
        },
      },
      response: {
        201: { type: 'object' },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { serial?: string; label?: string; metersInitial?: number };
    const existing = await db.select().from(stockItems).where(eq(stockItems.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    
    if (existing.category !== 'PAPER_MEDIA' || existing.unit !== 'm') {
      return reply.code(400).send({ error: 'Bobinas só podem ser criadas para itens de mídia (PAPER_MEDIA) com unidade em metros (m).' });
    }

    const metersInitial = body.metersInitial ?? 50;
    // Geração automática de ID curto para as etiquetas (M2/M3)
    const shortIdStr = Math.floor(1000 + Math.random() * 9000).toString();
    const finalSerial = `BOB-${shortIdStr}`;

    const novaBobina = {
      id: newId(),
      stockItemId: id,
      serial: finalSerial,
      widthMm: existing.width ?? 0,
      metersInitial,
      metersRemaining: metersInitial,
      state: 'NEW' as const,
      location: 'deposito',
    };
    
    await db.insert(bobinas).values(novaBobina);
    
    const ator = await db.select().from(users).where(eq(users.id, request.userId as string)).get();
    const tx = {
      id: newId(),
      itemId: id,
      type: 'IN' as const,
      quantity: metersInitial,
      reason: `Abertura de bobina ${novaBobina.serial}`,
      userId: request.userId as string,
      userName: ator?.name ?? 'Sistema',
    };
    await db.insert(stockTransactions).values(tx);
    
    return reply.code(201).send(novaBobina);
  });

  app.get('/api/garrafas', {
    schema: {
      tags: ['Garrafas'],
      summary: 'Listar garrafas de tinta',
      description: 'Retorna a lista de garrafas (frascos) de tinta, opcionalmente filtrada por stockItemId.',
      querystring: {
        type: 'object',
        properties: {
          stockItemId: { type: 'string' },
        },
      },
      response: {
        200: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
    },
    preHandler: [authenticate],
  }, async (request) => {
    const query = request.query as { stockItemId?: string };
    const items = query.stockItemId
      ? await db.select().from(garrafas).where(eq(garrafas.stockItemId, query.stockItemId)).all()
      : await db.select().from(garrafas).all();
    return items;
  });

  app.patch('/api/garrafas/:id', {
    schema: {
      tags: ['Garrafas'],
      summary: 'Atualizar garrafa',
      description: 'Atualiza o estado ou local da garrafa de tinta.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          state: { type: 'string' },
          location: { type: 'string' },
          serial: { type: 'string' },
        },
      },
      response: {
        200: { type: 'object', additionalProperties: true },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN', 'OPERATOR'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { state?: "NEW" | "IN_USE" | "USED" | "BLOCKED" | "SCRAPPED"; location?: string; serial?: string };

    const existing = await db.select().from(garrafas).where(eq(garrafas.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Not found' });

    const next = { ...existing, ...body };
    await db.update(garrafas).set(next).where(eq(garrafas.id, id));
    return next;
  });

  app.post('/api/garrafas/:id/discharge', {
    schema: {
      tags: ['Garrafas'],
      summary: 'Dar baixa manual em garrafa (Venda/Descarte)',
      description: 'Dá baixa na garrafa inteira, gerando transação OUT e mudando o estado para USED.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', minLength: 1 },
        },
      },
      response: {
        200: { type: 'object', additionalProperties: true },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN', 'OPERATOR'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = request.body as { reason: string };

    const existing = await db.select().from(garrafas).where(eq(garrafas.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    if (existing.state !== 'NEW' && existing.state !== 'IN_USE') {
      return reply.code(400).send({ error: 'Apenas garrafas ativas podem ser baixadas manualmente.' });
    }

    const next = {
      ...existing,
      state: 'USED' as const,
      location: 'cliente',
      finishedAt: new Date(),
    };

    await db.update(garrafas).set(next).where(eq(garrafas.id, id));

    const ator = await db.select().from(users).where(eq(users.id, request.userId as string)).get();
    await db.insert(stockTransactions).values({
      id: newId(),
      itemId: existing.stockItemId,
      type: 'OUT',
      quantity: existing.mlRemaining ?? 0,
      reason: reason,
      userId: request.userId as string,
      userName: ator?.name ?? 'Sistema',
    });

    return reply.code(200).send(next);
  });

  app.post('/api/stock-items/:id/add-garrafa', {
    schema: {
      tags: ['Garrafas'],
      summary: 'Adicionar garrafa de tinta',
      description: 'Cria uma nova garrafa (frasco) de tinta vinculada ao item de estoque (requer ADMIN/DEV_MASTER).',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          mlInitial: { type: 'number', description: 'Volume inicial da garrafa em ml (padrão: 1000)' },
        },
      },
      response: {
        201: { type: 'object' },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { mlInitial?: number };
    const existing = await db.select().from(stockItems).where(eq(stockItems.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Not found' });

    if (existing.category !== 'INK_SUPPLY') {
      return reply.code(400).send({ error: 'Garrafas só podem ser criadas para itens de tinta (INK_SUPPLY).' });
    }

    const mlInitial = body.mlInitial ?? 1000;
    const shortIdStr = Math.floor(1000 + Math.random() * 9000).toString();
    const finalSerial = `TIN-${shortIdStr}`;

    const novaGarrafa = {
      id: newId(),
      stockItemId: id,
      serial: finalSerial,
      mlInitial,
      mlRemaining: mlInitial,
      state: 'NEW' as const,
      location: 'deposito',
    };

    await db.insert(garrafas).values(novaGarrafa);

    const ator = await db.select().from(users).where(eq(users.id, request.userId as string)).get();
    const tx = {
      id: newId(),
      itemId: id,
      type: 'IN' as const,
      quantity: mlInitial,
      reason: `Abertura de garrafa ${novaGarrafa.serial}`,
      userId: request.userId as string,
      userName: ator?.name ?? 'Sistema',
    };
    await db.insert(stockTransactions).values(tx);

    return reply.code(201).send(novaGarrafa);
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
