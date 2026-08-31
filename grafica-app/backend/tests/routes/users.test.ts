import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp } from '../helpers/app.js';
import { db } from '../../src/db/index.js';
import { users } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('users routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminId: string;
  let devId: string;

  beforeAll(async () => {
    app = await makeApp();
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Adm', email: 'adm@exemplo.com', password: 'senha123' },
    });
    const admRow = await db.select().from(users).where(eq(users.email, 'adm@exemplo.com')).get();
    adminId = admRow!.id;
    await db.update(users).set({ role: 'ADMIN' }).where(eq(users.email, 'adm@exemplo.com'));
    const ad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'adm@exemplo.com', password: 'senha123' },
    });
    adminToken = ad.json().token;

    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Dev', email: 'dev@exemplo.com', password: 'senha123' },
    });
    await db.update(users).set({ role: 'DEV_MASTER' }).where(eq(users.email, 'dev@exemplo.com'));
    const devRow = await db.select().from(users).where(eq(users.email, 'dev@exemplo.com')).get();
    devId = devRow!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('forbids ADMIN from promoting itself to DEV_MASTER (403)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${adminId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: 'DEV_MASTER' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('forbids ADMIN from modifying a DEV_MASTER (403)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${devId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Hacked' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('lets ADMIN modify an OPERATOR', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Ops', email: 'ops@exemplo.com', password: 'senha123' },
    });
    const op = await db.select().from(users).where(eq(users.email, 'ops@exemplo.com')).get();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${op!.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Operador Novo' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Operador Novo');
  });

  it('forbids OPERATOR from listing users (403)', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Low', email: 'low@exemplo.com', password: 'senha123' },
    });
    const low = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'low@exemplo.com', password: 'senha123' },
    });
    const lowToken = low.json().token;
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${lowToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
