import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { ensureSchema, resetDb } from '../../helpers/app.js';
import { db } from '../../../src/db/index.js';
import { stockItems, stockTransactions } from '../../../src/db/schema.js';
import type { StockItem } from '../../../src/db/schema.js';
import { newId } from '../../../src/lib/ids.js';
import { deductStockForJob } from '../../../src/agents/hp-latex/stock-deductor.js';
import type { NewJob } from '../../../src/agents/hp-latex/job-detector.js';

/**
 * BR-011 (caracterização — comportamento ANTES do ADR-052).
 *
 * Estes testes fixam o modelo **agregado** por job: `stock_items.currentQuantity`
 * é debitado em `ml` por SKU via `INK_COLOR_MAP`. Depois do ADR-052 o débito por
 * job de tinta deve sumir (o cartucho passa a ser a fonte de verdade), então este
 * arquivo é a linha de base do diff de comportamento.
 *
 * NOME: BR-011_ag (agregado HP por job).
 */

const MACHINE_ID = 'mach-hp-1';

interface EmitCall {
  room: string;
  event: string;
  data: unknown;
}

function makeIo() {
  const calls: EmitCall[] = [];
  return {
    calls,
    io: {
      to: (room: string) => ({
        emit: (event: string, data: unknown) => {
          calls.push({ room, event, data });
        },
      }),
    },
  };
}

function makeJob(overrides: Partial<NewJob> = {}): NewJob {
  return {
    jobId: 'job-1',
    jobName: 'PEDIDO_ABC_2026-01-01',
    mediaType: '',
    mediaAreaM2: 0,
    inkTotalMl: 0,
    inkCyanMl: 0,
    inkLightCyanMl: 0,
    inkMagentaMl: 0,
    inkLightMagentaMl: 0,
    inkYellowMl: 0,
    inkBlackMl: 0,
    inkOptimizerMl: 0,
    printEndDate: '2026-01-01T00:00:00.000Z',
    printMode: 'default',
    resolutionDpi: null,
    passCount: null,
    printDirection: null,
    optimizerEnabled: false,
    inkProfile: null,
    status: 'completed',
    rawData: {} as NewJob['rawData'],
    ...overrides,
  };
}

async function makeInkItem(name: string, quantity: number, minQuantity = 0): Promise<StockItem> {
  const values = {
    id: newId(),
    name,
    category: 'INK_SUPPLY' as const,
    unit: 'ml' as const,
    currentQuantity: quantity,
    minQuantity,
  };
  await db.insert(stockItems).values(values);
  return (await db.select().from(stockItems).where(eq(stockItems.id, values.id)).get())!;
}

async function txsFor(itemId: string) {
  return await db.select().from(stockTransactions).where(eq(stockTransactions.itemId, itemId)).all();
}

async function qtyOf(id: string): Promise<number> {
  const row = await db.select().from(stockItems).where(eq(stockItems.id, id)).get();
  return row!.currentQuantity;
}

describe('BR-011_ag: HP debita tinta no agregado por job (caracterização pré-ADR-052)', () => {
  beforeEach(async () => {
    await ensureSchema();
    await resetDb();
  });

  it('debita o agregado em ml e grava uma linha OUT com o nome do job', async () => {
    const cyan = await makeInkItem('hp_tinta-cyan', 500);

    await deductStockForJob(makeJob({ inkCyanMl: 120 }), MACHINE_ID, makeIo().io);

    expect(await qtyOf(cyan.id)).toBe(380);

    const txs = await txsFor(cyan.id);
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('OUT');
    expect(txs[0].quantity).toBe(120);
    expect(txs[0].reason).toContain('PEDIDO_ABC_2026-01-01');
  });

  it('nao debita o mesmo job duas vezes (idempotencia por reason LIKE %jobName%)', async () => {
    const cyan = await makeInkItem('hp_tinta-cyan', 500);
    const { io } = makeIo();
    const job = makeJob({ inkCyanMl: 120 });

    await deductStockForJob(job, MACHINE_ID, io);
    await deductStockForJob(job, MACHINE_ID, io);

    expect(await qtyOf(cyan.id)).toBe(380);
    expect(await txsFor(cyan.id)).toHaveLength(1);
  });

  it('debita cada canal do seu proprio SKU', async () => {
    const cyan = await makeInkItem('hp_tinta-cyan', 500);
    const black = await makeInkItem('hp_tinta-black', 775);

    await deductStockForJob(makeJob({ inkCyanMl: 10, inkBlackMl: 55 }), MACHINE_ID, makeIo().io);

    expect(await qtyOf(cyan.id)).toBe(490);
    expect(await qtyOf(black.id)).toBe(720);
  });

  it('ignora canal com consumo zero mesmo com item cadastrado', async () => {
    const yellow = await makeInkItem('hp_tinta-yellow', 500);

    await deductStockForJob(makeJob({ inkYellowMl: 0 }), MACHINE_ID, makeIo().io);

    expect(await qtyOf(yellow.id)).toBe(500);
    expect(await txsFor(yellow.id)).toHaveLength(0);
  });

  it('ignora SKU sem item cadastrado sem lancar excecao', async () => {
    const { io } = makeIo();
    // Nenhum item hp_tinta-optimizer existe no banco.
    await expect(
      deductStockForJob(makeJob({ inkOptimizerMl: 33 }), MACHINE_ID, io),
    ).resolves.toBeUndefined();
  });

  it('clampa em zero e nunca grava saldo negativo', async () => {
    const cyan = await makeInkItem('hp_tinta-cyan', 30);

    await deductStockForJob(makeJob({ inkCyanMl: 120 }), MACHINE_ID, makeIo().io);

    expect(await qtyOf(cyan.id)).toBe(0);
    const row = await db.select().from(stockItems).where(eq(stockItems.id, cyan.id)).get();
    expect(row!.status).toBe('OUT_OF_STOCK');
  });

  it('marca LOW_STOCK ao cruzar o minQuantity do item', async () => {
    const cyan = await makeInkItem('hp_tinta-cyan', 500, 450);

    await deductStockForJob(makeJob({ inkCyanMl: 120 }), MACHINE_ID, makeIo().io);

    const row = await db.select().from(stockItems).where(eq(stockItems.id, cyan.id)).get();
    expect(row!.status).toBe('LOW_STOCK');
  });

  it('emite stock:deducted na room estoque com o ml debitado', async () => {
    await makeInkItem('hp_tinta-cyan', 500);
    const { io, calls } = makeIo();

    await deductStockForJob(makeJob({ inkCyanMl: 12 }), MACHINE_ID, io);

    const deducted = calls.filter((c) => c.event === 'stock:deducted');
    expect(deducted).toHaveLength(1);
    expect(deducted[0].room).toBe('estoque');
    expect(deducted[0].data).toMatchObject({
      itemName: 'hp_tinta-cyan',
      quantity: 12,
      unit: 'ml',
      jobName: 'PEDIDO_ABC_2026-01-01',
    });
  });
});