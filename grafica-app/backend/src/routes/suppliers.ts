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

const supplierResponseSchema = {
  type: 'object',
  required: ['id', 'name'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    contact: { type: 'string', nullable: true },
    phone: { type: 'string', nullable: true },
    email: { type: 'string', nullable: true },
    notes: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export async function supplierRoutes(app: FastifyInstance) {
  app.get('/api/suppliers', {
    schema: {
      tags: ['Fornecedores'],
      summary: 'Listar fornecedores',
      description: 'Lista todos os fornecedores cadastrados.',
      response: {
        200: { type: 'array', items: supplierResponseSchema },
      },
    },
    preHandler: [authenticate],
  }, async () =>
    db.select().from(suppliers).all(),
  );

  app.post('/api/suppliers', {
    schema: {
      tags: ['Fornecedores'],
      summary: 'Criar fornecedor',
      description: 'Cadastra um novo fornecedor (requer ADMIN/DEV_MASTER).',
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          contact: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          notes: { type: 'string' },
        },
      },
      response: {
        201: supplierResponseSchema,
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
  }, async (request, reply) => {
    const parsed = supplierSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const supplier = { id: newId(), ...parsed.data };
    await db.insert(suppliers).values(supplier);
    return reply.code(201).send(supplier);
  });

  app.delete('/api/suppliers/:id', {
    schema: {
      tags: ['Fornecedores'],
      summary: 'Excluir fornecedor',
      description: 'Remove um fornecedor (requer DEV_MASTER).',
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
    await db.delete(suppliers).where(eq(suppliers.id, id));
    return reply.code(204).send();
  });
}
