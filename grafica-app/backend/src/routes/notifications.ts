import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { notifications } from '../db/schema.js';
import { db } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';

const notificationResponseSchema = {
  type: 'object',
  required: ['id', 'userId', 'title', 'type', 'read'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    userId: { type: 'string' },
    title: { type: 'string' },
    body: { type: 'string', nullable: true },
    type: { type: 'string' },
    read: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/api/notifications', {
    schema: {
      tags: ['Notificações'],
      summary: 'Listar notificações',
      description: 'Lista as notificações do usuário autenticado.',
      response: {
        200: { type: 'array', items: notificationResponseSchema },
      },
    },
    preHandler: [authenticate],
  }, async (request) => {
    return db.select().from(notifications).where(eq(notifications.userId, request.userId)).all();
  });

  app.post('/api/notifications/:id/read', {
    schema: {
      tags: ['Notificações'],
      summary: 'Marcar notificação como lida',
      description: 'Marca uma notificação como lida.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      response: {
        204: { type: 'null' },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
    return reply.code(204).send();
  });
}
