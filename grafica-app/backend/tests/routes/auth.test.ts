import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp } from '../helpers/app.js';
import { eq } from 'drizzle-orm';
import { users } from '../../src/db/schema.js';
import { db } from '../../src/db/index.js';

describe('auth routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await makeApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('register creates an OPERATOR regardless of attempted role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Invasor',
        email: 'invasor@exemplo.com',
        password: 'senha123',
        role: 'DEV_MASTER',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.role).toBe('OPERATOR');

    const stored = await db.select().from(users).where(eq(users.email, 'invasor@exemplo.com')).get();
    expect(stored?.role).toBe('OPERATOR');
  });

  it('register returns 409 for duplicate email', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'A', email: 'dup@exemplo.com', password: 'senha123' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'B', email: 'dup@exemplo.com', password: 'outra123' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('register rejects a short password with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'X', email: 'x@exemplo.com', password: '12345' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('login succeeds with correct credentials and issues an expiring JWT', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'User', email: 'user@exemplo.com', password: 'senha123' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'user@exemplo.com', password: 'senha123' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeTruthy();
    const decoded = app.jwt.decode<{ sub: string; exp: number }>(body.token);
    expect(decoded).toBeTruthy();
    expect(decoded!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(typeof decoded!.exp).toBe('number');
  });

  it('login rejects wrong password with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'user@exemplo.com', password: 'incorreta' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('login rejects invalid email with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nao-email', password: 'senha123' },
    });
    expect(res.statusCode).toBe(400);
  });
});
