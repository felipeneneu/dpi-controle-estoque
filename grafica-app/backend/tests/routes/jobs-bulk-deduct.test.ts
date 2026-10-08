import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { makeApp, ensureSchema, resetDb } from '../helpers/app.js';
import { db } from '../../src/db/index.js';
import { machines, stockItems, printJobs, bobinas, stockTransactions, users, mimakiJobs } from '../../src/db/schema.js';
import { newId } from '../../src/lib/ids.js';

describe('POST /api/jobs/bulk-deduct (Ação em Massa de Jobs)', () => {
  let app: FastifyInstance;
  let token: string;
  let machineHpId: string;
  let machineKonicaId: string;

  beforeAll(async () => {
    app = await makeApp();
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Op Jobs', email: 'op-jobs@exemplo.com', password: 'senha123' },
    });
    await db.update(users).set({ role: 'OPERATOR' }).where(eq(users.email, 'op-jobs@exemplo.com'));
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'op-jobs@exemplo.com', password: 'senha123' },
    });
    token = res.json().token as string;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await ensureSchema();
    await resetDb();

    machineHpId = newId();
    await db.insert(machines).values({
      id: machineHpId,
      name: 'HP Latex 365',
      brand: 'HP',
      model: 'Latex 365',
      technology: 'Thermal',
    });

    machineKonicaId = newId();
    await db.insert(machines).values({
      id: machineKonicaId,
      name: 'Konica Minolta C3070',
      brand: 'Konica Minolta',
      model: 'AccurioPrint C3070',
      technology: 'Laser',
    });
  });

  it('debita 3 jobs em massa na mesma bobina consolidando a metragem linear', async () => {
    const vinil = {
      id: newId(),
      name: 'Vinil Adesivo Brilho 1.52m',
      category: 'PAPER_MEDIA' as const,
      unit: 'm' as const,
      width: 1.52,
      currentQuantity: 100,
      minQuantity: 10,
    };
    await db.insert(stockItems).values(vinil);

    const bobinaId = newId();
    await db.insert(bobinas).values({
      id: bobinaId,
      stockItemId: vinil.id,
      serial: 'BOB-VINIL-01',
      metersInitial: 100,
      metersRemaining: 100,
      state: 'IN_USE',
      location: `machine:${machineHpId}`,
    });

    // 3 jobs que rodaram no mesmo material
    const j1 = newId();
    const j2 = newId();
    const j3 = newId();

    await db.insert(printJobs).values([
      {
        id: j1,
        jobId: 'HP-JOB-101',
        machineId: machineHpId,
        jobName: 'Banner 10x1',
        mediaType: 'Vinil Adesivo Brilho 1.52m',
        mediaAreaM2: 15.2, // 10 metros
        stockDeducted: false,
      },
      {
        id: j2,
        jobId: 'HP-JOB-102',
        machineId: machineHpId,
        jobName: 'Adesivo Vitrine',
        mediaType: 'Vinil Adesivo Brilho 1.52m',
        mediaAreaM2: 7.6, // 5 metros
        stockDeducted: false,
      },
      {
        id: j3,
        jobId: 'HP-JOB-103',
        machineId: machineHpId,
        jobName: 'Etiquetas Grandes',
        mediaType: 'Vinil Adesivo Brilho 1.52m',
        mediaAreaM2: 3.04, // 2 metros
        stockDeducted: false,
      },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs/bulk-deduct',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        jobIds: [j1, j2, j3],
        stockItemId: vinil.id,
        machineId: machineHpId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.processedCount).toBe(3);
    expect(body.totalDebited).toBe(17); // 10 + 5 + 2 = 17m

    // Bobina debitada: 100 - 17 = 83m
    const bobina = await db.select().from(bobinas).where(eq(bobinas.id, bobinaId)).get();
    expect(bobina?.metersRemaining).toBe(83);

    // Saldo do item atualizado: 100 - 17 = 83m
    const itemAtual = await db.select().from(stockItems).where(eq(stockItems.id, vinil.id)).get();
    expect(itemAtual?.currentQuantity).toBe(83);

    // Todos os 3 jobs marcados como debitados
    const jobsAtuais = await db.select().from(printJobs).all();
    expect(jobsAtuais.every((j) => j.stockDeducted)).toBe(true);
  });

  it('debita múltiplos jobs em massa na Konica somando as folhas', async () => {
    const papel = {
      id: newId(),
      name: 'Couché 250g A3',
      category: 'PAPER_MEDIA' as const,
      unit: 'fls' as const,
      currentQuantity: 500,
      minQuantity: 50,
    };
    await db.insert(stockItems).values(papel);

    const j1 = newId();
    const j2 = newId();

    await db.insert(printJobs).values([
      {
        id: j1,
        jobId: 'KONICA-01',
        machineId: machineKonicaId,
        jobName: 'Cartão de Visita',
        sheets: 120,
        stockDeducted: false,
      },
      {
        id: j2,
        jobId: 'KONICA-02',
        machineId: machineKonicaId,
        jobName: 'Folder Institucional',
        sheets: 80,
        stockDeducted: false,
      },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs/bulk-deduct',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        jobIds: [j1, j2],
        stockItemId: papel.id,
        machineId: machineKonicaId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.processedCount).toBe(2);
    expect(body.totalDebited).toBe(200); // 120 + 80 = 200 folhas

    const itemAtual = await db.select().from(stockItems).where(eq(stockItems.id, papel.id)).get();
    expect(itemAtual?.currentQuantity).toBe(300); // 500 - 200 = 300
  });

  it('rejeita com 400 se todos os jobs já estiverem debitados', async () => {
    const vinil = {
      id: newId(),
      name: 'Vinil Teste',
      category: 'PAPER_MEDIA' as const,
      unit: 'm' as const,
      currentQuantity: 100,
      minQuantity: 10,
    };
    await db.insert(stockItems).values(vinil);

    const j1 = newId();
    await db.insert(printJobs).values({
      id: j1,
      jobId: 'HP-JOB-ALREADY',
      machineId: machineHpId,
      jobName: 'Job Já Debitado',
      stockDeducted: true,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs/bulk-deduct',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        jobIds: [j1],
        stockItemId: vinil.id,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('já tiveram o estoque debitado');
  });

  it('permite debitar em massa jobs que ficaram pendentes (PENDING_BIND) por falta de vínculo com a máquina', async () => {
    const papel = {
      id: newId(),
      name: 'Offset 75g A4',
      category: 'PAPER_MEDIA' as const,
      unit: 'fls' as const,
      currentQuantity: 1000,
      minQuantity: 100,
    };
    await db.insert(stockItems).values(papel);

    // 2 jobs que entraram pelo agente Konica sem correspondência automática (PENDING_BIND)
    const j1 = newId();
    const j2 = newId();
    await db.insert(printJobs).values([
      {
        id: j1,
        jobId: 'KONICA-PEND-1',
        machineId: machineKonicaId,
        jobName: 'Apostila 1',
        mediaType: 'Papel Desconhecido',
        sheets: 150,
        stockDeducted: false,
        materialStatus: 'PENDING_BIND',
      },
      {
        id: j2,
        jobId: 'KONICA-PEND-2',
        machineId: machineKonicaId,
        jobName: 'Apostila 2',
        mediaType: 'Papel Desconhecido',
        sheets: 250,
        stockDeducted: false,
        materialStatus: 'PENDING_BIND',
      },
    ]);

    // O operador seleciona os 2 jobs e debita em massa indicando o Offset 75g A4
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs/bulk-deduct',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        jobIds: [j1, j2],
        stockItemId: papel.id,
        reason: 'Baixa manual pelo operador após rodar no mesmo papel',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().totalDebited).toBe(400); // 150 + 250

    // Verifica saldo
    const atual = await db.select().from(stockItems).where(eq(stockItems.id, papel.id)).get();
    expect(atual?.currentQuantity).toBe(600); // 1000 - 400

    // Verifica status dos jobs
    const job1Atual = await db.select().from(printJobs).where(eq(printJobs.id, j1)).get();
    expect(job1Atual?.stockDeducted).toBe(true);
    expect(job1Atual?.materialStatus).toBe('DEDUCTED');
  });

  it('debita múltiplos jobs da Mimaki em massa no mesmo rolo', async () => {
    const vinil = {
      id: newId(),
      name: 'Vinil Mimaki 75cm',
      category: 'PAPER_MEDIA' as const,
      unit: 'm' as const,
      width: 0.75,
      currentQuantity: 50,
      minQuantity: 5,
    };
    await db.insert(stockItems).values(vinil);

    const bobinaId = newId();
    await db.insert(bobinas).values({
      id: bobinaId,
      stockItemId: vinil.id,
      serial: 'BOB-MIM-01',
      metersInitial: 50,
      metersRemaining: 50,
      state: 'IN_USE',
    });

    const mj1 = newId();
    const mj2 = newId();
    await db.insert(mimakiJobs).values([
      {
        id: mj1,
        machineId: machineHpId,
        folderTimestamp: '2026-10-08_12-00-00',
        jobName: 'Rotulo A',
        widthMm: 750,
        heightMm: 1000,
        lengthMeters: 3.5,
        materialStatus: 'PENDING_BIND',
        stockDeducted: false,
      },
      {
        id: mj2,
        machineId: machineHpId,
        folderTimestamp: '2026-10-08_12-01-00',
        jobName: 'Rotulo B',
        widthMm: 750,
        heightMm: 1000,
        lengthMeters: 2.5,
        materialStatus: 'PENDING_BIND',
        stockDeducted: false,
      },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs/bulk-deduct',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        jobIds: [mj1, mj2],
        stockItemId: vinil.id,
        bobinaId,
        reason: 'Baixa em lote de jobs Mimaki',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().totalDebited).toBe(6.0); // 3.5 + 2.5
    expect(res.json().processedCount).toBe(2);

    const bobinaDb = await db.select().from(bobinas).where(eq(bobinas.id, bobinaId)).get();
    expect(bobinaDb?.metersRemaining).toBe(44.0); // 50 - 6

    const job1 = await db.select().from(mimakiJobs).where(eq(mimakiJobs.id, mj1)).get();
    expect(job1?.stockDeducted).toBe(true);
    expect(job1?.materialStatus).toBe('BOUND');
    expect(job1?.stockItemId).toBe(vinil.id);
  });
});

