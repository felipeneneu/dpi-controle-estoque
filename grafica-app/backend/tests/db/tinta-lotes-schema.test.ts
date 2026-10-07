import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { ensureSchema, resetDb } from '../helpers/app.js';
import { db } from '../../src/db/index.js';
import { tintaLotes, inkConsumptionLog, stockItems, machines } from '../../src/db/schema.js';
import { newId } from '../../src/lib/ids.js';

async function tableNames(): Promise<string[]> {
  const rows = await db.all(sql`SELECT name FROM sqlite_master WHERE type = 'table'`);
  return rows.map((r) => (r as { name: string }).name);
}

async function seedItem(name = 'hp_tinta-cyan') {
  const id = newId();
  await db.insert(stockItems).values({
    id,
    name,
    category: 'INK_SUPPLY',
    unit: 'un',
    currentQuantity: 5,
    minQuantity: 2,
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

describe('migration 0014: tinta_lotes e ink_consumption_log (ADR-057)', () => {
  beforeEach(async () => {
    await ensureSchema();
    await resetDb();
  });

  it('cria as tabelas tinta_lotes e ink_consumption_log', async () => {
    const tables = await tableNames();
    expect(tables).toContain('tinta_lotes');
    expect(tables).toContain('ink_consumption_log');
  });

  it('permite cadastrar múltiplos lotes em NEW no mesmo SKU', async () => {
    const itemId = await seedItem();
    await db.insert(tintaLotes).values({
      id: newId(),
      stockItemId: itemId,
      serial: 'LOTE-C-01',
      state: 'NEW',
      location: 'deposito',
    });
    await db.insert(tintaLotes).values({
      id: newId(),
      stockItemId: itemId,
      serial: 'LOTE-C-02',
      state: 'NEW',
      location: 'deposito',
    });

    const rows = await db.select().from(tintaLotes).all();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.state === 'NEW')).toBe(true);
  });

  it('impede dois lotes em IN_USE no mesmo canal da mesma máquina', async () => {
    const itemId = await seedItem();
    const machineId = await seedMachine();

    await db.insert(tintaLotes).values({
      id: newId(),
      stockItemId: itemId,
      serial: 'LOTE-C-01',
      state: 'IN_USE',
      machineId,
      channel: 'Cyan',
    });

    await expect(
      db.insert(tintaLotes).values({
        id: newId(),
        stockItemId: itemId,
        serial: 'LOTE-C-02',
        state: 'IN_USE',
        machineId,
        channel: 'Cyan',
      }),
    ).rejects.toThrow();
  });

  it('permite registrar e consultar logs em ink_consumption_log', async () => {
    const machineId = await seedMachine();
    const logId = newId();

    await db.insert(inkConsumptionLog).values({
      id: logId,
      jobId: 'JOB-999',
      machineId,
      channel: 'Cyan',
      mlConsumed: 12.5,
    });

    const logs = await db.select().from(inkConsumptionLog).all();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.channel).toBe('Cyan');
    expect(logs[0]!.mlConsumed).toBe(12.5);
  });
});
