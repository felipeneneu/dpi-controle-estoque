import type { FastifyInstance } from 'fastify';
import { and, desc, eq, or } from 'drizzle-orm';
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
    acknowledgedAt: { type: 'string', format: 'date-time', nullable: true },
    itemId: { type: 'string', nullable: true },
    alertLevel: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/api/notifications', {
    schema: {
      tags: ['Notificações'],
      summary: 'Listar notificações',
      description: 'Lista as notificações do usuário autenticado e alertas de estoque do sistema.',
      response: {
        200: { type: 'array', items: notificationResponseSchema },
      },
    },
    preHandler: [authenticate],
  }, async (request) => {
    return db
      .select()
      .from(notifications)
      .where(
        or(
          eq(notifications.userId, request.userId),
          eq(notifications.type, 'stock'),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(100)
      .all();
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
        200: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
        },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userRole = request.userRole;
    const isManager = userRole === 'DEV_MASTER' || userRole === 'ADMIN';

    await db
      .update(notifications)
      .set({ read: true })
      .where(
        isManager
          ? eq(notifications.id, id)
          : and(
              eq(notifications.id, id),
              or(
                eq(notifications.userId, request.userId),
                eq(notifications.type, 'stock'),
              ),
            ),
      );
    return reply.code(200).send({ ok: true });
  });

  app.post('/api/notifications/:id/ack', {
    schema: {
      tags: ['Notificações'],
      summary: 'Confirmar notificação',
      description: 'Marca uma notificação como confirmada (acknowledgedAt), interrompendo reenvios automáticos.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      response: {
        204: {
          type: 'null',
          description: 'Notificação confirmada com sucesso',
        },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userRole = request.userRole;
    const isManager = userRole === 'DEV_MASTER' || userRole === 'ADMIN';

    await db
      .update(notifications)
      .set({ acknowledgedAt: new Date() })
      .where(
        isManager
          ? eq(notifications.id, id)
          : and(
              eq(notifications.id, id),
              or(
                eq(notifications.userId, request.userId),
                eq(notifications.type, 'stock'),
              ),
            ),
      );

    app.io?.to('estoque').emit('notification:acknowledged', { id });
    return reply.code(204).send();
  });

  app.delete('/api/notifications', {
    schema: {
      tags: ['Notificações'],
      summary: 'Limpar todas as notificações',
      description: 'Remove todas as notificações visíveis para o usuário autenticado.',
      response: {
        200: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
        },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const userRole = request.userRole;
    const isManager = userRole === 'DEV_MASTER' || userRole === 'ADMIN';

    if (isManager) {
      await db.delete(notifications);
    } else {
      await db.delete(notifications).where(
        or(
          eq(notifications.userId, request.userId),
          eq(notifications.type, 'stock'),
        ),
      );
    }

    app.io?.to('estoque').emit('notification:cleared');
    return reply.code(200).send({ ok: true });
  });

  app.delete('/api/notifications/:id', {
    schema: {
      tags: ['Notificações'],
      summary: 'Excluir notificação específica',
      description: 'Remove uma notificação específica pelo ID.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
        },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userRole = request.userRole;
    const isManager = userRole === 'DEV_MASTER' || userRole === 'ADMIN';

    await db.delete(notifications).where(
      isManager
        ? eq(notifications.id, id)
        : and(
            eq(notifications.id, id),
            or(
              eq(notifications.userId, request.userId),
              eq(notifications.type, 'stock'),
            ),
          ),
    );

    app.io?.to('estoque').emit('notification:deleted', { id });
    return reply.code(200).send({ ok: true });
  });
}
