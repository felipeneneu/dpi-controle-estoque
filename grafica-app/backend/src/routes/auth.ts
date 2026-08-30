import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema.js';
import { db } from '../db/index.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { newId } from '../lib/ids.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['DEV_MASTER', 'ADMIN', 'OPERATOR']).optional(),
  avatar: z.string().optional(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;
    const user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }
    const token = app.jwt.sign({ sub: user.id, role: user.role });
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    };
  });

  app.post('/api/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const { name, email, password, role, avatar } = parsed.data;
    const existing = await db.select().from(users).where(eq(users.email, email)).get();
    if (existing) {
      return reply.code(409).send({ error: 'Email already registered' });
    }
    const user = {
      id: newId(),
      name,
      email,
      passwordHash: hashPassword(password),
      role: role ?? 'OPERATOR',
      avatar: avatar ?? null,
    };
    await db.insert(users).values(user);
    const token = app.jwt.sign({ sub: user.id, role: user.role });
    return reply.code(201).send({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    });
  });
}
