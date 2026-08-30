import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { chatMessages, users } from '../db/schema.js';
import { db } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { authenticate } from '../middleware/auth.js';

const messageSchema = z.object({
  room: z.string().min(1).default('geral'),
  content: z.string().min(1),
  senderId: z.string().min(1),
});

export async function chatRoutes(app: FastifyInstance) {
  app.get('/api/messages', { preHandler: [authenticate] }, async (request) => {
    const query = request.query as { room?: string };
    const room = query.room || 'geral';
    const rows = await db
      .select({
        id: chatMessages.id,
        room: chatMessages.room,
        content: chatMessages.content,
        createdAt: chatMessages.createdAt,
        senderId: chatMessages.senderId,
        senderName: users.name,
      })
      .from(chatMessages)
      .leftJoin(users, eq(users.id, chatMessages.senderId))
      .where(eq(chatMessages.room, room))
      .orderBy(desc(chatMessages.createdAt))
      .limit(200)
      .all();
    return rows.reverse();
  });

  app.post('/api/messages', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = messageSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const message = {
      id: newId(),
      room: parsed.data.room,
      content: parsed.data.content,
      senderId: parsed.data.senderId,
    };
    await db.insert(chatMessages).values(message);
    const sender = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, message.senderId))
      .get();
    const payload = { ...message, senderName: sender?.name };
    app.io.to(message.room).emit('chat:message', payload);
    return reply.code(201).send(payload);
  });
}
