import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { suppliers } from '../db/schema.js';
import { db } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { authenticate, authorize } from '../middleware/auth.js';

const supplierSchema = z.object({
  name: z.string().min(1),
  contact: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
});

export async function supplierRoutes(app: FastifyInstance) {
  app.get('/api/suppliers', { preHandler: [authenticate] }, async () =>
    db.select().from(suppliers).all(),
  );

  app.post('/api/suppliers', { preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])] }, async (request, reply) => {
    const parsed = supplierSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const supplier = { id: newId(), ...parsed.data };
    await db.insert(suppliers).values(supplier);
    return reply.code(201).send(supplier);
  });

  app.delete('/api/suppliers/:id', { preHandler: [authenticate, authorize(['DEV_MASTER'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(suppliers).where(eq(suppliers.id, id));
    return reply.code(204).send();
  });
}
