import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp } from '../helpers/app.js';
import { db } from '../../src/db/index.js';
import { users, chatMessages, notifications, stockTransactions, stockItems } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { newId } from '../../src/lib/ids.js';

describe('users routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminId: string;
  let devId: string;
  let devToken: string;

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
    const devLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'dev@exemplo.com', password: 'senha123' },
    });
    devToken = devLogin.json().token;
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

  it('allows DEV_MASTER to delete user and cleans up/reattributes foreign keys cleanly', async () => {
    const userToDeleteEmail = 'todelete@exemplo.com';
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'To Delete', email: userToDeleteEmail, password: 'senha123' },
    });
    const uRow = await db.select().from(users).where(eq(users.email, userToDeleteEmail)).get();
    const uId = uRow!.id;

    // 1. Insert a notification
    await db.insert(notifications).values({
      id: newId(),
      userId: uId,
      title: 'Notif teste',
      type: 'info',
    });

    // 2. Insert direct messages (DM both ways in the DM room)
    const dmMsgId = newId();
    await db.insert(chatMessages).values({
      id: dmMsgId,
      room: `dm:${uId}:${adminId}`,
      senderId: uId,
      recipientId: adminId,
      content: 'Mensagem privada enviada pelo usuario',
    });
    const dmReplyMsgId = newId();
    await db.insert(chatMessages).values({
      id: dmReplyMsgId,
      room: `dm:${uId}:${adminId}`,
      senderId: adminId,
      recipientId: uId,
      content: 'Resposta privada enviada para o usuario',
    });

    // 3. Insert a public channel message
    const publicMsgId = newId();
    await db.insert(chatMessages).values({
      id: publicMsgId,
      room: 'geral',
      senderId: uId,
      content: 'Mensagem publica no canal geral',
    });

    // 4. Insert a stock item & transaction
    const itemId = newId();
    await db.insert(stockItems).values({
      id: itemId,
      name: 'Item FK Test',
      category: 'PAPER_MEDIA',
      unit: 'fls',
      currentQuantity: 10,
      minQuantity: 5,
    });
    const txId = newId();
    await db.insert(stockTransactions).values({
      id: txId,
      itemId,
      type: 'IN',
      quantity: 10,
      userId: uId,
      userName: 'User Teste',
    });

    // Delete user using devToken
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/users/${uId}`,
      headers: { authorization: `Bearer ${devToken}` },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json()).toEqual({ ok: true });

    // User is gone
    const deletedUser = await db.select().from(users).where(eq(users.id, uId)).get();
    expect(deletedUser).toBeUndefined();

    // DMs are completely deleted in cascade
    const dmRow = await db.select().from(chatMessages).where(eq(chatMessages.id, dmMsgId)).get();
    expect(dmRow).toBeUndefined();
    const dmReplyRow = await db.select().from(chatMessages).where(eq(chatMessages.id, dmReplyMsgId)).get();
    expect(dmReplyRow).toBeUndefined();

    // Public message sent by user is DELETED in cascade
    const publicRow = await db.select().from(chatMessages).where(eq(chatMessages.id, publicMsgId)).get();
    expect(publicRow).toBeUndefined();

    // Stock transaction preserved with original quantity, type and userName intact (unaltered)
    // userId is nulled out (FK reference removed) but userName snapshot is kept
    const txRow = await db.select().from(stockTransactions).where(eq(stockTransactions.id, txId)).get();
    expect(txRow).toBeDefined();
    expect(txRow!.quantity).toBe(10);
    expect(txRow!.type).toBe('IN');
    expect(txRow!.userName).toBe('User Teste');
    expect(txRow!.userId).toBeNull();
  });
});
