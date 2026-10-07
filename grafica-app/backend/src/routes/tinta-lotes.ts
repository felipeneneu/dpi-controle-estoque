import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { tintaLotes, stockItems, stockTransactions } from '../db/schema.js';
import { db } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { authenticate, authorize } from '../middleware/auth.js';

const addTintaLoteSchema = z.object({
  serial: z.string().max(64).optional(),
  quantity: z.number().int().positive().default(1),
  channel: z.string().max(32).optional(),
});

const dischargeTintaLoteSchema = z.object({
  reason: z.string().min(1).max(255),
});

export async function tintaLotesRoutes(app: FastifyInstance) {
  // Listar lotes de um item de tinta
  app.get('/api/stock-items/:id/tinta-lotes', {
    schema: {
      tags: ['Tintas'],
      summary: 'Listar lotes de um SKU de tinta',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const item = await db.select().from(stockItems).where(eq(stockItems.id, id)).get();
    if (!item) {
      return reply.code(404).send({ error: 'Item não encontrado' });
    }

    const lotes = await db
      .select()
      .from(tintaLotes)
      .where(eq(tintaLotes.stockItemId, id))
      .orderBy(desc(tintaLotes.createdAt))
      .all();

    return lotes;
  });

  // Cadastrar novos frascos/cartuchos em estado NEW
  app.post('/api/stock-items/:id/tinta-lotes', {
    schema: {
      tags: ['Tintas'],
      summary: 'Cadastrar novos lotes de tinta (NEW) na prateleira',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          serial: { type: 'string' },
          quantity: { type: 'integer', minimum: 1 },
          channel: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN', 'OPERATOR'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = addTintaLoteSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }

    const { serial, quantity, channel } = parsed.data;

    const item = await db.select().from(stockItems).where(eq(stockItems.id, id)).get();
    if (!item) {
      return reply.code(404).send({ error: 'Item não encontrado' });
    }

    const user = request.user as { sub?: string; name?: string } | undefined;
    const now = new Date();
    const createdLotes = [];

    for (let i = 0; i < quantity; i++) {
      const loteId = newId();
      const loteSerial = serial
        ? quantity > 1
          ? `${serial}-${i + 1}`
          : serial
        : `TNK-${loteId.slice(0, 6).toUpperCase()}`;

      const [row] = await db
        .insert(tintaLotes)
        .values({
          id: loteId,
          stockItemId: id,
          serial: loteSerial,
          state: 'NEW',
          location: 'deposito',
          channel: channel || null,
          createdAt: now,
        })
        .returning();

      if (row) createdLotes.push(row);
    }

    // Registrar transação de entrada para histórico contábil
    await db.insert(stockTransactions).values({
      id: newId(),
      itemId: id,
      type: 'IN',
      quantity,
      reason: `Entrada de ${quantity} un de tinta [${serial || 'Lote padrão'}]`,
      userId: user?.sub ?? null,
      userName: user?.name ?? null,
    });

    // Emite atualização via Socket.IO
    app.io.to('estoque').emit('stock:updated', { itemId: id });

    return reply.code(201).send({
      success: true,
      createdCount: createdLotes.length,
      lotes: createdLotes,
    });
  });

  // Baixa manual de lote danificado ou expirado
  app.post('/api/tinta-lotes/:id/discharge', {
    schema: {
      tags: ['Tintas'],
      summary: 'Dar baixa manual em lote de tinta',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN', 'OPERATOR'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = dischargeTintaLoteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Informe o motivo da baixa' });
    }

    const lote = await db.select().from(tintaLotes).where(eq(tintaLotes.id, id)).get();
    if (!lote) {
      return reply.code(404).send({ error: 'Lote não encontrado' });
    }

    if (lote.state === 'FINISHED') {
      return reply.code(400).send({ error: 'Este lote já foi baixado' });
    }

    const now = new Date();
    await db
      .update(tintaLotes)
      .set({
        state: 'FINISHED',
        location: 'discarded',
        finishedAt: now,
      })
      .where(eq(tintaLotes.id, id));

    const user = request.user as { sub?: string; name?: string } | undefined;
    await db.insert(stockTransactions).values({
      id: newId(),
      itemId: lote.stockItemId,
      type: 'OUT',
      quantity: 1,
      reason: `Baixa manual de lote [${lote.serial ?? lote.id}]: ${parsed.data.reason}`,
      userId: user?.sub ?? null,
      userName: user?.name ?? null,
    });

    app.io.to('estoque').emit('stock:updated', { itemId: lote.stockItemId });

    return {
      success: true,
      message: 'Lote baixado com sucesso',
    };
  });
}
