import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { users } from '../db/schema.js';
import { db } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { hashPassword } from '../lib/password.js';
import { authenticate, authorize } from '../middleware/auth.js';

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

const PUBLIC_USERS_DIR = fileURLToPath(new URL('../../../public/users/', import.meta.url));

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
  app.get('/api/users', { preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN'])] }, async () =>
    (await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, avatar: users.avatar }).from(users).all()).map(publicUser),
  );

  app.get('/api/user-photos', { preHandler: [authenticate] }, async () => {
    try {
      const files = await readdir(PUBLIC_USERS_DIR);
      const photos = files
        .filter((f) => IMAGE_EXTS.some((ext) => f.toLowerCase().endsWith(ext)))
        .map((f) => ({ name: f, url: `/users/${f}` }));
      return photos;
    } catch {
      return [];
    }
  });

  app.post('/api/users', { preHandler: [authenticate, authorize(['DEV_MASTER'])] }, async (request, reply) => {
    const parsed = userCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
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

  app.patch('/api/users/:id', { preHandler: [authenticate] }, async (request, reply) => {
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

  app.delete('/api/users/:id', { preHandler: [authenticate, authorize(['DEV_MASTER'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === request.userId) return reply.code(400).send({ error: 'Cannot delete yourself' });
    await db.delete(users).where(eq(users.id, id));
    return reply.code(204).send();
  });
}