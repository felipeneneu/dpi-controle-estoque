import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp } from '../helpers/app.js';

describe('stock routes', () => {
  let app: FastifyInstance;
  let admin: string;
  let operator: string;

  async function login(email: string, password: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password },
    });
    return res.json().token as string;
  }

  beforeAll(async () => {
    app = await makeApp();
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Op', email: 'op@exemplo.com', password: 'senha123' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Ad', email: 'ad@exemplo.com', password: 'senha123' },
    });
    const { db } = await import('../../src/db/index.js');
    const { users } = await import('../../src/db/schema.js');
    const { eq } = await import('drizzle-orm');
    await db.update(users).set({ role: 'ADMIN' }).where(eq(users.email, 'ad@exemplo.com'));
    admin = await login('ad@exemplo.com', 'senha123');
    operator = await login('op@exemplo.com', 'senha123');
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/stock-items requires authentication (401 without token)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stock-items' });
    expect(res.statusCode).toBe(401);
  });

  it('allows authenticated ADMIN to create an item', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/stock-items',
      headers: { authorization: `Bearer ${admin}` },
      payload: { name: 'Papel A4', category: 'PAPER_MEDIA', unit: 'fls' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('OUT_OF_STOCK');
    expect(body.id).toBeTruthy();
  });

  it('forbids OPERATOR from creating an item (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/stock-items',
      headers: { authorization: `Bearer ${operator}` },
      payload: { name: 'Tinta', category: 'INK_SUPPLY', unit: 'L' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('registers a transaction userId from the token, ignoring client-supplied value', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/stock-items',
      headers: { authorization: `Bearer ${admin}` },
      payload: { name: 'Papel Cartão', category: 'PAPER_MEDIA', unit: 'fls', currentQuantity: 100, minQuantity: 10 },
    });
    const itemId = create.json().id;

    const res = await app.inject({
      method: 'POST',
      url: '/api/stock-transactions',
      headers: { authorization: `Bearer ${operator}` },
      payload: { itemId, type: 'IN', quantity: 5, userId: 'forged-user-id' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.transaction.userId).not.toBe('forged-user-id');
    expect(body.transaction.userId).toBeTruthy();
  });

  it('forbids OPERATOR from performing an ADJUSTMENT (403)', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/stock-items',
      headers: { authorization: `Bearer ${admin}` },
      payload: { name: 'Papel Kraft', category: 'PAPER_MEDIA', unit: 'm', currentQuantity: 20, minQuantity: 5 },
    });
    const itemId = create.json().id;
    const res = await app.inject({
      method: 'POST',
      url: '/api/stock-transactions',
      headers: { authorization: `Bearer ${operator}` },
      payload: { itemId, type: 'ADJUSTMENT', quantity: 999 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('lets ADMIN perform an ADJUSTMENT (201)', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/stock-items',
      headers: { authorization: `Bearer ${admin}` },
      payload: { name: 'Papel Reciclado', category: 'PAPER_MEDIA', unit: 'm', currentQuantity: 20, minQuantity: 5 },
    });
    const itemId = create.json().id;
    const res = await app.inject({
      method: 'POST',
      url: '/api/stock-transactions',
      headers: { authorization: `Bearer ${admin}` },
      payload: { itemId, type: 'ADJUSTMENT', quantity: 30 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().newQty).toBe(30);
  });
});
