import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { makeApp, ensureSchema, resetDb } from '../helpers/app.js';
import { db } from '../../src/db/index.js';
import { machines, stockItems, tintaLotes, users } from '../../src/db/schema.js';
import { newId } from '../../src/lib/ids.js';

describe('POST /api/machines/:id/active-tinta (Quick Switch de Tinta)', () => {
  let app: FastifyInstance;
  let token: string;
  let machineId: string;
  let inkItemId: string;

  beforeAll(async () => {
    app = await makeApp();
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Op Tintas', email: 'op-tintas@exemplo.com', password: 'senha123' },
    });
    await db.update(users).set({ role: 'OPERATOR' }).where(eq(users.email, 'op-tintas@exemplo.com'));
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'op-tintas@exemplo.com', password: 'senha123' },
    });
    token = res.json().token as string;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await ensureSchema();
    await resetDb();

    machineId = newId();
    await db.insert(machines).values({
      id: machineId,
      name: 'Mimaki UJF-6042',
      brand: 'Mimaki',
      model: 'UJF-6042',
      technology: 'Piezo',
    });

    inkItemId = newId();
    await db.insert(stockItems).values({
      id: inkItemId,
      name: 'Tinta UV Cyan',
      category: 'INK_SUPPLY',
      unit: 'un',
      currentQuantity: 10,
      minQuantity: 2,
    });
  });

  async function seedLote(code: string, state: 'NEW' | 'IN_USE' | 'FINISHED' = 'NEW', channel?: string) {
    const id = newId();
    await db.insert(tintaLotes).values({
      id,
      stockItemId: inkItemId,
      serial: code,
      state,
      location: state === 'IN_USE' ? `machine:${machineId}` : state === 'FINISHED' ? 'discarded' : 'deposito',
      machineId: state === 'IN_USE' ? machineId : null,
      channel: channel ?? null,
    });
    return (await db.select().from(tintaLotes).where(eq(tintaLotes.id, id)).get())!;
  }

  it('carrega um lote novo (NEW) na máquina como IN_USE e no canal especificado', async () => {
    const lote = await seedLote('LOTE-CYAN-001');

    const res = await app.inject({
      method: 'POST',
      url: `/api/machines/${machineId}/active-tinta`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        channel: 'CYAN',
        newLoteId: lote.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.activeLote).toMatchObject({
      id: lote.id,
      state: 'IN_USE',
      location: `machine:${machineId}`,
      machineId,
      channel: 'CYAN',
    });

    const updated = await db.select().from(tintaLotes).where(eq(tintaLotes.id, lote.id)).get();
    expect(updated!.state).toBe('IN_USE');
    expect(updated!.location).toBe(`machine:${machineId}`);
    expect(updated!.channel).toBe('CYAN');
    expect(updated!.openedAt).toBeDefined();
  });

  it('ao trocar lote no mesmo canal, marca lote anterior como FINISHED por padrão', async () => {
    const lote1 = await seedLote('LOTE-CYAN-001', 'IN_USE', 'CYAN');
    const lote2 = await seedLote('LOTE-CYAN-002', 'NEW');

    const res = await app.inject({
      method: 'POST',
      url: `/api/machines/${machineId}/active-tinta`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        channel: 'CYAN',
        newLoteId: lote2.id,
      },
    });

    expect(res.statusCode).toBe(200);

    // Lote anterior baixado/descartado
    const lote1Atualizado = await db.select().from(tintaLotes).where(eq(tintaLotes.id, lote1.id)).get();
    expect(lote1Atualizado!.state).toBe('FINISHED');
    expect(lote1Atualizado!.location).toBe('discarded');
    expect(lote1Atualizado!.finishedAt).toBeDefined();

    // Novo lote ativo
    const lote2Atualizado = await db.select().from(tintaLotes).where(eq(tintaLotes.id, lote2.id)).get();
    expect(lote2Atualizado!.state).toBe('IN_USE');
    expect(lote2Atualizado!.location).toBe(`machine:${machineId}`);
  });

  it('ao passar oldLoteAction RETURN_TO_STOCK, lote anterior volta para NEW / deposito', async () => {
    const lote1 = await seedLote('LOTE-CYAN-001', 'IN_USE', 'CYAN');
    const lote2 = await seedLote('LOTE-CYAN-002', 'NEW');

    const res = await app.inject({
      method: 'POST',
      url: `/api/machines/${machineId}/active-tinta`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        channel: 'CYAN',
        newLoteId: lote2.id,
        oldLoteAction: 'RETURN_TO_STOCK',
      },
    });

    expect(res.statusCode).toBe(200);

    const lote1Atualizado = await db.select().from(tintaLotes).where(eq(tintaLotes.id, lote1.id)).get();
    expect(lote1Atualizado!.state).toBe('NEW');
    expect(lote1Atualizado!.location).toBe('deposito');
    expect(lote1Atualizado!.finishedAt).toBeNull();
  });

  it('recusa carregar lote que já está FINISHED', async () => {
    const loteFinished = await seedLote('LOTE-CYAN-OLD', 'FINISHED');

    const res = await app.inject({
      method: 'POST',
      url: `/api/machines/${machineId}/active-tinta`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        channel: 'CYAN',
        newLoteId: loteFinished.id,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/descartado|terminado/i);
  });

  it('retorna 404 quando lote não existe', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/machines/${machineId}/active-tinta`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        channel: 'CYAN',
        newLoteId: 'nao-existe',
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it('retorna 404 quando máquina não existe', async () => {
    const lote = await seedLote('LOTE-CYAN-999');

    const res = await app.inject({
      method: 'POST',
      url: '/api/machines/mach-inexistente/active-tinta',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        channel: 'CYAN',
        newLoteId: lote.id,
      },
    });

    expect(res.statusCode).toBe(404);
  });
});
