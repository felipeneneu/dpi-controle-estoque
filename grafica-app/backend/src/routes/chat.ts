import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, lt, ne } from 'drizzle-orm';
import { chatMessages, users } from '../db/schema.js';
import { db } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { authenticate } from '../middleware/auth.js';
import { isCommand, executeCommand, getCommandsList } from '../lib/chat-commands.js';

function dmRoom(userId1: string, userId2: string): string {
  return `dm:${[userId1, userId2].sort().join(':')}`;
}

const messageSchema = z.object({
  room: z.string().min(1).default('geral'),
  recipientId: z.string().optional(),
  content: z.string().min(1).max(500000),
});

const messageResponseSchema = {
  type: 'object',
  required: ['id', 'room', 'content', 'senderId'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    room: { type: 'string' },
    recipientId: { type: 'string', nullable: true },
    content: { type: 'string' },
    senderId: { type: 'string' },
    senderName: { type: 'string', nullable: true },
    senderAvatar: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    isCommand: { type: 'boolean', default: false },
  },
};

export async function chatRoutes(app: FastifyInstance) {
  app.get('/api/chat/commands', {
    schema: {
      tags: ['Chat'],
      summary: 'Listar comandos',
      description: 'Retorna a lista de comandos disponíveis no chat.',
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
      },
    },
    preHandler: [authenticate],
  }, async () => {
    return getCommandsList();
  });

  app.get('/api/messages', {
    schema: {
      tags: ['Chat'],
      summary: 'Listar mensagens',
      description: 'Lista até 50 mensagens de uma sala (padrão "geral") com paginação por cursor (before). Envio/recebimento em tempo real via Socket.IO.',
      querystring: {
        type: 'object',
        properties: {
          room: { type: 'string' },
          before: { type: 'string' },
          limit: { type: 'number' },
        },
      },
      response: {
        200: { type: 'array', items: messageResponseSchema },
      },
    },
    preHandler: [authenticate],
  }, async (request) => {
    const query = request.query as { room?: string; before?: string; limit?: number };
    const room = query.room || 'geral';
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);

    const conditions = [
      eq(chatMessages.room, room),
      ne(chatMessages.senderId, 'system'),
    ];

    if (query.before) {
      const beforeDate = new Date(query.before);
      if (!isNaN(beforeDate.getTime())) {
        conditions.push(lt(chatMessages.createdAt, beforeDate));
      }
    }

    const rows = await db
      .select({
        id: chatMessages.id,
        room: chatMessages.room,
        recipientId: chatMessages.recipientId,
        content: chatMessages.content,
        createdAt: chatMessages.createdAt,
        senderId: chatMessages.senderId,
        senderName: users.name,
        senderAvatar: users.avatar,
      })
      .from(chatMessages)
      .leftJoin(users, eq(users.id, chatMessages.senderId))
      .where(and(...conditions))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit)
      .all();
    return rows.reverse();
  });

  app.get('/api/messages/dm/:recipientId', {
    schema: {
      tags: ['Chat'],
      summary: 'Listar mensagens DM',
      description: 'Lista até 50 mensagens privadas com um usuário específico com paginação por cursor (before).',
      params: {
        type: 'object',
        required: ['recipientId'],
        properties: {
          recipientId: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          before: { type: 'string' },
          limit: { type: 'number' },
        },
      },
      response: {
        200: { type: 'array', items: messageResponseSchema },
      },
    },
    preHandler: [authenticate],
  }, async (request) => {
    const { recipientId } = request.params as { recipientId: string };
    const query = request.query as { before?: string; limit?: number };
    const userId = request.userId as string;
    const room = dmRoom(userId, recipientId);
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);

    const conditions = [
      eq(chatMessages.room, room),
      ne(chatMessages.senderId, 'system'),
    ];

    if (query.before) {
      const beforeDate = new Date(query.before);
      if (!isNaN(beforeDate.getTime())) {
        conditions.push(lt(chatMessages.createdAt, beforeDate));
      }
    }

    const rows = await db
      .select({
        id: chatMessages.id,
        room: chatMessages.room,
        recipientId: chatMessages.recipientId,
        content: chatMessages.content,
        createdAt: chatMessages.createdAt,
        senderId: chatMessages.senderId,
        senderName: users.name,
        senderAvatar: users.avatar,
      })
      .from(chatMessages)
      .leftJoin(users, eq(users.id, chatMessages.senderId))
      .where(and(...conditions))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit)
      .all();
    return rows.reverse();
  });

  app.get('/api/chat/contacts', {
    schema: {
      tags: ['Chat'],
      summary: 'Listar contatos',
      description: 'Lista todos os usuários com última mensagem e contagem de não lidas.',
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              avatar: { type: 'string', nullable: true },
              lastMessage: { type: 'string', nullable: true },
              lastMessageAt: { type: 'string', format: 'date-time', nullable: true },
              unreadCount: { type: 'number' },
            },
          },
        },
      },
    },
    preHandler: [authenticate],
  }, async (request) => {
    const userId = request.userId as string;
    const allUsers = await db
      .select({ id: users.id, name: users.name, avatar: users.avatar })
      .from(users)
      .all();

    const contacts = await Promise.all(
      allUsers
        .filter((u) => u.id !== userId)
        .map(async (u) => {
          const room = dmRoom(userId, u.id);
          const lastMsg = await db
            .select({
              content: chatMessages.content,
              createdAt: chatMessages.createdAt,
            })
            .from(chatMessages)
            .where(eq(chatMessages.room, room))
            .orderBy(desc(chatMessages.createdAt))
            .limit(1)
            .get();

          return {
            id: u.id,
            name: u.name,
            avatar: u.avatar,
            lastMessage: lastMsg?.content ?? null,
            lastMessageAt: lastMsg?.createdAt?.toISOString() ?? null,
            unreadCount: 0,
          };
        })
    );

    contacts.sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt) return b.lastMessageAt > a.lastMessageAt ? 1 : -1;
      if (a.lastMessageAt) return -1;
      if (b.lastMessageAt) return 1;
      return a.name.localeCompare(b.name);
    });

    return contacts;
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
          recipientId: { type: 'string' },
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

    const senderId = request.userId as string;
    let room = parsed.data.room;
    const recipientId = parsed.data.recipientId;

    if (recipientId && recipientId !== senderId) {
      room = dmRoom(senderId, recipientId);
    }

    if (isCommand(parsed.data.content)) {
      const result = await executeCommand(parsed.data.content, senderId);
      if (result) {
        const userMsg = {
          id: newId(),
          room,
          recipientId: recipientId ?? null,
          content: parsed.data.content,
          senderId,
        };
        await db.insert(chatMessages).values(userMsg);
        const sender = await db
          .select({ name: users.name, avatar: users.avatar })
          .from(users)
          .where(eq(users.id, senderId))
          .get();
        const userPayload = {
          ...userMsg,
          createdAt: new Date().toISOString(),
          senderName: sender?.name,
          senderAvatar: sender?.avatar ?? null,
        };
        app.io.to(room).emit('chat:message', userPayload);

        const botDmRoom = dmRoom('system', senderId);
        const botMsg = {
          id: newId(),
          room: botDmRoom,
          recipientId: senderId,
          content: result.content,
          senderId: 'system',
          senderName: 'GraficaOS Bot',
          senderAvatar: null,
          createdAt: new Date().toISOString(),
          isCommand: true,
        };
        // Bot messages are ephemeral (not saved to DB history)
        app.io.to(`user:${senderId}`).emit('chat:message', botMsg);
        return reply.code(201).send(botMsg);
      }
    }

    const message = {
      id: newId(),
      room,
      recipientId: recipientId ?? null,
      content: parsed.data.content,
      senderId,
    };
    await db.insert(chatMessages).values(message);
    const sender = await db
      .select({ name: users.name, avatar: users.avatar })
      .from(users)
      .where(eq(users.id, senderId))
      .get();
    const payload = {
      ...message,
      createdAt: new Date().toISOString(),
      senderName: sender?.name,
      senderAvatar: sender?.avatar ?? null,
    };
    app.io.to(room).emit('chat:message', payload);
    return reply.code(201).send(payload);
  });
}
