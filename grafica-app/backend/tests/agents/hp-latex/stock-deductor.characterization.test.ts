import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { ensureSchema, resetDb } from '../../helpers/app.js';
import { db } from '../../../src/db/index.js';
import { stockItems, stockTransactions, inkConsumptionLog, bobinas, printJobs, machines } from '../../../src/db/schema.js';
import type { StockItem } from '../../../src/db/schema.js';
import { newId } from '../../../src/lib/ids.js';
import { deductStockForJob } from '../../../src/agents/hp-latex/stock-deductor.js';
import type { NewJob } from '../../../src/agents/hp-latex/job-detector.js';

/**
 * BR-011 (Emendada pela ADR-057):
 * O consumo de tinta por job foi DESACOPLADO da contagem de estoque.
 * O agente HP Latex registra o consumo analítico exclusivamente em `ink_consumption_log`.
 * NÃO debita `stock_items.currentQuantity` nem cria `stock_transactions` para tintas.
 * A dedução de mídia (metros de bobina) permanece ativa e inalterada.
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

async function logsFor(channel: string) {
  return await db.select().from(inkConsumptionLog).where(eq(inkConsumptionLog.channel, channel)).all();
}

describe('BR-011 (Emendada ADR-057): HP desacopla débito de tinta para ink_consumption_log', () => {
  beforeEach(async () => {
    await ensureSchema();
    await resetDb();

    await db.insert(machines).values({
      id: MACHINE_ID,
      name: 'HP Latex 365',
      brand: 'HP',
      model: 'Latex 365',
      technology: 'Latex',
    });
  });

  it('registra o consumo em ml em ink_consumption_log e NÃO altera stock_items nem gera stock_transactions para tinta', async () => {
    const cyan = await makeInkItem('hp_tinta-cyan', 500);

    await deductStockForJob(makeJob({ inkCyanMl: 120 }), MACHINE_ID, makeIo().io);

    // Saldo contábil da tinta permanece intocado
    expect(await qtyOf(cyan.id)).toBe(500);

    // Nenhuma transação contábil para tinta
    const txs = await txsFor(cyan.id);
    expect(txs).toHaveLength(0);

    // Registro criado na tabela analítica de consumo
    const logs = await logsFor('hp_tinta-cyan');
    expect(logs).toHaveLength(1);
    expect(logs[0].machineId).toBe(MACHINE_ID);
    expect(logs[0].mlConsumed).toBe(120);
    expect(logs[0].jobId).toBe('job-1');
  });

  it('não duplica registro em ink_consumption_log para o mesmo job (idempotência)', async () => {
    const cyan = await makeInkItem('hp_tinta-cyan', 500);
    const { io } = makeIo();
    const job = makeJob({ inkCyanMl: 120 });

    await deductStockForJob(job, MACHINE_ID, io);
    await deductStockForJob(job, MACHINE_ID, io);

    expect(await qtyOf(cyan.id)).toBe(500);
    expect(await txsFor(cyan.id)).toHaveLength(0);

    const logs = await logsFor('hp_tinta-cyan');
    expect(logs).toHaveLength(1);
  });

  it('registra múltiplos canais no mesmo job em ink_consumption_log', async () => {
    const cyan = await makeInkItem('hp_tinta-cyan', 500);
    const black = await makeInkItem('hp_tinta-black', 775);

    await deductStockForJob(makeJob({ inkCyanMl: 10, inkBlackMl: 55 }), MACHINE_ID, makeIo().io);

    // Saldos intactos
    expect(await qtyOf(cyan.id)).toBe(500);
    expect(await qtyOf(black.id)).toBe(775);

    const cyanLogs = await logsFor('hp_tinta-cyan');
    expect(cyanLogs).toHaveLength(1);
    expect(cyanLogs[0].mlConsumed).toBe(10);

    const blackLogs = await logsFor('hp_tinta-black');
    expect(blackLogs).toHaveLength(1);
    expect(blackLogs[0].mlConsumed).toBe(55);
  });

  it('ignora canal com consumo zero sem criar registro em ink_consumption_log', async () => {
    await makeInkItem('hp_tinta-yellow', 500);

    await deductStockForJob(makeJob({ inkYellowMl: 0 }), MACHINE_ID, makeIo().io);

    const logs = await logsFor('hp_tinta-yellow');
    expect(logs).toHaveLength(0);
  });

  it('registra consumo em ink_consumption_log mesmo que o SKU não esteja no stock_items', async () => {
    const { io } = makeIo();
    // Nenhum item hp_tinta-optimizer existe em stock_items
    await deductStockForJob(makeJob({ inkOptimizerMl: 33 }), MACHINE_ID, io);

    const logs = await logsFor('hp_tinta-optimizer');
    expect(logs).toHaveLength(1);
    expect(logs[0].mlConsumed).toBe(33);
  });

  it('dedução de mídia linear de bobina continua ativa e inalterada', async () => {
    const mediaItem = {
      id: newId(),
      name: 'Vinil Brilho 1,52m',
      category: 'PAPER_MEDIA' as const,
      unit: 'm' as const,
      currentQuantity: 100,
      minQuantity: 10,
      width: 1.52,
    };
    await db.insert(stockItems).values(mediaItem);

    const bobinaId = newId();
    await db.insert(bobinas).values({
      id: bobinaId,
      stockItemId: mediaItem.id,
      serial: 'BOB-HP-01',
      widthMm: 1520,
      metersInitial: 100,
      metersRemaining: 100,
      state: 'IN_USE',
      location: `machine:${MACHINE_ID}`,
    });

    const job = makeJob({
      jobId: 'job-midia-hp',
      jobName: 'JOB_BANNER_1',
      mediaType: 'Vinil Brilho 1,52m',
      mediaAreaM2: 15.2, // 15.2 m² / 1.52m = 10m lineares
      inkCyanMl: 25,
    });

    await db.insert(printJobs).values({
      id: newId(),
      machineId: MACHINE_ID,
      jobId: job.jobId,
      jobName: job.jobName,
      status: 'completed',
    });

    const { io, calls } = makeIo();
    await deductStockForJob(job, MACHINE_ID, io);

    // Tinta registrada no log analítico
    const inkLogs = await logsFor('hp_tinta-cyan');
    expect(inkLogs).toHaveLength(1);
    expect(inkLogs[0].mlConsumed).toBe(25);

    // Mídia debitada da bobina (100 - 10 = 90m)
    const bobinaAtual = await db.select().from(bobinas).where(eq(bobinas.id, bobinaId)).get();
    expect(bobinaAtual!.metersRemaining).toBeCloseTo(90, 2);

    // Transação de estoque gravada para a mídia
    const mediaTxs = await txsFor(mediaItem.id);
    expect(mediaTxs).toHaveLength(1);
    expect(mediaTxs[0].type).toBe('OUT');
    expect(mediaTxs[0].quantity).toBe(10);
    expect(mediaTxs[0].reason).toContain('[Bobina BOB-HP-01]');

    // Evento stock:deducted emitido apenas para a mídia
    const deductedEvents = calls.filter((c) => c.event === 'stock:deducted');
    expect(deductedEvents).toHaveLength(1);
    expect(deductedEvents[0].data).toMatchObject({
      itemName: 'Vinil Brilho 1,52m',
      quantity: 10,
    });
  });
});