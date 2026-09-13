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
  avatar: z.string().optional(),
});

const TOKEN_TTL = '12h';
const AUTH_RATE_LIMIT = { max: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 5), timeWindow: '1 minute' };

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', {
    config: { rateLimit: AUTH_RATE_LIMIT },
    schema: {
      tags: ['Autenticação'],
      summary: 'Login',
      description: 'Autentica um usuário e retorna um token JWT.',
      security: [],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
      response: {
        200: {
          type: 'object',
          required: ['token', 'user'],
          properties: {
            token: { type: 'string', description: 'Token JWT para autenticação.' },
            user: {
              type: 'object',
              required: ['id', 'name', 'email', 'role'],
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'string', enum: ['DEV_MASTER', 'ADMIN', 'OPERATOR'] },
                avatar: { type: 'string', nullable: true },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
        400: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
      },
    },
  }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;
    const user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }
    const token = app.jwt.sign({ sub: user.id, role: user.role }, { expiresIn: TOKEN_TTL });
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    };
  });

  app.post('/api/auth/register', {
    config: { rateLimit: AUTH_RATE_LIMIT },
    schema: {
      tags: ['Autenticação'],
      summary: 'Registro de usuário',
      description: 'Registra um novo usuário (sempre role OPERATOR) e retorna um token JWT.',
      security: [],
      body: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          avatar: { type: 'string' },
        },
      },
      response: {
        201: {
          type: 'object',
          required: ['token', 'user'],
          properties: {
            token: { type: 'string' },
            user: {
              type: 'object',
              required: ['id', 'name', 'email', 'role'],
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'string', enum: ['OPERATOR'] },
                avatar: { type: 'string', nullable: true },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
        409: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
      },
    },
  }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const { name, email, password, avatar } = parsed.data;
    const existing = await db.select().from(users).where(eq(users.email, email)).get();
    if (existing) {
      return reply.code(409).send({ error: 'Email already registered' });
    }
    const user = {
      id: newId(),
      name,
      email,
      passwordHash: hashPassword(password),
      role: 'OPERATOR' as const,
      avatar: avatar ?? null,
    };
    await db.insert(users).values(user);
    const token = app.jwt.sign({ sub: user.id, role: user.role }, { expiresIn: TOKEN_TTL });
    return reply.code(201).send({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    });
  });
}
