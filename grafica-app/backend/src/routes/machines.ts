import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { machines, machineItems } from '../db/schema.js';
import { db } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { authenticate, authorize } from '../middleware/auth.js';

const machineSchema = z.object({
  name: z.string().min(1),
  brand: z.string().min(1),
  model: z.string().min(1),
  technology: z.string().min(1),
  imageUrl: z.string().optional(),
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'INACTIVE']).optional(),
});

export async function machineRoutes(app: FastifyInstance) {
  app.get('/api/machines', async () => {
    const rows = await db.select().from(machines).all();
    const links = await db.select().from(machineItems).all();
    const byMachine = new Map<string, string[]>();
    for (const l of links) {
      const arr = byMachine.get(l.machineId) ?? [];
      arr.push(l.stockItemId);
      byMachine.set(l.machineId, arr);
    }
    return rows.map((m) => ({ ...m, itemIds: byMachine.get(m.id) ?? [] }));
  });

  app.post('/api/machines', { preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])] }, async (request, reply) => {
    const parsed = machineSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const machine = { id: newId(), ...parsed.data, status: parsed.data.status ?? 'ACTIVE' };
    await db.insert(machines).values(machine);
    return reply.code(201).send(machine);
  });

  app.put('/api/machines/:id', { preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = machineSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const existing = await db.select().from(machines).where(eq(machines.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    const next = { ...existing, ...parsed.data };
    await db.update(machines).set(next).where(eq(machines.id, id));
    return next;
  });

  app.patch('/api/machines/:id/materials', { preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { stockItemIds?: string[] };
    const stockItemIds = body.stockItemIds ?? [];
    const existing = await db.select().from(machines).where(eq(machines.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    await db.delete(machineItems).where(eq(machineItems.machineId, id));
    if (stockItemIds.length > 0) {
      await db
        .insert(machineItems)
        .values(stockItemIds.map((stockItemId) => ({ id: newId(), machineId: id, stockItemId })));
    }
    return { ...existing, itemIds: stockItemIds };
  });

  app.delete('/api/machines/:id', { preHandler: [authenticate, authorize(['DEV_MASTER'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(machines).where(eq(machines.id, id));
    return reply.code(204).send();
  });
}
