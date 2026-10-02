import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { ensureSchema, resetDb } from '../../helpers/app.js';
import { db } from '../../../src/db/index.js';
import { stockItems, stockTransactions } from '../../../src/db/schema.js';
import type { StockItem } from '../../../src/db/schema.js';
import { newId } from '../../../src/lib/ids.js';
import { deductStockForJob, findPaperItem, normalizeMediaName } from '../../../src/agents/konica/stock-deductor.js';
import type { NewKonicaJob } from '../../../src/agents/konica/job-detector.js';

/**
 * BR-013 (caracterização — comportamento ANTES do ADR-052).
 *
 * Fixa dois fatos do modelo atual:
 * 1. Papel é debitado em folha com fator de conversão por unidade (`floor` quando fator > 1).
 * 2. **Toner não é debitado por job** (`TONER_EXPOSED = false`) — o item de toner
 *    existe no estoque mas o saldo não é tocado, mesmo com `tonerByColor` no job.
 *
 * O ponto 2 é o que o ADR-052 mantém (BR-013 continua IMPLEMENTED): o que muda é que
 * passa a existir ativo e aviso de reposição, não débito por job.
 *
 * NOME: BR-013_ag (toner não debitado por job).
 */

function makeIo() {
  const calls: { room: string; event: string; data: unknown }[] = [];
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

function makeJob(overrides: Partial<NewKonicaJob> = {}): NewKonicaJob {
  return {
    jobId: 'job-k-1',
    jobName: 'KONICA_PEDIDO_1',
    paperName: '',
    mediaLabel: '',
    osNumber: null,
    gram: null,
    pages: 0,
    sheets: 0,
    pagesPrinted: 0,
    copies: 1,
    colorMode: 'color',
    status: 'completed',
    printEndDate: '2026-01-01T00:00:00.000Z',
    rawData: {},
    ...overrides,
  };
}

async function makeItem(values: {
  name: string;
  unit: string;
  qty: number;
  min?: number;
  category?: 'PAPER_MEDIA' | 'INK_SUPPLY' | 'OTHER';
}): Promise<StockItem> {
  const row = {
    id: newId(),
    name: values.name,
    category: values.category ?? 'PAPER_MEDIA',
    unit: values.unit,
    currentQuantity: values.qty,
    minQuantity: values.min ?? 0,
  };
  await db.insert(stockItems).values(row);
  return (await db.select().from(stockItems).where(eq(stockItems.id, row.id)).get())!;
}

async function txsFor(itemId: string) {
  return await db.select().from(stockTransactions).where(eq(stockTransactions.itemId, itemId)).all();
}

async function qtyOf(id: string): Promise<number> {
  const row = await db.select().from(stockItems).where(eq(stockItems.id, id)).get();
  return row!.currentQuantity;
}

describe('BR-013_ag: Konica debita papel e NÃO debita toner por job (caracterização pré-ADR-052)', () => {
  beforeEach(async () => {
    await ensureSchema();
    await resetDb();
  });

  it('debita papel em fls com fator 1 (sem divisao)', async () => {
    const paper = await makeItem({ name: 'Couché A4 250g', unit: 'fls', qty: 1000 });

    await deductStockForJob(makeJob({ paperName: 'couche a4', gram: 250, sheets: 120 }), makeIo().io);

    expect(await qtyOf(paper.id)).toBe(880);
    const txs = await txsFor(paper.id);
    expect(txs).toHaveLength(1);
    expect(txs[0].quantity).toBe(120);
  });

  it('converte unidade rms com floor (1200 folhas / 500 = 2 resmas)', async () => {
    const paper = await makeItem({ name: 'Couché A4 250g', unit: 'rms', qty: 10 });

    await deductStockForJob(makeJob({ paperName: 'couche a4', gram: 250, sheets: 1200 }), makeIo().io);

    expect(await qtyOf(paper.id)).toBe(8);
    expect((await txsFor(paper.id))[0].quantity).toBe(2);
  });

  it('converte unidade pk com floor (120 folhas / 50 = 2 pacotes)', async () => {
    const paper = await makeItem({ name: 'Couché A4 250g', unit: 'pk', qty: 10 });

    await deductStockForJob(makeJob({ paperName: 'couche a4', gram: 250, sheets: 120 }), makeIo().io);

    expect(await qtyOf(paper.id)).toBe(8);
  });

  it('NÃO debita toner mesmo com tonerByColor no job (TONER_EXPOSED = false)', async () => {
    const tonerCyan = await makeItem({
      name: 'konica_toner-cyan',
      unit: 'pct',
      qty: 100,
      category: 'INK_SUPPLY',
    });

    await deductStockForJob(
      makeJob({
        paperName: 'couche a4',
        gram: 250,
        sheets: 10,
        tonerByColor: { cyan: 5, magenta: 5, yellow: 5, black: 5 },
      }),
      makeIo().io,
    );

    // Saldo do toner intocado: o sistema não inventa consumo que a telemetria não mediu.
    expect(await qtyOf(tonerCyan.id)).toBe(100);
    expect(await txsFor(tonerCyan.id)).toHaveLength(0);
  });

  it('papel não encontrado no estoque: não debita nada e não lança exceção', async () => {
    const { io, calls } = makeIo();

    await expect(
      deductStockForJob(makeJob({ paperName: 'jousstick a3', gram: 300, sheets: 50 }), io),
    ).resolves.toBeUndefined();

    const all = await db.select().from(stockTransactions).all();
    expect(all).toHaveLength(0);
    expect(calls.some((c) => c.event === 'stock:deducted')).toBe(false);
  });

  it('job sem folhas não gera débito', async () => {
    const paper = await makeItem({ name: 'Couché A4 250g', unit: 'fls', qty: 1000 });

    await deductStockForJob(makeJob({ paperName: 'couche a4', gram: 250, sheets: 0 }), makeIo().io);

    expect(await qtyOf(paper.id)).toBe(1000);
    expect(await txsFor(paper.id)).toHaveLength(0);
  });

  it('marca LOW_STOCK ao cruzar o minQuantity do papel', async () => {
    const paper = await makeItem({ name: 'Couché A4 250g', unit: 'fls', qty: 130, min: 120 });

    await deductStockForJob(makeJob({ paperName: 'couche a4', gram: 250, sheets: 20 }), makeIo().io);

    const row = await db.select().from(stockItems).where(eq(stockItems.id, paper.id)).get();
    expect(row!.status).toBe('LOW_STOCK');
  });
});

describe('findPaperItem: casamento por token + prioridade de gramatura', () => {
  const base = [
    { name: 'Couché A4 250g' },
    { name: 'Couché A4 90g' },
    { name: 'Offset A4 250g' },
  ] as unknown as StockItem[];

  it('normaliza acentos e separadores', () => {
    expect(normalizeMediaName('Couché A4 250g')).toBe('couchea4250g');
  });

  it('prefere o item cuja gramatura bate com o job', () => {
    const found = findPaperItem(base, 'couche a4', 90);
    expect(found!.name).toBe('Couché A4 90g');
  });

  it('exige que o item contenha todos os tokens do job', () => {
    const found = findPaperItem(base, 'couche a3', 250);
    expect(found).toBeNull();
  });

  it('sem gramatura, cai no nome mais específico', () => {
    const found = findPaperItem(base, 'couche a4', null);
    expect(found).not.toBeNull();
    expect(['Couché A4 250g', 'Couché A4 90g']).toContain(found!.name);
  });
});