import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { makeApp, ensureSchema, resetDb } from '../helpers/app.js';
import { db } from '../../src/db/index.js';
import { machines, printJobs, mimakiJobs, mimakiTestJobs, users } from '../../src/db/schema.js';
import { newId } from '../../src/lib/ids.js';

describe('Exclusão de Jobs (DELETE /api/jobs/:id e POST /api/jobs/bulk-delete)', () => {
  let app: FastifyInstance;
  let token: string;
  let machineHpId: string;
  let machineMimakiId: string;

  beforeAll(async () => {
    app = await makeApp();
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Op Delete', email: 'op-delete@exemplo.com', password: 'senha123' },
    });
    await db.update(users).set({ role: 'OPERATOR' }).where(eq(users.email, 'op-delete@exemplo.com'));
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'op-delete@exemplo.com', password: 'senha123' },
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

    machineMimakiId = newId();
    await db.insert(machines).values({
      id: machineMimakiId,
      name: 'Mimaki CJV150',
      brand: 'Mimaki',
      model: 'CJV150-160',
      technology: 'Solvent',
    });
  });

  it('exclui um print_job individual via DELETE /api/jobs/:id', async () => {
    const jobId = newId();
    await db.insert(printJobs).values({
      id: jobId,
      jobId: 'HP-TEST-DEL-1',
      jobName: 'Banner Teste Excluir.pdf',
      machineId: machineHpId,
      ripType: 'hp-ews',
      pages: 1,
      sheets: 1,
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/jobs/${jobId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);

    const check = await db.select().from(printJobs).where(eq(printJobs.id, jobId)).get();
    expect(check).toBeUndefined();
  });

  it('exclui um mimaki_job e seu mimaki_test_job via DELETE /api/jobs/:id', async () => {
    const jobId = newId();
    await db.insert(mimakiJobs).values({
      id: jobId,
      machineId: machineMimakiId,
      folderTimestamp: '2026-10-08_120000',
      jobName: 'Adesivo_Mimaki_Teste.xml',
      orderCode: '31999',
      widthMm: 500,
      heightMm: 1000,
      lengthMeters: 1.0,
    });

    const testJobId = newId();
    await db.insert(mimakiTestJobs).values({
      id: testJobId,
      sourceFile: 'dummy.xml',
      keyFilename: 'Adesivo_Mimaki_Teste.xml',
      parsedOrderCode: '31999',
      result: 'OK',
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/jobs/${jobId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);

    const checkM = await db.select().from(mimakiJobs).where(eq(mimakiJobs.id, jobId)).get();
    expect(checkM).toBeUndefined();

    const checkTest = await db.select().from(mimakiTestJobs).where(eq(mimakiTestJobs.id, testJobId)).get();
    expect(checkTest).toBeUndefined();
  });

  it('retorna 404 ao tentar excluir job inexistente', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/jobs/job-inexistente`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('exclui múltiplos jobs em massa via POST /api/jobs/bulk-delete', async () => {
    const j1 = newId();
    const j2 = newId();
    const mj1 = newId();

    await db.insert(printJobs).values({
      id: j1,
      jobId: 'HP-BULK-DEL-1',
      jobName: 'Job Bulk 1.pdf',
      machineId: machineHpId,
      ripType: 'hp-ews',
    });

    await db.insert(printJobs).values({
      id: j2,
      jobId: 'HP-BULK-DEL-2',
      jobName: 'Job Bulk 2.pdf',
      machineId: machineHpId,
      ripType: 'hp-ews',
    });

    await db.insert(mimakiJobs).values({
      id: mj1,
      machineId: machineMimakiId,
      folderTimestamp: '2026-10-08_130000',
      jobName: 'Job Mimaki Bulk.xml',
      widthMm: 300,
      heightMm: 300,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs/bulk-delete',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        jobIds: [j1, j2, mj1],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBe(3);

    const checkP = await db.select().from(printJobs).all();
    expect(checkP.length).toBe(0);

    const checkM = await db.select().from(mimakiJobs).all();
    expect(checkM.length).toBe(0);
  });
});
