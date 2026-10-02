import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { eq, and } from 'drizzle-orm';
import { ensureSchema, resetDb } from '../helpers/app.js';
import { db } from '../../src/db/index.js';
import { cartuchos, cartuchoConsumo, stockItems, stockTransactions, machines } from '../../src/db/schema.js';
import { newId } from '../../src/lib/ids.js';

/**
 * BR-052: a migration `0012_cartuchos.sql` precisa produzir um schema que sustente
 * o modelo de ativo. Estes testes prendem as garantias estruturais (indices e
 * constraints) que o codigo de rota depende para nao duplicar cartucho no canal.
 */

async function tableNames(): Promise<string[]> {
  const rows = await db.all(sql`SELECT name FROM sqlite_master WHERE type = 'table'`);
  return rows.map((r) => (r as { name: string }).name);
}

async function indexNames(): Promise<string[]> {
  const rows = await db.all(sql`SELECT name FROM sqlite_master WHERE type = 'index'`);
  return rows.map((r) => (r as { name: string }).name);
}

async function seedItem(name = 'hp_tinta-cyan') {
  const id = newId();
  await db.insert(stockItems).values({
    id,
    name,
    category: 'INK_SUPPLY',
    unit: 'ml',
    currentQuantity: 1000,
    minQuantity: 0,
  });
  return id;
}

async function seedMachine() {
  const id = newId();
  await db.insert(machines).values({
    id,
    name: 'HP Latex 330',
    brand: 'HP',
    model: 'Latex 330',
    technology: 'latex',
  });
  return id;
}

describe('migration 0012: cartuchos', () => {
  beforeEach(async () => {
    await ensureSchema();
    await resetDb();
  });

  it('cria as tabelas cartuchos e cartucho_consumo', async () => {
    const tables = await tableNames();
    expect(tables).toContain('cartuchos');
    expect(tables).toContain('cartucho_consumo');
  });

  it('cria os indices de cartucho e de origem no ledger', async () => {
    const idx = await indexNames();
    for (const name of [
      'cartuchos_stock_item_idx',
      'cartuchos_state_idx',
      'cartuchos_machine_idx',
      'cartuchos_channel_idx',
      'cartuchos_code_idx',
      'cartuchos_active_channel_idx',
      'cartucho_consumo_cartucho_idx',
      'stock_transactions_source_idx',
      'stock_items_code_idx',
    ]) {
      expect(idx, `indice ausente: ${name}`).toContain(name);
    }
  });

  it('aceita dois cartuchos NEW no mesmo canal (so o IN_USE e unico)', async () => {
    const itemId = await seedItem();
    for (let i = 0; i < 2; i++) {
      await db.insert(cartuchos).values({
        id: newId(),
        stockItemId: itemId,
        channel: 'C',
        unit: 'ml',
        levelInitial: 775,
        levelCurrent: 775,
        levelCapacity: 775,
        state: 'NEW',
      });
    }
    const rows = await db.select().from(cartuchos).all();
    expect(rows).toHaveLength(2);
  });

  it('recusa dois cartuchos IN_USE no mesmo canal da mesma maquina', async () => {
    const itemId = await seedItem();
    const machineId = await seedMachine();
    const values = {
      stockItemId: itemId,
      channel: 'C',
      unit: 'ml',
      levelInitial: 775,
      levelCurrent: 775,
      levelCapacity: 775,
      state: 'IN_USE' as const,
      machineId,
    };
    await db.insert(cartuchos).values({ id: newId(), ...values });

    // Regressao: sem o indice parcial, a maquina ficaria com dois cartuchos no slot.
    await expect(
      db.insert(cartuchos).values({ id: newId(), ...values }),
    ).rejects.toThrow();
  });

  it('permite o mesmo canal em maquinas diferentes', async () => {
    const itemId = await seedItem();
    const m1 = await seedMachine();
    await db.insert(machines).values({
      id: newId(),
      name: 'AccurioPrint C3070',
      brand: 'Konica',
      model: 'C3070',
      technology: 'laser',
    });
    const m2 = (await db.select().from(machines).all()).find((m) => m.id !== m1)!.id;

    for (const machineId of [m1, m2]) {
      await db.insert(cartuchos).values({
        id: newId(),
        stockItemId: itemId,
        channel: 'C',
        unit: 'ml',
        levelInitial: 775,
        levelCurrent: 775,
        levelCapacity: 775,
        state: 'IN_USE',
        machineId,
      });
    }
    const rows = await db.select().from(cartuchos).all();
    expect(rows).toHaveLength(2);
  });

  it('libera o canal quando o cartucho sai de IN_USE (troca)', async () => {
    const itemId = await seedItem();
    const machineId = await seedMachine();
    const first = newId();
    await db.insert(cartuchos).values({
      id: first,
      stockItemId: itemId,
      channel: 'C',
      unit: 'ml',
      levelInitial: 775,
      levelCurrent: 775,
      levelCapacity: 775,
      state: 'IN_USE',
      machineId,
    });

    await db
      .update(cartuchos)
      .set({ state: 'USED', location: 'discarded', finishedAt: new Date() })
      .where(eq(cartuchos.id, first));

    const second = newId();
    await db.insert(cartuchos).values({
      id: second,
      stockItemId: itemId,
      channel: 'C',
      unit: 'ml',
      levelInitial: 775,
      levelCurrent: 775,
      levelCapacity: 775,
      state: 'IN_USE',
      machineId,
    });
    expect(second).toBeTruthy();
  });

  it('grava source/source_ref no ledger', async () => {
    const itemId = await seedItem();
    await db.insert(stockTransactions).values({
      id: newId(),
      itemId,
      type: 'OUT',
      quantity: 120,
      reason: 'HP Agent: job X',
      source: 'cartucho_swap',
      sourceRef: 'cart-abc',
    });
    const tx = (await db.select().from(stockTransactions).all())[0]!;
    expect(tx.source).toBe('cartucho_swap');
    expect(tx.sourceRef).toBe('cart-abc');
  });

  it('registra consumo com atribuicao exata ou estimada', async () => {
    const itemId = await seedItem();
    const machineId = await seedMachine();
    const cartuchoId = newId();
    await db.insert(cartuchos).values({
      id: cartuchoId,
      stockItemId: itemId,
      channel: 'C',
      unit: 'ml',
      levelInitial: 775,
      levelCurrent: 700,
      levelCapacity: 775,
      state: 'IN_USE',
      machineId,
    });

    await db.insert(cartuchoConsumo).values({
      id: newId(),
      cartuchoId,
      machineId,
      jobId: 'job-1',
      jobName: 'PEDIDO_1',
      channel: 'C',
      quantity: 75,
      levelBefore: 775,
      levelAfter: 700,
      unit: 'ml',
      attribution: 'exact',
    });

    const row = (await db.select().from(cartuchoConsumo).all())[0]!;
    expect(row.attribution).toBe('exact');
    expect(row.quantity).toBe(75);
  });

  it('apaga o cartucho em cascata quando o item sai do estoque', async () => {
    const itemId = await seedItem();
    const cartuchoId = newId();
    await db.insert(cartuchos).values({
      id: cartuchoId,
      stockItemId: itemId,
      channel: 'C',
      unit: 'ml',
      levelInitial: 775,
      levelCurrent: 775,
      levelCapacity: 775,
      state: 'NEW',
    });

    await db.delete(stockItems).where(and(eq(stockItems.id, itemId)));

    const rows = await db.select().from(cartuchos).all();
    expect(rows).toHaveLength(0);
  });
});