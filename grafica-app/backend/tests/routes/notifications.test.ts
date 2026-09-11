import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp } from '../helpers/app.js';

describe('notifications routes (ack)', () => {
  let app: FastifyInstance;
  let admin: string;
  let userId: string;

  beforeAll(async () => {
    app = await makeApp();
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'NotAd', email: 'not-ad@exemplo.com', password: 'senha123' },
    });
    const { db } = await import('../../src/db/index.js');
    const { users } = await import('../../src/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const u = await db.select().from(users).where(eq(users.email, 'not-ad@exemplo.com')).get();
    userId = u.id;

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'not-ad@exemplo.com', password: 'senha123' },
    });
    admin = res.json().token as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('ack requires authentication (401 without token)', async () => {
    const { db } = await import('../../src/db/index.js');
    const { notifications } = await import('../../src/db/schema.js');
    await db.insert(notifications).values({
      id: 'notif-ack-401',
      userId,
      title: 'Estoque zerado',
      type: 'stock',
      alertLevel: 'OUT_OF_STOCK',
      waMessage: 'msg',
    });
    const res = await app.inject({ method: 'POST', url: '/api/notifications/notif-ack-401/ack' });
    expect(res.statusCode).toBe(401);
  });

  it('acks a notification scoped to the user (sets acknowledgedAt)', async () => {
    const { db } = await import('../../src/db/index.js');
    const { notifications } = await import('../../src/db/schema.js');
    const { eq } = await import('drizzle-orm');
    await db.insert(notifications).values({
      id: 'notif-ack-1',
      userId,
      title: 'Estoque zerado',
      type: 'stock',
      alertLevel: 'OUT_OF_STOCK',
      waMessage: 'msg',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/notifications/notif-ack-1/ack',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(204);

    const row = await db.select().from(notifications).where(eq(notifications.id, 'notif-ack-1')).get();
    expect(row.acknowledgedAt).not.toBeNull();
  });

  it('lists notifications including ack fields', async () => {
    const { db } = await import('../../src/db/index.js');
    const { notifications } = await import('../../src/db/schema.js');
    await db.insert(notifications).values({
      id: 'notif-list-1',
      userId,
      title: 'Estoque baixo',
      type: 'stock',
      alertLevel: 'LOW_STOCK',
      waMessage: 'msg',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.length).toBeGreaterThan(0);
    const n = body[0];
    expect(n).toHaveProperty('acknowledgedAt');
    expect(n).toHaveProperty('itemId');
    expect(n).toHaveProperty('alertLevel');
  });

  it('deletes a specific notification via DELETE /api/notifications/:id', async () => {
    const { db } = await import('../../src/db/index.js');
    const { notifications } = await import('../../src/db/schema.js');
    const { eq } = await import('drizzle-orm');
    await db.insert(notifications).values({
      id: 'notif-del-single',
      userId,
      title: 'Notif para apagar',
      type: 'stock',
      alertLevel: 'LOW_STOCK',
      waMessage: 'msg',
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/notifications/notif-del-single',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const row = await db.select().from(notifications).where(eq(notifications.id, 'notif-del-single')).get();
    expect(row).toBeUndefined();
  });

  it('clears all notifications via DELETE /api/notifications', async () => {
    const { db } = await import('../../src/db/index.js');
    const { notifications } = await import('../../src/db/schema.js');
    await db.insert(notifications).values({
      id: 'notif-clear-1',
      userId,
      title: 'Notif 1',
      type: 'stock',
      alertLevel: 'LOW_STOCK',
    });
    await db.insert(notifications).values({
      id: 'notif-clear-2',
      userId,
      title: 'Notif 2',
      type: 'stock',
      alertLevel: 'OUT_OF_STOCK',
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(listRes.json()).toEqual([]);
  });
});