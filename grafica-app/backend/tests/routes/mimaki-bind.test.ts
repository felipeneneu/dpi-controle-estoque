import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { makeApp, ensureSchema, resetDb } from '../helpers/app.js';
import { db } from '../../src/db/index.js';
import { bobinas, machines, mimakiJobs, stockItems, stockTransactions } from '../../src/db/schema.js';
import { newId } from '../../src/lib/ids.js';

/**
 * Bind de job Mimaki ja impresso: a bobina escolhida tem de ser debitada.
 *
 * O bug que estes testes travaram: `bobina_id` era opcional de ponta a ponta
 * (UI, mutation e rota). Sem bobina nao havia substrato para baixar, a funcao de
 * debito marcava `stockDeducted = true` assim mesmo, e a trava de idempotencia
 * passava a devolver "ja debitado" para sempre. O operador escolhia a bobina
 * certa e o estoque nao mexia - nem voltaria a mexer. Pior: o job aparecia
 * vinculado (`BOUND`) com o estoque intacto, e o dado sumia em silencio.
 *
 * Invariantes:
 * - sem `bobina_id`, a rota recusa (400) e o job continua `PENDING_BIND`;
 * - com bobina valida, a metragem e descontada da bobina escolhida;
 * - falha de substrato nao marca `stockDeducted` (falha e retry, nao sumico);
 * - `stockDeducted = true` sem transacao alguma e linha envenenada pelo bug
 *   antigo: o bind corrige o dado em vez de recusar para sempre;
 * - `stockDeducted = true` com tinta mas sem substrato e debito parcial: nao se
 *   repete, porque repetir duplicaria a tinta.
 */

const M2 = { PAINEL: 'M2' } as const;

describe('mimaki bind-material', () => {
  let app: FastifyInstance;
  let token: string;
  let machineId: string;
  let itemId: string;
  let itemOutrosId: string;
  let bobinaId: string;

  beforeAll(async () => {
    app = await makeApp();
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Op Mimaki', email: 'mimaki@exemplo.com', password: 'senha123' },
    });
    const { users } = await import('../../src/db/schema.js');
    await db.update(users).set({ role: 'ADMIN' }).where(eq(users.email, 'mimaki@exemplo.com'));
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'mimaki@exemplo.com', password: 'senha123' },
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

    itemId = await seedMedia('BOPP Prata 0,75m', 100);
    itemOutrosId = await seedMedia('Lona 1,60m', 100);
    bobinaId = await seedBobina(itemId, 'BOB-1001', 100);
  });

  async function seedMedia(name: string, meters: number) {
    const id = newId();
    await db.insert(stockItems).values({
      id,
      name,
      category: 'PAPER_MEDIA',
      unit: 'm',
      currentQuantity: meters,
      minQuantity: 10,
    });
    return id;
  }

  async function seedBobina(stockItemId: string, serial: string, meters: number | null) {
    const id = newId();
    await db.insert(bobinas).values({
      id,
      stockItemId,
      serial,
      widthMm: 750,
      metersInitial: meters,
      metersRemaining: meters,
      state: 'NEW',
      location: 'deposito',
    });
    return id;
  }

  let jobSeq = 0;
  async function seedJob(over: Partial<typeof mimakiJobs.$inferInsert> = {}) {
    const id = newId();
    // `folder_timestamp` tem UNIQUE: dois jobs semeados no mesmo ms colidem.
    const stamp = new Date(Date.UTC(2026, 0, 1, 0, 0, jobSeq++)).toISOString();
    await db.insert(mimakiJobs).values({
      id,
      machineId,
      folderTimestamp: stamp,
      jobName: `job_${jobSeq}`,
      quantityUnits: 1,
      pages: 1,
      widthMm: 750,
      heightMm: 1000,
      lengthMeters: 5,
      materialStatus: 'PENDING_BIND',
      ...over,
    });
    return id;
  }

  function bind(jobId: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: `/api/integrations/mimaki/jobs/${jobId}/bind-material`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  const bobinaDe = (id: string) =>
    db.select().from(bobinas).where(eq(bobinas.id, id)).get();
  const jobDe = (id: string) => db.select().from(mimakiJobs).where(eq(mimakiJobs.id, id)).get();

  it('debita da bobina escolhida e vincula o job', async () => {
    const jobId = await seedJob();

    const res = await bind(jobId, { stock_item_id: itemId, bobina_id: bobinaId });

    expect(res.statusCode).toBe(200);
    expect(res.json().deductedSubstrate).toBe(true);

    // 100m - 5m impressos
    expect((await bobinaDe(bobinaId))!.metersRemaining).toBeCloseTo(95, 3);

    const job = await jobDe(jobId);
    expect(job!.materialStatus).toBe('BOUND');
    expect(job!.stockItemId).toBe(itemId);
    expect(job!.stockDeducted).toBe(true);
  });

  it('recusa body sem bobina_id e nao mexe no estoque', async () => {
    const jobId = await seedJob();

    const res = await bind(jobId, { stock_item_id: itemId });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/bobina/i);

    expect((await bobinaDe(bobinaId))!.metersRemaining).toBeCloseTo(100, 3);
    const job = await jobDe(jobId);
    expect(job!.materialStatus).toBe('PENDING_BIND');
    // A essence: um bind recusado nao pode "marcar como debitado" e travar o retry.
    expect(job!.stockDeducted).toBe(false);
  });

  it('recusa bobina de outro material', async () => {
    const jobId = await seedJob();
    const bobinaErrada = await seedBobina(itemOutrosId, 'BOB-2002', 100);

    const res = await bind(jobId, { stock_item_id: itemId, bobina_id: bobinaErrada });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/BOB-2002/);
    expect((await bobinaDe(bobinaErrada))!.metersRemaining).toBeCloseTo(100, 3);
  });

  it('recusa bobina esgotada', async () => {
    const jobId = await seedJob();
    await db.update(bobinas).set({ state: 'USED' }).where(eq(bobinas.id, bobinaId));

    const res = await bind(jobId, { stock_item_id: itemId, bobina_id: bobinaId });

    expect(res.statusCode).toBe(400);
    expect((await jobDe(jobId))!.materialStatus).toBe('PENDING_BIND');
  });

  it('recusa bobina sem metragem, sem marcar estoque como debitado', async () => {
    const jobId = await seedJob();
    const semMetragem = await seedBobina(itemId, 'BOB-3003', null);

    const res = await bind(jobId, { stock_item_id: itemId, bobina_id: semMetragem });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/metragem/i);

    // O ponto central: falha de substrato nao pode gravar `stockDeducted`, senao
    // o job fica preso sem metragem baixada para sempre.
    expect((await jobDe(jobId))!.stockDeducted).toBe(false);
  });

  it('repete o bind sem debitar duas vezes', async () => {
    const jobId = await seedJob();

    const primeiro = await bind(jobId, { stock_item_id: itemId, bobina_id: bobinaId });
    expect(primeiro.statusCode).toBe(200);

    const segundo = await bind(jobId, { stock_item_id: itemId, bobina_id: bobinaId });
    expect(segundo.statusCode).toBe(200);
    expect(segundo.json().alreadyDeducted).toBe(true);

    expect((await bobinaDe(bobinaId))!.metersRemaining).toBeCloseTo(95, 3);
    const txs = await db.select().from(stockTransactions).all();
    expect(txs.filter((t) => (t.reason ?? '').includes('[Bobina'))).toHaveLength(1);
  });

  it('corrige job marcado como debitado sem transacao (dado envenenado pelo bug antigo)', async () => {
    const jobId = await seedJob({ stockDeducted: true, materialStatus: 'BOUND' });

    const res = await bind(jobId, { stock_item_id: itemId, bobina_id: bobinaId });

    expect(res.statusCode).toBe(200);
    expect(res.json().deductedSubstrate).toBe(true);
    expect((await bobinaDe(bobinaId))!.metersRemaining).toBeCloseTo(95, 3);
  });

  it('nao refaz debito parcial: com tinta baixada e sem substrato, exige conciliacao', async () => {
    const jobId = await seedJob({ stockDeducted: true, materialStatus: 'BOUND' });
    // Só tinta: exatamente o que o bug antigo deixava para trás.
    await db.insert(stockTransactions).values({
      id: newId(),
      itemId,
      type: 'OUT',
      quantity: 12,
      reason: `Mimaki tinta UV Cyan: ${(await jobDe(jobId))!.jobName}`,
      userName: 'Mimaki Agent',
    });

    const res = await bind(jobId, { stock_item_id: itemId, bobina_id: bobinaId });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/duplicaria a tinta/i);
    expect((await bobinaDe(bobinaId))!.metersRemaining).toBeCloseTo(100, 3);
  });

  it('debita mais de um job da mesma bobina, encadeando o saldo', async () => {
    const primeiro = await seedJob({ lengthMeters: 10 });
    const segundo = await seedJob({ lengthMeters: 30 });

    expect((await bind(primeiro, { stock_item_id: itemId, bobina_id: bobinaId })).statusCode).toBe(200);
    expect((await bind(segundo, { stock_item_id: itemId, bobina_id: bobinaId })).statusCode).toBe(200);

    expect((await bobinaDe(bobinaId))!.metersRemaining).toBeCloseTo(60, 3);
  });

  it('esgota a bobina e a marca USED quando o consumo zera o saldo', async () => {
    const curta = await seedBobina(itemId, 'BOB-4004', 4);
    const jobId = await seedJob({ lengthMeters: 5 });

    const res = await bind(jobId, { stock_item_id: itemId, bobina_id: curta });

    expect(res.statusCode).toBe(200);
    const b = await bobinaDe(curta);
    expect(b!.metersRemaining).toBe(0);
    expect(b!.state).toBe('USED');
  });

  it('permite vincular material em folha (unit: fls) sem bobina_id e debita diretamente do estoque', async () => {
    const folhaItemId = newId();
    await db.insert(stockItems).values({
      id: folhaItemId,
      name: 'Adesivo Couché 33x48',
      category: 'PAPER_MEDIA',
      unit: 'fls',
      currentQuantity: 26,
      minQuantity: 5,
    });

    const jobId = await seedJob({
      jobName: 'Dona Tunica - Adesivo Folha',
      totalPrint: 4,
    });

    const res = await bind(jobId, { stock_item_id: folhaItemId });

    expect(res.statusCode).toBe(200);
    expect(res.json().deductedSubstrate).toBe(true);

    const item = await db.select().from(stockItems).where(eq(stockItems.id, folhaItemId)).get();
    expect(item!.currentQuantity).toBe(22); // 26 - 4 folhas

    const job = await jobDe(jobId);
    expect(job!.materialStatus).toBe('BOUND');
    expect(job!.stockItemId).toBe(folhaItemId);
    expect(job!.stockDeducted).toBe(true);
  });

  it('exige autenticacao', async () => {
    const jobId = await seedJob();
    const res = await app.inject({
      method: 'POST',
      url: `/api/integrations/mimaki/jobs/${jobId}/bind-material`,
      payload: { stock_item_id: itemId, bobina_id: bobinaId },
    });
    expect(res.statusCode).toBe(401);
  });
});