import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, or, and, like, sql } from 'drizzle-orm';
import { readdir } from 'node:fs/promises';
import { users, chatMessages, notifications, stockTransactions } from '../db/schema.js';
import { db, client } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { USERS_PUBLIC_DIR } from '../lib/paths.js';
import { hashPassword } from '../lib/password.js';
import { authenticate, authorize } from '../middleware/auth.js';

export const PROTECTED_SYSTEM_USERS = ['system', 'hp-agent-system', 'konica-agent-system'];

const userCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['DEV_MASTER', 'ADMIN', 'OPERATOR']).default('OPERATOR'),
  avatar: z.string().optional(),
});

const userUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['DEV_MASTER', 'ADMIN', 'OPERATOR']).optional(),
  avatar: z.string().nullable().optional(),
});

const userPublicResponseSchema = {
  type: 'object',
  required: ['id', 'name', 'email', 'role'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string' },
    role: { type: 'string', enum: ['DEV_MASTER', 'ADMIN', 'OPERATOR'] },
    avatar: { type: 'string', nullable: true },
  },
};

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.jfif'];

function publicUser(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
}) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, avatar: u.avatar };
}

export async function userRoutes(app: FastifyInstance) {
  app.get('/api/users', {
    schema: {
      tags: ['Usuários'],
      summary: 'Listar usuários',
      description: 'Lista usuários (sem dados sensíveis) — requer ADMIN/DEV_MASTER.',
      response: {
        200: { type: 'array', items: userPublicResponseSchema },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
  }, async () =>
    (await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, avatar: users.avatar }).from(users).all()).map(publicUser),
  );

  app.get('/api/user-photos', {
    schema: {
      tags: ['Usuários'],
      summary: 'Listar fotos de avatar',
      description: 'Lista as imagens de avatar disponíveis no diretório público.',
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'url'],
            properties: {
              name: { type: 'string' },
              url: { type: 'string' },
            },
          },
        },
      },
    },
    preHandler: [authenticate],
  }, async () => {
    try {
      const files = await readdir(USERS_PUBLIC_DIR);
      const photos = files
        .filter((f) => IMAGE_EXTS.some((ext) => f.toLowerCase().endsWith(ext)))
        .map((f) => ({ name: f, url: `/users/${f}` }));
      return photos;
    } catch {
      return [];
    }
  });

  app.post('/api/users', {
    schema: {
      tags: ['Usuários'],
      summary: 'Criar usuário',
      description: 'Cria um novo usuário (requer DEV_MASTER).',
      body: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          role: { type: 'string', enum: ['DEV_MASTER', 'ADMIN', 'OPERATOR'] },
          avatar: { type: 'string' },
        },
      },
      response: {
        201: userPublicResponseSchema,
        400: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        409: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
  }, async (request, reply) => {
    const parsed = userCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    if (parsed.data.role === 'DEV_MASTER' && request.userRole !== 'DEV_MASTER') {
      return reply.code(403).send({ error: 'Apenas DEV_MASTER pode criar usuários DEV_MASTER' });
    }
    const existing = await db.select().from(users).where(eq(users.email, parsed.data.email)).get();
    if (existing) return reply.code(409).send({ error: 'Email already registered' });
    const user = {
      id: newId(),
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      passwordHash: hashPassword(parsed.data.password),
      role: parsed.data.role,
      avatar: parsed.data.avatar ?? null,
    };
    await db.insert(users).values(user);
    return reply.code(201).send(publicUser(user));
  });

  app.patch('/api/users/:id', {
    schema: {
      tags: ['Usuários'],
      summary: 'Atualizar usuário',
      description: 'Atualiza o próprio usuário ou outro usuário (requer ADMIN/DEV_MASTER para alterar roles ou outros usuários).',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          role: { type: 'string', enum: ['DEV_MASTER', 'ADMIN', 'OPERATOR'] },
          avatar: { type: 'string', nullable: true },
        },
      },
      response: {
        200: userPublicResponseSchema,
        400: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        409: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const actorId = request.userId;
    const actorRole = request.userRole;
    const isSelf = actorId === id;
    const isManager = actorRole === 'DEV_MASTER' || actorRole === 'ADMIN';

    const parsed = userUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });

    if (!isManager && !isSelf) return reply.code(403).send({ error: 'Forbidden' });
    if (parsed.data.role && !isManager) return reply.code(403).send({ error: 'Only managers can change role' });

    const existing = await db.select().from(users).where(eq(users.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Not found' });

    if (actorRole === 'ADMIN' && parsed.data.role === 'DEV_MASTER') {
      return reply.code(403).send({ error: 'Only DEV_MASTER can grant DEV_MASTER' });
    }
    if (actorRole === 'ADMIN' && existing.role === 'DEV_MASTER') {
      return reply.code(403).send({ error: 'Only DEV_MASTER can modify a DEV_MASTER' });
    }

    if (parsed.data.email) {
      const dup = await db
        .select()
        .from(users)
        .where(eq(users.email, parsed.data.email.toLowerCase()))
        .get();
      if (dup && dup.id !== id) return reply.code(409).send({ error: 'Email already registered' });
    }

    const patch: Record<string, unknown> = {};
    if (parsed.data.name) patch.name = parsed.data.name;
    if (parsed.data.email) patch.email = parsed.data.email.toLowerCase();
    if (parsed.data.role) patch.role = parsed.data.role;
    if ('avatar' in parsed.data) patch.avatar = parsed.data.avatar;
    if (parsed.data.password) patch.passwordHash = hashPassword(parsed.data.password);

    await db.update(users).set(patch).where(eq(users.id, id));
    const updated = await db.select().from(users).where(eq(users.id, id)).get();
    return publicUser(updated!);
  });

  app.delete('/api/users/:id', {
    schema: {
      tags: ['Usuários'],
      summary: 'Excluir usuário',
      description: 'Remove um usuário (requer DEV_MASTER ou ADMIN; impossível excluir a si mesmo ou bots/agentes do sistema).',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      response: {
        200: { type: 'object', properties: { ok: { type: 'boolean' } } },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        500: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    if (PROTECTED_SYSTEM_USERS.includes(id)) {
      return reply.code(400).send({ error: 'Usuários de sistema (bot e agentes) não podem ser excluídos.' });
    }

    if (id === request.userId) {
      return reply.code(400).send({ error: 'Não é possível excluir seu próprio usuário.' });
    }

    const target = await db.select().from(users).where(eq(users.id, id)).get();
    if (!target) {
      return reply.code(404).send({ error: 'Usuário não encontrado.' });
    }

    if (target.role === 'DEV_MASTER' && request.userRole !== 'DEV_MASTER') {
      return reply.code(403).send({ error: 'Apenas DEV_MASTER pode excluir outro DEV_MASTER.' });
    }

    try {
      // 1. Remove notificações associadas a este usuário
      await db.delete(notifications).where(eq(notifications.userId, id));

      // 2. Preserva o nome do operador nas movimentações de estoque e anula a referência de FK
      //    COALESCE preserva userName já definido; preenche apenas se for NULL.
      //    userId é sempre zerado para remover a referência FK (antiga ou nova schema).
      await db.update(stockTransactions)
        .set({ userName: sql`COALESCE(user_name, ${target.name})`, userId: null })
        .where(eq(stockTransactions.userId, id));

      // 3. Remove em cascata todas as mensagens enviadas pelo usuário (canais públicos e privados)
      // e todas as conversas diretas privadas (DMs) onde o usuário participou
      await db.delete(chatMessages).where(
        or(
          eq(chatMessages.senderId, id),
          eq(chatMessages.recipientId, id),
          like(chatMessages.room, `dm:${id}:%`),
          like(chatMessages.room, `dm:%:${id}`),
        ),
      );

      // 4. Exclui o usuário — usa raw SQL com FK desligado para ser seguro em qualquer estado do schema
      await client.batch([
        { sql: 'PRAGMA foreign_keys=OFF', args: [] },
        { sql: 'DELETE FROM users WHERE id = ?', args: [id] },
        { sql: 'PRAGMA foreign_keys=ON', args: [] },
      ]);

      // 5. Notifica clientes conectados via Socket.IO
      app.io?.emit('chat:user_deleted', { userId: id });

      return reply.code(200).send({ ok: true });
    } catch (err: unknown) {
      request.log.error(err, `[users] Erro ao excluir usuário ${id}:`);
      const msg = err instanceof Error ? err.message : 'Erro ao excluir usuário';
      return reply.code(500).send({ error: msg });
    }
  });
}