import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp } from '../helpers/app.js';

describe('whatsapp recipients + groups routes', () => {
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

  async function createRecipient(payload: Record<string, unknown> = {}) {
    return app.inject({
      method: 'POST',
      url: '/api/whatsapp/recipients',
      headers: { authorization: `Bearer ${admin}` },
      payload: { phone: '5511987654321', priority: 'principal', ...payload },
    });
  }

  beforeAll(async () => {
    app = await makeApp();
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'WaOp', email: 'wa-op@exemplo.com', password: 'senha123' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'WaAd', email: 'wa-ad@exemplo.com', password: 'senha123' },
    });
    const { db } = await import('../../src/db/index.js');
    const { users } = await import('../../src/db/schema.js');
    const { eq } = await import('drizzle-orm');
    await db.update(users).set({ role: 'ADMIN' }).where(eq(users.email, 'wa-ad@exemplo.com'));
    admin = await login('wa-ad@exemplo.com', 'senha123');
    operator = await login('wa-op@exemplo.com', 'senha123');
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/whatsapp/recipients requires authentication (401 without token)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/whatsapp/recipients' });
    expect(res.statusCode).toBe(401);
  });

  it('blocks OPERATOR from recipients with 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/whatsapp/recipients',
      headers: { authorization: `Bearer ${operator}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('creates a recipient', async () => {
    const res = await createRecipient({ label: 'Gerente', priority: 'principal' });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.phone).toBe('5511987654321');
    expect(body.label).toBe('Gerente');
    expect(body.priority).toBe('principal');
    expect(body.active).toBe(true);
    expect(body.id).toBeTruthy();
  });

  it('lists recipients', async () => {
    await createRecipient();
    const res = await app.inject({
      method: 'GET',
      url: '/api/whatsapp/recipients',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThan(0);
  });

  it('rejects invalid recipient creation with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/whatsapp/recipients',
      headers: { authorization: `Bearer ${admin}` },
      payload: { phone: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('patches a recipient (active + priority)', async () => {
    const created = await createRecipient();
    const r = created.json();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/whatsapp/recipients/${r.id}`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { active: false, priority: 'backup' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().active).toBe(false);
    expect(res.json().priority).toBe('backup');
  });

  it('deletes a recipient (204)', async () => {
    const created = await createRecipient();
    const r = created.json();
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/whatsapp/recipients/${r.id}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(204);
  });

  it('lists groups (empty when no socket connected)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/whatsapp/groups',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('persists groupId via config', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/whatsapp/config',
      headers: { authorization: `Bearer ${admin}` },
      payload: { groupId: '1203@g.us' },
    });
    expect(res.statusCode).toBe(200);
    const { db } = await import('../../src/db/index.js');
    const { settings } = await import('../../src/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const row = await db.select().from(settings).where(eq(settings.key, 'whatsapp.groupId')).get();
    expect(row?.value).toBe('1203@g.us');
  });
});