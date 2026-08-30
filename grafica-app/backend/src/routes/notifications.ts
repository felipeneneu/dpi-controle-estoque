import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { notifications } from '../db/schema.js';
import { db } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/api/notifications', { preHandler: [authenticate] }, async (request) => {
    return db.select().from(notifications).where(eq(notifications.userId, request.userId)).all();
  });

  app.post('/api/notifications/:id/read', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
    return reply.code(204).send();
  });
}
