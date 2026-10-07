import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { makeApp, resetDb } from '../helpers/app.js';
import { db } from '../../src/db/index.js';
import { stockItems, machines, tintaLotes } from '../../src/db/schema.js';
import { newId } from '../../src/lib/ids.js';

describe('Rotas de Tinta Lotes e Saldo por Unidade (ADR-057 / BR-057)', () => {
  let app: Awaited<ReturnType<typeof makeApp>>;
  let token: string;

  async function login(email: string, password = 'password123') {
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
      payload: { name: 'Operador', email: 'op_lotes@grafica.local', password: 'password123' },
    });
    token = await login('op_lotes@grafica.local');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb();
  });

  async function seedTintaItem(name = 'hp_tinta-cyan', minQuantity = 2) {
    const id = newId();
    await db.insert(stockItems).values({
      id,
      name,
      category: 'INK_SUPPLY',
      unit: 'un',
      currentQuantity: 0,
      minQuantity,
    });
    return id;
  }

  async function seedMachine(name = 'HP Latex 330') {
    const id = newId();
    await db.insert(machines).values({
      id,
      name,
      brand: 'HP',
      model: 'Latex 330',
      technology: 'latex',
    });
    return id;
  }

  it('permite cadastrar novas unidades de tinta em lote e listar', async () => {
    const itemId = await seedTintaItem();

    // Cadastrar 3 garrafas/frascos
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/stock-items/${itemId}/tinta-lotes`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        serial: 'LOTE-CYAN-2026',
        quantity: 3,
        channel: 'Cyan',
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = createRes.json();
    expect(created.createdCount).toBe(3);

    // Listar lotes do item
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/stock-items/${itemId}/tinta-lotes`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(listRes.statusCode).toBe(200);
    const lotes = listRes.json();
    expect(lotes).toHaveLength(3);
    expect(lotes.every((l: { state: string }) => l.state === 'NEW')).toBe(true);
  });

  it('GET /api/stock-items calcula saldo disponível estritamente pela contagem de lotes NEW', async () => {
    const itemId = await seedTintaItem('tinta-mimaki-magenta', 2);
    const machineId = await seedMachine('Mimaki UV');

    // 2 lotes NEW na prateleira
    await db.insert(tintaLotes).values({
      id: newId(),
      stockItemId: itemId,
      serial: 'MAG-01',
      state: 'NEW',
      location: 'deposito',
    });
    await db.insert(tintaLotes).values({
      id: newId(),
      stockItemId: itemId,
      serial: 'MAG-02',
      state: 'NEW',
      location: 'deposito',
    });

    // 1 lote IN_USE na máquina (sai do disponível imediatamente)
    await db.insert(tintaLotes).values({
      id: newId(),
      stockItemId: itemId,
      serial: 'MAG-ATIVO',
      state: 'IN_USE',
      location: `machine:${machineId}`,
      machineId,
      channel: 'Magenta',
      openedAt: new Date(),
    });

    // 1 lote FINISHED (descartado)
    await db.insert(tintaLotes).values({
      id: newId(),
      stockItemId: itemId,
      serial: 'MAG-VELHO',
      state: 'FINISHED',
      location: 'discarded',
      finishedAt: new Date(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/stock-items',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const items = res.json();
    const item = items.find((i: { id: string }) => i.id === itemId);

    expect(item).toBeDefined();
    // Saldo disponível = 2 (apenas os NEW em deposito)
    expect(item.currentQuantity).toBe(2);
    expect(item.availableLots).toBe(2);
    // Total de lotes ativos/disponíveis = 3 (2 NEW + 1 IN_USE)
    expect(item.totalLots).toBe(3);
    // Lote ativo preenchido diretamente na linha
    expect(item.activeLot).toBeDefined();
    expect(item.activeLot.serial).toBe('MAG-ATIVO');
    expect(item.activeLot.machineName).toBe('Mimaki UV');
    expect(item.activeLot.channel).toBe('Magenta');
    // Como minQuantity = 2 e temos 2 NEW, status deve ser LOW_STOCK (<= minQuantity)
    expect(item.status).toBe('LOW_STOCK');
  });

  it('permite dar baixa manual (discharge) em um lote avariado ou expirado', async () => {
    const itemId = await seedTintaItem();
    const loteId = newId();

    await db.insert(tintaLotes).values({
      id: loteId,
      stockItemId: itemId,
      serial: 'AVARIADO-01',
      state: 'NEW',
      location: 'deposito',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/tinta-lotes/${loteId}/discharge`,
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: 'Frasco quebrado no almoxarifado' },
    });

    expect(res.statusCode).toBe(200);
    const loteDb = await db.select().from(tintaLotes).where(tintaLotes.id === loteId).get();
    expect(loteDb?.state).toBe('FINISHED');
    expect(loteDb?.location).toBe('discarded');
    expect(loteDb?.finishedAt).not.toBeNull();
  });
});
