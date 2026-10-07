import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { makeApp, ensureSchema, resetDb } from '../helpers/app.js';
import { db } from '../../src/db/index.js';
import { bobinas, garrafas, machines, mimakiJobs, stockItems, stockTransactions, inkConsumptionLog } from '../../src/db/schema.js';
import { newId } from '../../src/lib/ids.js';
import { deductMimakiStockForJob } from '../../src/routes/mimaki.js';

/**
 * BR-012 (Emendada pela ADR-057):
 * O consumo de tinta UV Mimaki foi DESACOPLADO da contagem contábil de estoque.
 * O agente Mimaki grava o consumo em `ink_consumption_log` para relatórios analíticos,
 * sem alterar `stock_items` ou `garrafas`, e sem gerar `stock_transactions` para tintas.
 * A dedução de substrato (bobina) permanece ativa e inalterada.
 */

describe('BR-012 (Emendada ADR-057): Mimaki desacopla débito de tinta para ink_consumption_log', () => {
  let app: FastifyInstance;
  let machineId: string;
  let mediaItemId: string;
  let inkItemId: string;
  let bobinaId: string;
  let garrafaId: string;

  beforeAll(async () => {
    app = await makeApp();
    await app.ready();
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

    mediaItemId = newId();
    await db.insert(stockItems).values({
      id: mediaItemId,
      name: 'Vinil Adesivo 1,06m',
      category: 'PAPER_MEDIA',
      unit: 'm',
      currentQuantity: 100,
      minQuantity: 10,
    });

    inkItemId = newId();
    await db.insert(stockItems).values({
      id: inkItemId,
      name: 'Tinta UV LH-100 Cyan',
      category: 'INK_SUPPLY',
      unit: 'ml',
      currentQuantity: 1000,
      minQuantity: 100,
    });

    bobinaId = newId();
    await db.insert(bobinas).values({
      id: bobinaId,
      stockItemId: mediaItemId,
      serial: 'BOB-MIMAKI-01',
      widthMm: 1060,
      metersInitial: 100,
      metersRemaining: 100,
      state: 'IN_USE',
      location: `machine:${machineId}`,
    });

    garrafaId = newId();
    await db.insert(garrafas).values({
      id: garrafaId,
      stockItemId: inkItemId,
      serial: 'GAR-UV-C01',
      mlInitial: 1000,
      mlRemaining: 1000,
      state: 'IN_USE',
      location: `machine:${machineId}`,
    });
  });

  it('registra consumo em ink_consumption_log sem debitar garrafa nem stock_items de tinta', async () => {
    const jobId = newId();
    await db.insert(mimakiJobs).values({
      id: jobId,
      machineId,
      folderTimestamp: '2026-10-07T12:00:00.000Z',
      jobName: 'MIMAKI_UV_JOB_01',
      quantityUnits: 1,
      pages: 1,
      widthMm: 1000,
      heightMm: 1000,
      lengthMeters: 4,
      stockItemId: mediaItemId,
      bobinaId,
      materialStatus: 'BOUND',
    });

    const result = await deductMimakiStockForJob(app, {
      id: jobId,
      jobName: 'MIMAKI_UV_JOB_01',
      lengthMeters: 4,
      stockItemId: mediaItemId,
      bobinaId,
      machineId,
      inkCyanCc: 12.5,
      inkMagentaCc: 8.2,
    });

    expect(result.deductedSubstrate).toBe(true);
    expect(result.deductedInksCount).toBe(2);

    // 1. Bobina de substrato foi debitada (100 - 4 = 96m)
    const b = await db.select().from(bobinas).where(eq(bobinas.id, bobinaId)).get();
    expect(b!.metersRemaining).toBeCloseTo(96, 3);

    // 2. Garrafa de tinta NÃO foi debitada (continua 1000ml)
    const g = await db.select().from(garrafas).where(eq(garrafas.id, garrafaId)).get();
    expect(g!.mlRemaining).toBe(1000);

    // 3. Item de estoque de tinta NÃO foi alterado
    const item = await db.select().from(stockItems).where(eq(stockItems.id, inkItemId)).get();
    expect(item!.currentQuantity).toBe(1000);

    // 4. Nenhuma transação contábil para tinta, apenas 1 para substrato
    const txs = await db.select().from(stockTransactions).all();
    expect(txs).toHaveLength(1);
    expect(txs[0].itemId).toBe(mediaItemId);
    expect(txs[0].reason).toContain('Mimaki consumo mídia');

    // 5. Registros analíticos em ink_consumption_log
    const logs = await db.select().from(inkConsumptionLog).where(eq(inkConsumptionLog.jobId, jobId)).all();
    expect(logs).toHaveLength(2);

    const cyanLog = logs.find((l) => l.channel === 'Cyan');
    expect(cyanLog).toBeDefined();
    expect(cyanLog!.mlConsumed).toBeCloseTo(12.5, 4);
    expect(cyanLog!.machineId).toBe(machineId);

    const magentaLog = logs.find((l) => l.channel === 'Magenta');
    expect(magentaLog).toBeDefined();
    expect(magentaLog!.mlConsumed).toBeCloseTo(8.2, 4);
  });

  it('idempotência: não duplica consumo no ink_consumption_log em chamadas repetidas', async () => {
    const jobId = newId();
    await db.insert(mimakiJobs).values({
      id: jobId,
      machineId,
      folderTimestamp: '2026-10-07T13:00:00.000Z',
      jobName: 'MIMAKI_UV_JOB_02',
      quantityUnits: 1,
      pages: 1,
      widthMm: 1000,
      heightMm: 1000,
      lengthMeters: 2,
      stockItemId: mediaItemId,
      bobinaId,
      materialStatus: 'BOUND',
    });

    const jobData = {
      id: jobId,
      jobName: 'MIMAKI_UV_JOB_02',
      lengthMeters: 2,
      stockItemId: mediaItemId,
      bobinaId,
      machineId,
      inkCyanCc: 15,
    };

    await deductMimakiStockForJob(app, jobData);
    await deductMimakiStockForJob(app, jobData);

    const logs = await db.select().from(inkConsumptionLog).where(eq(inkConsumptionLog.jobId, jobId)).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].mlConsumed).toBe(15);
  });
});
