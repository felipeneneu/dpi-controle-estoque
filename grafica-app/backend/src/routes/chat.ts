import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { chatMessages, users } from '../db/schema.js';
import { db } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { authenticate } from '../middleware/auth.js';

const messageSchema = z.object({
  room: z.string().min(1).default('geral'),
  content: z.string().min(1).max(4000),
});

const messageResponseSchema = {
  type: 'object',
  required: ['id', 'room', 'content', 'senderId'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    room: { type: 'string' },
    content: { type: 'string' },
    senderId: { type: 'string' },
    senderName: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export async function chatRoutes(app: FastifyInstance) {
  app.get('/api/messages', {
    schema: {
      tags: ['Chat'],
      summary: 'Listar mensagens',
      description: 'Lista até 200 mensagens de uma sala (padrão "geral"). Envio/recebimento em tempo real via Socket.IO.',
      querystring: {
        type: 'object',
        properties: {
          room: { type: 'string' },
        },
      },
      response: {
        200: { type: 'array', items: messageResponseSchema },
      },
    },
    preHandler: [authenticate],
  }, async (request) => {
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

  app.post('/api/messages', {
    schema: {
      tags: ['Chat'],
      summary: 'Enviar mensagem',
      description: 'Publica uma mensagem na sala e a emite em tempo real via Socket.IO.',
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          room: { type: 'string' },
          content: { type: 'string', minLength: 1, maxLength: 4000 },
        },
      },
      response: {
        201: messageResponseSchema,
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const parsed = messageSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const message = {
      id: newId(),
      room: parsed.data.room,
      content: parsed.data.content,
      senderId: request.userId as string,
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
